import type { Subprocess } from "bun";
import { dirname } from "node:path";
import { newSecret, log } from "./utils";

interface PendingRpcRequest {
  resolve: (res: any) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface StdioSession {
  sessionId: string;
  serverName: string;
  clientKey?: string;
  process: Subprocess;
  createdAt: number;
  lastActiveAt: number;
  onMessage?: (jsonLine: string) => void;
  onClose?: (reason: string) => void;
  graceTimer?: ReturnType<typeof setTimeout>;
  pendingRequests: Map<string | number, PendingRpcRequest>;
}

const activeSessions = new Map<string, StdioSession>();
const clientKeyToSessionId = new Map<string, string>();

function getDefaultExecutionEnv(customEnv: Record<string, string>): Record<string, string> {
  const cacheBase = process.env.CACHE_DIR || (process.env.DB_PATH ? dirname(process.env.DB_PATH) + "/cache" : "./data/cache");
  const merged: Record<string, string> = {
    PYTHONUNBUFFERED: "1",
    UV_CACHE_DIR: process.env.UV_CACHE_DIR || `${cacheBase}/uv`,
    GOCACHE: process.env.GOCACHE || `${cacheBase}/go-build`,
    GOPATH: process.env.GOPATH || `${cacheBase}/go`,
    BUN_INSTALL_CACHE_DIR: process.env.BUN_INSTALL_CACHE_DIR || `${cacheBase}/bun`,
    npm_config_cache: process.env.npm_config_cache || `${cacheBase}/npm`,
    ...(process.env as Record<string, string>),
    ...customEnv,
  };
  if (!merged.HOME && process.env.HOME) {
    merged.HOME = process.env.HOME;
  }
  return merged;
}

export function parseArgs(raw: string): string[] {
  if (!raw || !raw.trim()) return [];
  const trimmed = raw.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const arr = JSON.parse(trimmed);
      if (Array.isArray(arr)) return arr.map(String);
    } catch {}
  }
  const regex = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
  const args: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(trimmed)) !== null) {
    if (match[1] !== undefined) args.push(match[1]);
    else if (match[2] !== undefined) args.push(match[2]);
    else args.push(match[0]);
  }
  return args;
}

export function parseEnv(raw: string): Record<string, string> {
  if (!raw || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const res: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (v !== undefined && v !== null) res[k] = String(v);
      }
      return res;
    }
  } catch {}
  return {};
}

export function resolveCommandAndArgs(command: string, argsStr: string): string[] {
  const cmdParts = parseArgs(command);
  const args = parseArgs(argsStr);
  return [...cmdParts, ...args];
}

export function getActiveStdioSession(sessionId: string): StdioSession | null {
  const session = activeSessions.get(sessionId);
  if (!session) return null;
  session.lastActiveAt = Date.now();
  if (session.graceTimer) {
    clearTimeout(session.graceTimer);
    session.graceTimer = undefined;
  }
  return session;
}

export function getOrCreateStdioSession(
  serverName: string,
  command: string,
  argsStr: string,
  envStr: string,
  requestedSessionId?: string,
  clientKey?: string,
): StdioSession {
  if (requestedSessionId) {
    const existing = getActiveStdioSession(requestedSessionId);
    if (existing && existing.serverName === serverName) {
      if (clientKey) clientKeyToSessionId.set(clientKey, existing.sessionId);
      return existing;
    }
  }

  if (clientKey) {
    const mappedSessionId = clientKeyToSessionId.get(clientKey);
    if (mappedSessionId) {
      const existing = getActiveStdioSession(mappedSessionId);
      if (existing && existing.serverName === serverName) {
        return existing;
      }
      clientKeyToSessionId.delete(clientKey);
    }
  }

  const session = spawnStdioSession(serverName, command, argsStr, envStr, requestedSessionId, clientKey);
  if (clientKey) {
    clientKeyToSessionId.set(clientKey, session.sessionId);
  }
  return session;
}

export function spawnStdioSession(
  serverName: string,
  command: string,
  argsStr: string,
  envStr: string,
  existingSessionId?: string,
  clientKey?: string,
): StdioSession {
  const sessionId = existingSessionId || newSecret().slice(0, 16);
  const finalCmd = resolveCommandAndArgs(command || "bunx", argsStr);
  if (finalCmd.length === 0) finalCmd.push("bunx");
  const customEnv = parseEnv(envStr);
  const mergedEnv = getDefaultExecutionEnv(customEnv);

  log("stdio", `🚀 Menjalankan proses MCP [${serverName}] (session: ${sessionId}): ${finalCmd.join(" ")}`);

  const proc = Bun.spawn(finalCmd, {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    env: mergedEnv,
  });

  const session: StdioSession = {
    sessionId,
    serverName,
    clientKey,
    process: proc,
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    pendingRequests: new Map(),
  };

  activeSessions.set(sessionId, session);
  if (clientKey) clientKeyToSessionId.set(clientKey, sessionId);

  const cleanup = (reason: string) => {
    for (const [reqId, pending] of session.pendingRequests.entries()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(`Proses MCP [${serverName}] keluar (${reason}) sebelum menjawab request id=${reqId}`));
    }
    session.pendingRequests.clear();
    activeSessions.delete(sessionId);
    if (session.clientKey) clientKeyToSessionId.delete(session.clientKey);
  };

  // Background reader untuk stdout
  (async () => {
    try {
      const reader = proc.stdout.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          // 1. Cek apakah ini response JSON-RPC untuk request yang sedang menunggu
          try {
            const json = JSON.parse(trimmed);
            if (json && json.id !== undefined && session.pendingRequests.has(json.id)) {
              const pending = session.pendingRequests.get(json.id)!;
              session.pendingRequests.delete(json.id);
              clearTimeout(pending.timer);
              pending.resolve(json);
            }
          } catch {}

          // 2. Hubungkan ke listener onMessage (untuk SSE stream / logging)
          if (session.onMessage) {
            session.onMessage(trimmed);
          }
        }
      }

      if (buffer.trim()) {
        const trimmed = buffer.trim();
        try {
          const json = JSON.parse(trimmed);
          if (json && json.id !== undefined && session.pendingRequests.has(json.id)) {
            const pending = session.pendingRequests.get(json.id)!;
            session.pendingRequests.delete(json.id);
            clearTimeout(pending.timer);
            pending.resolve(json);
          }
        } catch {}
        if (session.onMessage) {
          session.onMessage(trimmed);
        }
      }
    } catch (err) {
      log("stdio", `[${serverName}:${sessionId}] Error membaca stdout: ${(err as Error).message}`);
    } finally {
      cleanup("stdout stream ended");
      if (session.onClose) session.onClose("stdout stream ended");
    }
  })();

  // Background reader untuk stderr
  (async () => {
    try {
      const reader = proc.stderr.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        log("stdio-err", `[${serverName}] ${text.trim()}`);
      }
    } catch {}
  })();

  // Handle proses exit
  proc.exited.then((code) => {
    log("stdio", `⏹ Proses MCP [${serverName}:${sessionId}] keluar dengan kode ${code}`);
    cleanup(`exit code ${code}`);
    if (session.onClose) session.onClose(`exit code ${code}`);
  });

  return session;
}

function writeToStdin(proc: Subprocess, data: string): boolean {
  const stdin = proc.stdin as unknown as { write?: (s: string) => void; flush?: () => void } | undefined;
  if (stdin && typeof stdin.write === "function") {
    stdin.write(data);
    if (typeof stdin.flush === "function") stdin.flush();
    return true;
  }
  return false;
}

export function sendJsonRpcToSession(session: StdioSession, data: string | object): boolean {
  try {
    session.lastActiveAt = Date.now();
    const payload = typeof data === "string" ? data.trim() : JSON.stringify(data);
    return writeToStdin(session.process, payload + "\n");
  } catch (err) {
    log("stdio", `Gagal mengirim ke stdin [${session.serverName}:${session.sessionId}]: ${(err as Error).message}`);
    return false;
  }
}

export async function executeJsonRpcOnSession(
  session: StdioSession,
  rpcData: any,
  timeoutMs = 45_000,
): Promise<any> {
  session.lastActiveAt = Date.now();
  if (session.graceTimer) {
    clearTimeout(session.graceTimer);
    session.graceTimer = undefined;
  }

  // Jika array batch JSON-RPC
  if (Array.isArray(rpcData)) {
    const promises = rpcData.map((item) => executeJsonRpcOnSession(session, item, timeoutMs));
    const results = await Promise.all(promises);
    return results.filter((r) => r !== null);
  }

  // Jika notification (tanpa id)
  if (!rpcData || rpcData.id === undefined) {
    sendJsonRpcToSession(session, rpcData);
    return null;
  }

  const reqId = rpcData.id;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      session.pendingRequests.delete(reqId);
      reject(new Error(`Timeout (${timeoutMs}ms) menunggu respon dari proses MCP [${session.serverName}] untuk method="${rpcData.method ?? 'unknown'}" id=${reqId}`));
    }, timeoutMs);

    session.pendingRequests.set(reqId, { resolve, reject, timer });

    const sent = sendJsonRpcToSession(session, rpcData);
    if (!sent) {
      clearTimeout(timer);
      session.pendingRequests.delete(reqId);
      reject(new Error(`Gagal mengirim data ke stdin proses MCP [${session.serverName}]`));
    }
  });
}

export function closeStdioSession(sessionId: string): void {
  const session = activeSessions.get(sessionId);
  if (!session) return;
  try {
    if (session.graceTimer) clearTimeout(session.graceTimer);
    session.process.kill();
  } catch {}
  activeSessions.delete(sessionId);
  if (session.clientKey) clientKeyToSessionId.delete(session.clientKey);
}

// Jadwalkan penutupan session jika klien disconnect (default idle 15 menit)
export function scheduleSessionGraceClose(sessionId: string, graceMs = 900_000): void {
  const session = activeSessions.get(sessionId);
  if (!session) return;
  if (session.graceTimer) clearTimeout(session.graceTimer);

  session.graceTimer = setTimeout(() => {
    log("stdio", `⏱ Sesi MCP [${session.serverName}:${sessionId}] ditutup setelah idle ${graceMs / 1000}s`);
    closeStdioSession(sessionId);
  }, graceMs);
}

// ─────────────────────────────────────────────────────────────────────────────
// Penguji Perintah Stdio / CLI (bunx, uv, go run, npx, python, dll.)
// ─────────────────────────────────────────────────────────────────────────────

export async function testStdioCommand(
  command: string,
  argsStr: string,
  envStr: string,
): Promise<{ ok: boolean; latencyMs: number; serverInfo?: any; error?: string }> {
  const start = performance.now();
  const finalCmd = resolveCommandAndArgs(command || "bunx", argsStr);
  if (finalCmd.length === 0) finalCmd.push("bunx");
  const customEnv = parseEnv(envStr);
  const mergedEnv = getDefaultExecutionEnv(customEnv);

  try {
    const proc = Bun.spawn(finalCmd, {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
      env: mergedEnv,
    });

    let stdoutBuffer = "";
    let stderrBuffer = "";
    let resolved = false;

    return await new Promise<{ ok: boolean; latencyMs: number; serverInfo?: any; error?: string }>((resolve) => {
      const timeout = setTimeout(() => {
        if (resolved) return;
        resolved = true;
        try { proc.kill(); } catch {}
        const latencyMs = Math.round(performance.now() - start);
        resolve({
          ok: false,
          latencyMs,
          error: `Timeout (15s) menunggu handshake JSON-RPC initialize. Output stderr: ${stderrBuffer.trim() || "(kosong)"}`,
        });
      }, 15000);

      // Tangani jika proses keluar terlalu awal (misal command gagal / error runtime)
      proc.exited.then((code) => {
        if (resolved) return;
        setTimeout(() => {
          if (resolved) return;
          resolved = true;
          clearTimeout(timeout);
          const latencyMs = Math.round(performance.now() - start);
          const errDetail = stderrBuffer.trim() ? ` Stderr: ${stderrBuffer.trim()}` : "";
          resolve({
            ok: false,
            latencyMs,
            error: `Proses keluar dengan kode ${code}.${errDetail || " (periksa perintah atau argumen)"}`,
          });
        }, 50);
      });

      // Reader stdout
      (async () => {
        try {
          const reader = proc.stdout.getReader();
          const decoder = new TextDecoder();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            stdoutBuffer += decoder.decode(value, { stream: true });
            const lines = stdoutBuffer.split("\n");
            stdoutBuffer = lines.pop() ?? "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) continue;
              try {
                const json = JSON.parse(trimmed);
                if (json.id === 1 && (json.result || json.error)) {
                  if (resolved) return;
                  resolved = true;
                  clearTimeout(timeout);
                  try { proc.kill(); } catch {}
                  const latencyMs = Math.round(performance.now() - start);

                  if (json.error) {
                    resolve({ ok: false, latencyMs, error: json.error.message || "Error saat initialize" });
                  } else {
                    resolve({
                      ok: true,
                      latencyMs,
                      serverInfo: json.result?.serverInfo ?? { name: finalCmd[0] || command },
                    });
                  }
                  return;
                }
              } catch {}
            }
          }
        } catch {}
      })();

      // Reader stderr
      (async () => {
        try {
          const reader = proc.stderr.getReader();
          const decoder = new TextDecoder();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            stderrBuffer += decoder.decode(value);
          }
        } catch {}
      })();

      // Kirim initialize JSON-RPC ke stdin
      setTimeout(() => {
        try {
          const initPayload = JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
              protocolVersion: "2024-11-05",
              capabilities: {},
              clientInfo: { name: "mcp-gateway-tester", version: "2.0" },
            },
          });
          const written = writeToStdin(proc, initPayload + "\n");
          if (!written) throw new Error("FileSink stdin tidak dapat ditulisi");
        } catch (err) {
          if (resolved) return;
          resolved = true;
          clearTimeout(timeout);
          try { proc.kill(); } catch {}
          resolve({
            ok: false,
            latencyMs: Math.round(performance.now() - start),
            error: `Gagal menulis ke stdin: ${(err as Error).message}`,
          });
        }
      }, 300);
    });
  } catch (err) {
    return {
      ok: false,
      latencyMs: Math.round(performance.now() - start),
      error: (err as Error).message,
    };
  }
}
