import {
  getAllMcpServers,
  getMcpServer,
  stmtGetAccessToken,
  stmtDeleteAccessToken,
  addActivityLog,
  getOAuthClient,
} from "./db";
import { LOG_SSE_CHUNKS } from "./config";
import { log, metaOf, elapsed, preview, publicOrigin, safeDecode } from "./utils";
import {
  spawnStdioSession,
  getActiveStdioSession,
  sendJsonRpcToSession,
  scheduleSessionGraceClose,
  testStdioCommand,
} from "./stdio-manager";

export interface CachedMcpServer {
  id: string;
  name: string;
  server_type: "http" | "command";
  url?: URL;
  headers: Headers;
  command: string;
  args: string;
  env_vars: string;
  enabled: boolean;
}

const serverCache = new Map<string, CachedMcpServer>();

export function reloadMcpCache(): void {
  serverCache.clear();
  const rows = getAllMcpServers();
  for (const row of rows) {
    try {
      let parsedUrl: URL | undefined = undefined;
      if (row.url) {
        try { parsedUrl = new URL(row.url); } catch {}
      }

      const headers = new Headers();
      try {
        const rawHeaders = JSON.parse(row.headers || "{}");
        if (rawHeaders && typeof rawHeaders === "object") {
          for (const [k, v] of Object.entries(rawHeaders)) {
            if (typeof v === "string") headers.set(k, v);
          }
        }
      } catch {}

      serverCache.set(row.id, {
        id: row.id,
        name: row.name,
        server_type: row.server_type ?? "http",
        url: parsedUrl,
        headers,
        command: row.command || "",
        args: row.args || "",
        env_vars: row.env_vars || "{}",
        enabled: row.enabled === 1,
      });
    } catch (err) {
      console.error(`[cache] Gagal memuat server MCP "${row.id}":`, (err as Error).message);
    }
  }
}

export function getCachedServer(id: string): CachedMcpServer | null {
  const cached = serverCache.get(id);
  if (cached) return cached;
  const row = getMcpServer(id);
  if (!row) return null;
  try {
    let parsedUrl: URL | undefined = undefined;
    if (row.url) {
      try { parsedUrl = new URL(row.url); } catch {}
    }

    const headers = new Headers();
    try {
      const rawHeaders = JSON.parse(row.headers || "{}");
      if (rawHeaders && typeof rawHeaders === "object") {
        for (const [k, v] of Object.entries(rawHeaders)) {
          if (typeof v === "string") headers.set(k, v);
        }
      }
    } catch {}

    const item: CachedMcpServer = {
      id: row.id,
      name: row.name,
      server_type: row.server_type ?? "http",
      url: parsedUrl,
      headers,
      command: row.command || "",
      args: row.args || "",
      env_vars: row.env_vars || "{}",
      enabled: row.enabled === 1,
    };
    serverCache.set(row.id, item);
    return item;
  } catch {
    return null;
  }
}

export function isValidBearer(header: string | null): boolean {
  if (!header) return false;
  const [scheme, token] = header.split(/\s+/, 2);
  if (scheme?.toLowerCase() !== "bearer" || !token) return false;
  const record = stmtGetAccessToken.get(token);
  if (!record) return false;
  if (record.expires_at <= Date.now()) {
    stmtDeleteAccessToken.run(token);
    return false;
  }
  // Pastikan klien pemilik token masih aktif (enabled)
  const client = getOAuthClient(record.client_id);
  if (!client || client.enabled !== 1) {
    return false;
  }
  return true;
}

const HOP_BY_HOP = [
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
];

function tapSse(body: ReadableStream<Uint8Array>, id: string, startedAt: number): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let chunks = 0;
  let bytes = 0;
  let ended = false;

  const finish = (reason: string) => {
    if (ended) return;
    ended = true;
    log(id, `⏹ SSE selesai (${reason}) chunks=${chunks} bytes=${bytes} durasi=${elapsed(startedAt)}`);
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          finish("upstream menutup stream");
          controller.close();
          return;
        }
        chunks++;
        bytes += value.byteLength;
        if (LOG_SSE_CHUNKS) {
          log(id, `≈ SSE chunk #${chunks} (${value.byteLength}B): ${preview(decoder.decode(value, { stream: true }))}`);
        }
        controller.enqueue(value);
      } catch (err) {
        finish(`error upstream: ${(err as Error).message}`);
        controller.error(err);
      }
    },
    cancel(reason) {
      finish("klien memutus koneksi");
      return reader.cancel(reason);
    },
  });
}

export async function proxyMcpRequest(ctx: {
  request: Request;
  server: Bun.Server<unknown> | null;
}): Promise<Response> {
  const { request, server } = ctx;
  const { id, startedAt } = metaOf(request);
  const url = new URL(request.url);

  // Verifikasi Bearer Token
  if (!isValidBearer(request.headers.get("authorization"))) {
    const hasToken = request.headers.has("authorization");
    log(id, `✗ 401 ${hasToken ? "access_token tidak valid/kedaluwarsa/klien dinonaktifkan" : "tidak ada Authorization header"}`);
    const metadataUrl = `${publicOrigin(request)}/.well-known/oauth-protected-resource${url.pathname}`;
    const res = Response.json(
      { error: "invalid_token", error_description: "Bearer token diperlukan atau klien telah dinonaktifkan" },
      {
        status: 401,
        headers: {
          "Cache-Control": "no-store",
          "WWW-Authenticate":
            `Bearer realm="mcp-gateway"${hasToken ? ', error="invalid_token"' : ""}, resource_metadata="${metadataUrl}"`,
        },
      },
    );
    addActivityLog(id, request.method, url.pathname, 401, performance.now() - startedAt, server?.requestIP(request)?.address, "Bearer token invalid / client disabled");
    return res;
  }

  // /mcp/:serverName/<rest>
  const [, , rawServerName = "", ...restSegments] = url.pathname.split("/");
  const serverName = safeDecode(rawServerName);
  const mcp = getCachedServer(serverName);

  if (!mcp) {
    log(id, `✗ 404 server MCP "${serverName}" tidak ditemukan di database`);
    const res = Response.json(
      { error: "unknown_server", error_description: `Server MCP "${serverName}" tidak terdaftar` },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
    addActivityLog(id, request.method, url.pathname, 404, performance.now() - startedAt, server?.requestIP(request)?.address, `Unknown MCP server "${serverName}"`);
    return res;
  }

  if (!mcp.enabled) {
    log(id, `✗ 503 server MCP "${serverName}" sedang dinonaktifkan`);
    const res = Response.json(
      { error: "server_disabled", error_description: `Server MCP "${serverName}" dinonaktifkan oleh administrator` },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
    addActivityLog(id, request.method, url.pathname, 503, performance.now() - startedAt, server?.requestIP(request)?.address, `Server "${serverName}" is disabled`);
    return res;
  }

  // Tanpa timeout Bun agar SSE & streaming berjalan mulus
  server?.timeout(request, 0);

  // ───────────────────────────────────────────────────────────────────────────
  // Branch A: Server MCP Bertipe "command" (bunx, npx, node, dll.)
  // ───────────────────────────────────────────────────────────────────────────
  if (mcp.server_type === "command") {
    const subPath = restSegments.join("/");
    const isPostMessage = request.method === "POST" && (subPath === "message" || subPath === "messages");

    // A1. POST /mcp/:serverName/message?sessionId=... -> teruskan ke stdin proses
    if (isPostMessage) {
      const sessionId = url.searchParams.get("sessionId") || request.headers.get("mcp-session-id");
      if (!sessionId) {
        return Response.json({ error: "missing_session_id", error_description: "sessionId query parameter diperlukan" }, { status: 400 });
      }

      const session = getActiveStdioSession(sessionId);
      if (!session) {
        return Response.json({ error: "session_not_found", error_description: `Sesi MCP "${sessionId}" tidak ditemukan atau telah berakhir` }, { status: 404 });
      }

      try {
        const textBody = await request.text();
        const sent = sendJsonRpcToSession(session, textBody);
        if (!sent) {
          return Response.json({ error: "write_failed", error_description: "Gagal menulis pesan ke proses MCP" }, { status: 500 });
        }
        addActivityLog(id, "POST", url.pathname, 202, performance.now() - startedAt, server?.requestIP(request)?.address, `Message to ${serverName} stdio (${sessionId})`);
        return new Response(JSON.stringify({ status: "accepted" }), {
          status: 202,
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        });
      } catch (err) {
        return Response.json({ error: "bad_request", error_description: (err as Error).message }, { status: 400 });
      }
    }

    // A2. GET /mcp/:serverName/sse atau GET /mcp/:serverName -> buka stream SSE
    const acceptHeader = request.headers.get("accept") ?? "";
    const isSseRequest = request.method === "GET" || acceptHeader.includes("text/event-stream") || subPath === "sse";

    if (isSseRequest) {
      log(id, `▶ Membuka sesi SSE untuk command MCP [${serverName}]`);
      const session = spawnStdioSession(serverName, mcp.command || "bunx", mcp.args, mcp.env_vars);
      const encoder = new TextEncoder();
      let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          // Event 1: endpoint untuk mengirim pesan balik (RFC / MCP SSE Specification)
          const endpointUrl = `${publicOrigin(request)}/mcp/${serverName}/message?sessionId=${session.sessionId}`;
          const initPayload = `event: endpoint\ndata: ${endpointUrl}\n\n`;
          controller.enqueue(encoder.encode(initPayload));

          // Hubungkan stdout listener
          session.onMessage = (jsonLine: string) => {
            try {
              if (LOG_SSE_CHUNKS) {
                log(id, `≈ MCP [${serverName}] stdout: ${preview(jsonLine)}`);
              }
              const sseMessage = `event: message\ndata: ${jsonLine}\n\n`;
              controller.enqueue(encoder.encode(sseMessage));
            } catch (err) {
              log(id, `Gagal enqueue SSE: ${(err as Error).message}`);
            }
          };

          session.onClose = (reason: string) => {
            log(id, `⏹ Sesi command [${serverName}] ditutup: ${reason}`);
            if (heartbeatTimer) clearInterval(heartbeatTimer);
            try { controller.close(); } catch {}
          };

          // Heartbeat ping setiap 15 detik agar koneksi tetap hidup
          heartbeatTimer = setInterval(() => {
            try {
              controller.enqueue(encoder.encode(`: ping\n\n`));
            } catch {
              if (heartbeatTimer) clearInterval(heartbeatTimer);
            }
          }, 15_000);
        },
        cancel() {
          log(id, `Klien memutus stream SSE [${serverName}:${session.sessionId}]`);
          if (heartbeatTimer) clearInterval(heartbeatTimer);
          scheduleSessionGraceClose(session.sessionId, 60_000);
        },
      });

      addActivityLog(id, "GET", url.pathname, 200, performance.now() - startedAt, server?.requestIP(request)?.address, `SSE stream connected to ${serverName} command`);

      return new Response(stream, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          "Connection": "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    }

    // A3. Direct POST JSON-RPC tanpa SSE (Streamable HTTP fallback)
    if (request.method === "POST") {
      try {
        const bodyText = await request.text();
        const testRes = await testStdioCommand(mcp.command || "bunx", mcp.args, mcp.env_vars);
        return Response.json(testRes, { status: 200 });
      } catch (err) {
        return Response.json({ error: (err as Error).message }, { status: 500 });
      }
    }

    return Response.json({ error: "method_not_allowed" }, { status: 405 });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Branch B: Server MCP Bertipe "http" (Upstream HTTP / SSE Proxy)
  // ───────────────────────────────────────────────────────────────────────────
  if (!mcp.url) {
    return Response.json({ error: "no_upstream_url", error_description: "Server HTTP tidak memiliki URL valid" }, { status: 500 });
  }

  const base = mcp.url;
  const target = new URL(base);
  target.pathname = base.pathname.replace(/\/+$/, "") + (restSegments.length ? `/${restSegments.join("/")}` : "");
  target.search = url.search;

  const headers = new Headers(request.headers);
  for (const h of [...HOP_BY_HOP, "host", "authorization", "content-length"]) headers.delete(h);
  const contentLength = request.headers.get("content-length");
  if (contentLength && request.body) headers.set("content-length", contentLength);
  headers.set("accept-encoding", "identity");
  mcp.headers.forEach((value, key) => headers.set(key, value));
  headers.set("x-forwarded-host", url.host);
  headers.set("x-forwarded-proto", url.protocol.replace(":", ""));
  const clientIp = server?.requestIP(request)?.address;
  if (clientIp) {
    const prior = request.headers.get("x-forwarded-for");
    headers.set("x-forwarded-for", prior ? `${prior}, ${clientIp}` : clientIp);
  }

  const hasBody = request.body !== null && request.method !== "GET" && request.method !== "HEAD";
  log(
    id,
    `→ ${request.method} ${serverName} ⇒ ${target.origin}${target.pathname}${target.search} ` +
      `inject=[${[...mcp.headers.keys()].join(",")}] ` +
      `accept=${request.headers.get("accept") ?? "-"} content-type=${request.headers.get("content-type") ?? "-"}`,
  );

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? request.body : undefined,
      redirect: "manual",
      signal: request.signal,
      // @ts-expect-error duplex exists in bun
      duplex: "half",
    });
  } catch (err) {
    const reason = (err as Error).message;
    if (request.signal.aborted) {
      log(id, `✗ klien membatalkan request sebelum upstream menjawab (${elapsed(startedAt)})`);
      return new Response(null, { status: 499 });
    }
    log(id, `✗ 502 gagal menghubungi upstream ${target.origin}: ${reason} (${elapsed(startedAt)})`);
    const res = Response.json(
      { error: "bad_gateway", error_description: `Server MCP "${serverName}" tidak dapat dihubungi (${reason})` },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
    addActivityLog(id, request.method, url.pathname, 502, performance.now() - startedAt, clientIp, `Upstream error: ${reason}`);
    return res;
  }

  const resHeaders = new Headers(upstream.headers);
  for (const h of HOP_BY_HOP) resHeaders.delete(h);
  if (resHeaders.has("content-encoding")) {
    resHeaders.delete("content-encoding");
    resHeaders.delete("content-length");
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  const isSse = contentType.includes("text/event-stream");
  log(
    id,
    `← ${upstream.status} dari upstream content-type=${contentType || "-"} (${elapsed(startedAt)})`,
  );

  addActivityLog(id, request.method, url.pathname, upstream.status, performance.now() - startedAt, clientIp, `Forwarded to ${serverName}`);

  if (isSse && upstream.body) {
    resHeaders.set("cache-control", "no-cache, no-transform");
    resHeaders.set("x-accel-buffering", "no");
    log(id, "▶ SSE stream dibuka");
    return new Response(tapSse(upstream.body, id, startedAt), {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: resHeaders,
    });
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: resHeaders,
  });
}

export async function testMcpServerConnection(
  targetUrl: string,
  headersJson: string,
): Promise<{ ok: boolean; status?: number; statusText?: string; latencyMs: number; error?: string }> {
  const start = performance.now();
  try {
    const url = new URL(targetUrl);
    const headers = new Headers();
    try {
      const parsed = JSON.parse(headersJson || "{}");
      if (parsed && typeof parsed === "object") {
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof v === "string") headers.set(k, v);
        }
      }
    } catch {}

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const latencyMs = Math.round(performance.now() - start);

    return {
      ok: res.status < 500,
      status: res.status,
      statusText: res.statusText,
      latencyMs,
    };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - start);
    return {
      ok: false,
      latencyMs,
      error: (err as Error).message,
    };
  }
}
