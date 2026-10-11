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
  getOrCreateStdioSession,
  executeJsonRpcOnSession,
  sendJsonRpcToSession,
  scheduleSessionGraceClose,
  closeStdioSession,
  testStdioCommand,
} from "./stdio-manager";
import { detectServerBranding } from "./icons";

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
  icon: string;
}

const serverCache = new Map<string, CachedMcpServer>();

export function getServerIconUrl(
  mcp: CachedMcpServer | { id: string; name?: string; icon?: string } | string,
  origin: string,
  format: "png" | "svg" | "auto" = "auto",
): string {
  const name = typeof mcp === "string" ? mcp : mcp.id;
  const customIcon = typeof mcp === "object" ? (mcp as { icon?: string }).icon : undefined;
  if (customIcon && customIcon.trim()) {
    const isUrl = customIcon.startsWith("http://") || customIcon.startsWith("https://") || customIcon.startsWith("data:");
    if (isUrl) return customIcon;
    return `${origin}${customIcon.startsWith("/") ? "" : "/"}${customIcon}`;
  }
  const branding = detectServerBranding(name, typeof mcp === "object" ? mcp.name : undefined);
  const targetUrl = format === "png" ? branding.iconPngUrl : branding.iconUrl;
  return targetUrl.startsWith("http://") || targetUrl.startsWith("https://") || targetUrl.startsWith("data:")
    ? targetUrl
    : `${origin}${targetUrl}`;
}

export function enrichServerInfoWithIcons<T extends string | Record<string, any>>(input: T, serverName: string, origin: string): T {
  const isString = typeof input === "string";
  try {
    if (isString && !input.includes('"serverInfo"') && !input.includes('"protocolVersion"')) {
      return input;
    }
    const parsed = isString ? JSON.parse(input) : JSON.parse(JSON.stringify(input));
    const targetObj = parsed?.result?.serverInfo || (parsed?.serverInfo ? parsed.serverInfo : null);
    if (targetObj) {
      if (!targetObj.icons || !Array.isArray(targetObj.icons) || targetObj.icons.length === 0) {
        const mcp = getCachedServer(serverName);
        const pngUrl = getServerIconUrl(mcp || serverName, origin, "png");
        const svgUrl = getServerIconUrl(mcp || serverName, origin, "svg");
        targetObj.icons = [
          {
            src: pngUrl,
            mimeType: "image/png",
            sizes: ["256x256"],
          },
          {
            src: `${origin}/logo.png`,
            mimeType: "image/png",
            sizes: ["256x256"],
          },
          {
            src: svgUrl,
            mimeType: "image/svg+xml",
            sizes: ["any"],
          },
        ];
        if (!targetObj.icon) {
          targetObj.icon = pngUrl;
        }
        return (isString ? JSON.stringify(parsed) : parsed) as T;
      }
    }
  } catch {}
  return input;
}

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
        icon: row.icon || "",
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
      icon: row.icon || "",
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

function tapSse(
  body: ReadableStream<Uint8Array>,
  id: string,
  startedAt: number,
  serverName?: string,
  origin?: string,
): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
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
        const decoded = decoder.decode(value, { stream: true });
        if (LOG_SSE_CHUNKS) {
          log(id, `≈ SSE chunk #${chunks} (${value.byteLength}B): ${preview(decoded)}`);
        }

        if (serverName && origin && decoded.includes('"serverInfo"')) {
          const lines = decoded.split("\n");
          const modified = lines
            .map((line) => {
              if (line.startsWith("data:") && line.includes('"serverInfo"')) {
                const dataText = line.slice(5).trim();
                const enriched = enrichServerInfoWithIcons(dataText, serverName, origin);
                return `data: ${enriched}`;
              }
              return line;
            })
            .join("\n");
          controller.enqueue(encoder.encode(modified));
        } else {
          controller.enqueue(value);
        }
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
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.split(/\s+/)[1] ?? "anon";
    const clientKey = `${serverName}:${token}`;
    const reqSessionId = request.headers.get("mcp-session-id") || url.searchParams.get("sessionId") || undefined;

    // A1. DELETE /mcp/:serverName -> Tutup sesi (Streamable HTTP Session Termination)
    if (request.method === "DELETE") {
      if (reqSessionId) closeStdioSession(reqSessionId);
      return new Response(null, {
        status: 204,
        headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Expose-Headers": "Mcp-Session-Id" },
      });
    }

    // A2. POST /mcp/:serverName/message?sessionId=... -> Teruskan ke stdin (Legacy SSE Transport)
    const isLegacyPostMessage = request.method === "POST" && (subPath === "message" || subPath === "messages");
    if (isLegacyPostMessage) {
      const sessionId = reqSessionId;
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
        addActivityLog(id, "POST", url.pathname, 202, performance.now() - startedAt, server?.requestIP(request)?.address, `Legacy SSE message to ${serverName} stdio (${sessionId})`);
        return new Response(JSON.stringify({ status: "accepted" }), {
          status: 202,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Expose-Headers": "Mcp-Session-Id",
          },
        });
      } catch (err) {
        return Response.json({ error: "bad_request", error_description: (err as Error).message }, { status: 400 });
      }
    }

    // A3. GET /mcp/:serverName/sse atau GET /mcp/:serverName -> Buka stream SSE (Legacy SSE Handshake)
    const acceptHeader = request.headers.get("accept") ?? "";
    const isLegacySseHandshake = request.method === "GET" && (acceptHeader.includes("text/event-stream") || subPath === "sse" || subPath === "");

    if (isLegacySseHandshake) {
      log(id, `▶ Membuka sesi SSE (Legacy) untuk command MCP [${serverName}]`);
      const session = getOrCreateStdioSession(serverName, mcp.command || "bunx", mcp.args, mcp.env_vars, reqSessionId, clientKey);
      const encoder = new TextEncoder();
      let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          // Event 1: endpoint untuk mengirim pesan balik (Legacy SSE Specification)
          const endpointUrl = `${publicOrigin(request)}/mcp/${serverName}/message?sessionId=${session.sessionId}`;
          const initPayload = `event: endpoint\ndata: ${endpointUrl}\n\n`;
          controller.enqueue(encoder.encode(initPayload));

          // Hubungkan stdout listener
          session.onMessage = (jsonLine: string) => {
            try {
              if (LOG_SSE_CHUNKS) {
                log(id, `≈ MCP [${serverName}] stdout: ${preview(jsonLine)}`);
              }
              const enriched = enrichServerInfoWithIcons(jsonLine, serverName, publicOrigin(request));
              const sseMessage = `event: message\ndata: ${enriched}\n\n`;
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
          "Mcp-Session-Id": session.sessionId,
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Expose-Headers": "Mcp-Session-Id",
        },
      });
    }

    // A4. POST /mcp/:serverName -> Streamable HTTP Transport (Google Gemini, Claude, modern MCP clients)
    if (request.method === "POST") {
      try {
        const textBody = await request.text();
        let rpcData: any;
        try {
          rpcData = JSON.parse(textBody);
        } catch {
          return Response.json(
            { jsonrpc: "2.0", error: { code: -32700, message: "Parse error" }, id: null },
            { status: 400, headers: { "Access-Control-Allow-Origin": "*" } },
          );
        }

        const method = Array.isArray(rpcData) ? "batch" : (rpcData?.method ?? "response");
        log(id, `▶ [Streamable HTTP] POST /mcp/${serverName} method=${method} id=${rpcData?.id ?? "notif"}`);

        const session = getOrCreateStdioSession(serverName, mcp.command || "bunx", mcp.args, mcp.env_vars, reqSessionId, clientKey);

        const rpcResult = await executeJsonRpcOnSession(session, rpcData, 45_000);

        // Jika rpcResult === null (artinya notification, misal: notifications/initialized)
        if (rpcResult === null) {
          addActivityLog(id, "POST", url.pathname, 202, performance.now() - startedAt, server?.requestIP(request)?.address, `Notification accepted for ${serverName}`);
          return new Response(JSON.stringify({ status: "accepted" }), {
            status: 202,
            headers: {
              "Content-Type": "application/json",
              "Mcp-Session-Id": session.sessionId,
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Expose-Headers": "Mcp-Session-Id",
              "Cache-Control": "no-store",
            },
          });
        }

        // Perkayaan ikon jika ini handshake initialize
        const enriched = enrichServerInfoWithIcons(rpcResult, serverName, publicOrigin(request));
        addActivityLog(id, "POST", url.pathname, 200, performance.now() - startedAt, server?.requestIP(request)?.address, `Streamable HTTP ${method} ok for ${serverName}`);

        // Jika client hanya menerima text/event-stream (request-scoped SSE per spec)
        const wantsSseOnly = acceptHeader.includes("text/event-stream") && !acceptHeader.includes("application/json") && !acceptHeader.includes("*/*");
        if (wantsSseOnly) {
          return new Response(`event: message\ndata: ${JSON.stringify(enriched)}\n\n`, {
            status: 200,
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              "Mcp-Session-Id": session.sessionId,
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Expose-Headers": "Mcp-Session-Id",
            },
          });
        }

        return new Response(JSON.stringify(enriched), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Mcp-Session-Id": session.sessionId,
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Expose-Headers": "Mcp-Session-Id",
            "Cache-Control": "no-store",
          },
        });
      } catch (err) {
        log(id, `✗ Streamable HTTP error [${serverName}]: ${(err as Error).message}`);
        addActivityLog(id, "POST", url.pathname, 500, performance.now() - startedAt, server?.requestIP(request)?.address, (err as Error).message);
        return Response.json(
          {
            jsonrpc: "2.0",
            error: { code: -32603, message: (err as Error).message },
            id: null,
          },
          {
            status: 500,
            headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Expose-Headers": "Mcp-Session-Id" },
          },
        );
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
  resHeaders.set("Access-Control-Allow-Origin", "*");
  resHeaders.set("Access-Control-Expose-Headers", "Mcp-Session-Id");

  const contentType = upstream.headers.get("content-type") ?? "";
  const isSse = contentType.includes("text/event-stream");
  log(
    id,
    `← ${upstream.status} dari upstream content-type=${contentType || "-"} (${elapsed(startedAt)})`,
  );

  addActivityLog(id, request.method, url.pathname, upstream.status, performance.now() - startedAt, clientIp, `Forwarded to ${serverName}`);

  const origin = publicOrigin(request);

  if (isSse && upstream.body) {
    resHeaders.set("cache-control", "no-cache, no-transform");
    resHeaders.set("x-accel-buffering", "no");
    log(id, "▶ SSE stream dibuka");
    return new Response(tapSse(upstream.body, id, startedAt, serverName, origin), {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: resHeaders,
    });
  }

  if (contentType.includes("application/json") && upstream.body) {
    try {
      const text = await upstream.text();
      const enriched = enrichServerInfoWithIcons(text, serverName, origin);
      return new Response(enriched, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: resHeaders,
      });
    } catch {}
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
