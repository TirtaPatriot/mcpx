import type { Subprocess } from "bun";
import { newSecret, log } from "./utils";

export interface StdioSession {
  sessionId: string;
  serverName: string;
  process: Subprocess;
  createdAt: number;
  lastActiveAt: number;
  onMessage?: (jsonLine: string) => void;
  onClose?: (reason: string) => void;
  graceTimer?: ReturnType<typeof setTimeout>;
}

const activeSessions = new Map<string, StdioSession>();

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

export function spawnStdioSession(
  serverName: string,
  command: string,
  argsStr: string,
  envStr: string,
  existingSessionId?: string,
): StdioSession {
  const sessionId = existingSessionId || newSecret().slice(0, 16);
  const args = parseArgs(argsStr);
  const customEnv = parseEnv(envStr);

  const mergedEnv = {
    ...process.env,
    ...customEnv,
  };

  log("stdio", `🚀 Menjalankan proses MCP [${serverName}] (session: ${sessionId}): ${command} ${args.join(" ")}`);

  const proc = Bun.spawn([command, ...args], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    env: mergedEnv,
  });

  const session: StdioSession = {
    sessionId,
    serverName,
    process: proc,
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
  };

  activeSessions.set(sessionId, session);

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
          if (trimmed && session.onMessage) {
            session.onMessage(trimmed);
          }
        }
      }

      if (buffer.trim() && session.onMessage) {
        session.onMessage(buffer.trim());
      }
    } catch (err) {
      log("stdio", `[${serverName}:${sessionId}] Error membaca stdout: ${(err as Error).message}`);
    } finally {
      if (session.onClose) session.onClose("stdout stream ended");
    }
  })();

  // Background reader untuk stderr (berguna untuk debug Dokploy / npm output)
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
    activeSessions.delete(sessionId);
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

export function closeStdioSession(sessionId: string): void {
  const session = activeSessions.get(sessionId);
  if (!session) return;
  try {
    if (session.graceTimer) clearTimeout(session.graceTimer);
    session.process.kill();
  } catch {}
  activeSessions.delete(sessionId);
}

// Jadwalkan penutupan session jika klien disconnect (dengan grace period 60 detik)
export function scheduleSessionGraceClose(sessionId: string, graceMs = 60_000): void {
  const session = activeSessions.get(sessionId);
  if (!session) return;
  if (session.graceTimer) clearTimeout(session.graceTimer);

  session.graceTimer = setTimeout(() => {
    log("stdio", `⏱ Sesi MCP [${session.serverName}:${sessionId}] ditutup setelah idle ${graceMs / 1000}s`);
    closeStdioSession(sessionId);
  }, graceMs);
}

// ─────────────────────────────────────────────────────────────────────────────
// Penguji Perintah Stdio / NPM (bunx / npx)
// ─────────────────────────────────────────────────────────────────────────────

export async function testStdioCommand(
  command: string,
  argsStr: string,
  envStr: string,
): Promise<{ ok: boolean; latencyMs: number; serverInfo?: any; error?: string }> {
  const start = performance.now();
  const args = parseArgs(argsStr);
  const customEnv = parseEnv(envStr);

  try {
    const proc = Bun.spawn([command, ...args], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, ...customEnv },
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
          error: `Timeout (8s) menunggu handshake JSON-RPC initialize. Output stderr: ${stderrBuffer.trim() || "(kosong)"}`,
        });
      }, 8000);

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
                      serverInfo: json.result?.serverInfo ?? { name: command },
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
