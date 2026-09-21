import { Elysia } from "elysia";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

// ─────────────────────────────────────────────────────────────────────────────
// Konfigurasi
// ─────────────────────────────────────────────────────────────────────────────

const fatal = (msg: string): never => {
  console.error(`[config] ${msg}`);
  process.exit(1);
};

const PORT = Number(process.env.PORT ?? 3000);
const CLIENT_ID = process.env.CLIENT_ID || fatal("CLIENT_ID belum di-set");
const CLIENT_SECRET = process.env.CLIENT_SECRET || fatal("CLIENT_SECRET belum di-set");
const ACCESS_TOKEN_TTL_MS = Number(process.env.ACCESS_TOKEN_TTL ?? 3600) * 1000;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 3600 * 1000;
const AUTH_CODE_TTL_MS = 5 * 60 * 1000;
const LOG_SSE_CHUNKS = (process.env.LOG_SSE_CHUNKS ?? "true") !== "false";

// redirect_uri harus https dan hostnya (atau subdomain-nya) ada di daftar ini.
const ALLOWED_REDIRECT_HOSTS = (process.env.ALLOWED_REDIRECT_HOSTS ?? "google.com")
  .split(",")
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);
const DEFAULT_REDIRECT_URI = "https://google.com";

// URL publik gateway (origin saja) untuk metadata discovery. Bila kosong, diturunkan dari header Host/X-Forwarded-*.
const PUBLIC_URL = (() => {
  const raw = process.env.PUBLIC_URL?.trim();
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (url.pathname !== "/" || url.search || url.hash) throw new Error("hanya origin, tanpa path");
    return url.origin;
  } catch (err) {
    return fatal(`PUBLIC_URL tidak valid (contoh: https://gateway.example.com): ${(err as Error).message}`);
  }
})();

interface McpServer {
  url: URL;
  /** Header tetap yang dikirim ke server ini (mis. Authorization milik server MCP). */
  headers: Headers;
}

/**
 * MCP_SERVERS: { "nama": "http://url" }
 *           atau { "nama": { "url": "http://url", "headers": { "Authorization": "Bearer xxx" } } }
 */
function parseServers(raw: string | undefined): Map<string, McpServer> {
  if (!raw) return fatal('MCP_SERVERS belum di-set, contoh: {"filesystem":"http://host.docker.internal:3001"}');

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return fatal(`MCP_SERVERS bukan JSON valid: ${(err as Error).message}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return fatal("MCP_SERVERS harus berupa objek JSON { nama: url }");
  }

  const servers = new Map<string, McpServer>();
  for (const [name, entry] of Object.entries(parsed)) {
    try {
      const spec: { url?: unknown; headers?: unknown } =
        entry && typeof entry === "object" ? entry : { url: entry };
      const url = new URL(String(spec.url));
      if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("protokol harus http/https");

      const headers = new Headers();
      const rawHeaders = spec.headers ?? {};
      if (typeof rawHeaders !== "object" || Array.isArray(rawHeaders)) throw new Error("headers harus berupa objek");
      for (const [key, value] of Object.entries(rawHeaders)) {
        if (typeof value !== "string") throw new Error(`nilai header "${key}" harus string`);
        headers.set(key, value); // melempar error bila nama/nilai header tidak valid
      }
      servers.set(name, { url, headers });
    } catch (err) {
      return fatal(`MCP_SERVERS["${name}"] tidak valid: ${(err as Error).message}`);
    }
  }
  if (servers.size === 0) return fatal("MCP_SERVERS kosong");
  return servers;
}

const MCP_SERVERS = parseServers(process.env.MCP_SERVERS);

// ─────────────────────────────────────────────────────────────────────────────
// Logging
// ─────────────────────────────────────────────────────────────────────────────

const log = (id: string, msg: string) => console.log(`${new Date().toISOString()} [${id}] ${msg}`);

const SENSITIVE_PARAMS = new Set(["code", "client_secret", "code_verifier", "access_token", "refresh_token"]);

/** Path + query untuk log, dengan nilai parameter sensitif disamarkan. */
function safePath(url: URL): string {
  const params = new URLSearchParams(url.search);
  for (const key of [...params.keys()]) {
    if (SENSITIVE_PARAMS.has(key)) params.set(key, "REDACTED");
  }
  const qs = params.toString();
  return url.pathname + (qs ? `?${qs}` : "");
}

const preview = (text: string, max = 200) => {
  const flat = text.replace(/\r?\n/g, "⏎");
  return flat.length > max ? `${flat.slice(0, max)}…(+${flat.length - max})` : flat;
};

const reqMeta = new WeakMap<Request, { id: string; startedAt: number }>();
const metaOf = (request: Request) => reqMeta.get(request) ?? { id: "-", startedAt: performance.now() };
const elapsed = (startedAt: number) => `${(performance.now() - startedAt).toFixed(1)}ms`;

// ─────────────────────────────────────────────────────────────────────────────
// Penyimpanan OAuth (in-memory; restart = semua token hangus)
// ─────────────────────────────────────────────────────────────────────────────

interface AuthCode {
  clientId: string;
  redirectUri: string;
  redirectUriExplicit: boolean;
  codeChallenge?: string;
  expiresAt: number;
}

const authCodes = new Map<string, AuthCode>();
const accessTokens = new Map<string, number>(); // token -> expiresAt
const refreshTokens = new Map<string, number>(); // token -> expiresAt

const newSecret = () => randomBytes(32).toString("base64url");

setInterval(() => {
  const now = Date.now();
  for (const store of [authCodes, accessTokens, refreshTokens] as Map<string, { expiresAt: number } | number>[]) {
    for (const [key, value] of store) {
      if ((typeof value === "number" ? value : value.expiresAt) <= now) store.delete(key);
    }
  }
}, 60_000).unref();

function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

function isValidBearer(header: string | null): boolean {
  if (!header) return false;
  const [scheme, token] = header.split(/\s+/, 2);
  if (scheme?.toLowerCase() !== "bearer" || !token) return false;
  const expiresAt = accessTokens.get(token);
  if (!expiresAt) return false;
  if (expiresAt <= Date.now()) {
    accessTokens.delete(token);
    return false;
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper OAuth
// ─────────────────────────────────────────────────────────────────────────────

const str = (v: unknown): string | undefined => (typeof v === "string" && v !== "" ? v : undefined);

const asRecord = (body: unknown): Record<string, unknown> =>
  body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};

const noStore = { "Cache-Control": "no-store", Pragma: "no-cache" };

const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(data, { status, headers: { ...noStore, ...headers } });

const oauthError = (error: string, description: string, status = 400, headers: Record<string, string> = {}) =>
  json({ error, error_description: description }, status, headers);

const safeDecode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/** Kredensial klien dari HTTP Basic (prioritas) atau body request. */
function clientCredentials(request: Request, body: Record<string, unknown>) {
  const auth = request.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("basic ")) {
    const decoded = Buffer.from(auth.slice(6).trim(), "base64").toString("utf8");
    const sep = decoded.indexOf(":");
    if (sep >= 0) {
      return {
        id: safeDecode(decoded.slice(0, sep)),
        secret: safeDecode(decoded.slice(sep + 1)),
        via: "basic" as const,
      };
    }
  }
  const id = str(body.client_id);
  const secret = str(body.client_secret);
  return id && secret ? { id, secret, via: "body" as const } : null;
}

function parseRedirectUri(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  const allowed = ALLOWED_REDIRECT_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  return allowed ? url : null;
}

/** Origin publik gateway: PUBLIC_URL, atau diturunkan dari header request (di belakang reverse proxy/tunnel). */
function publicOrigin(request: Request): string {
  if (PUBLIC_URL) return PUBLIC_URL;
  const first = (name: string) => request.headers.get(name)?.split(",")[0]?.trim() || undefined;
  const url = new URL(request.url);
  const proto = first("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host = first("x-forwarded-host") ?? first("host") ?? url.host;
  return `${proto}://${host}`;
}

function verifyPkce(verifier: string | undefined, challenge: string): boolean {
  if (!verifier) return false;
  const computed = createHash("sha256").update(verifier).digest("base64url");
  return safeEqual(computed, challenge);
}

interface AuthorizeParams {
  clientId: string;
  redirectUri: URL;
  redirectUriExplicit: boolean;
  state?: string;
  scope?: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
}

/** Validasi parameter authorize; dipakai GET (tampilkan form) dan POST (terbitkan code). */
function parseAuthorizeParams(get: (key: string) => string | undefined): AuthorizeParams | string {
  if (get("response_type") !== "code") return "response_type harus 'code'";
  const clientId = get("client_id");
  if (!clientId || !safeEqual(clientId, CLIENT_ID)) return "client_id tidak dikenal";

  const rawRedirect = get("redirect_uri");
  const redirectUri = parseRedirectUri(rawRedirect ?? DEFAULT_REDIRECT_URI);
  if (!redirectUri) {
    return `redirect_uri tidak diizinkan (harus https dan host di: ${ALLOWED_REDIRECT_HOSTS.join(", ")})`;
  }

  const codeChallenge = get("code_challenge");
  const codeChallengeMethod = get("code_challenge_method");
  if (codeChallenge && codeChallengeMethod !== "S256") return "code_challenge_method harus 'S256'";

  return {
    clientId,
    redirectUri,
    redirectUriExplicit: rawRedirect !== undefined,
    state: get("state"),
    scope: get("scope"),
    codeChallenge,
    codeChallengeMethod,
  };
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const htmlHeaders = { "Content-Type": "text/html; charset=utf-8", "X-Frame-Options": "DENY", ...noStore };

const PAGE_STYLE = `
  :root { color-scheme: light dark; }
  body { font: 16px/1.5 system-ui, sans-serif; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 16px; box-sizing: border-box; }
  main { max-width: 26rem; width: 100%; }
  h1 { font-size: 1.25rem; margin: 0 0 .5rem; }
  p { margin: 0 0 1rem; }
  code { background: #8882; padding: .1em .35em; border-radius: 4px; }
  .row { display: flex; gap: .5rem; }
  button { font: inherit; padding: .6rem 1rem; border-radius: 8px; border: 1px solid #8886; background: transparent; cursor: pointer; }
  button.primary { background: #1a73e8; border-color: #1a73e8; color: #fff; flex: 1; }
`;

const page = (title: string, body: string, status = 200) =>
  new Response(
    `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${PAGE_STYLE}</style></head><body><main>${body}</main></body></html>`,
    { status, headers: htmlHeaders },
  );

function consentPage(p: AuthorizeParams) {
  const hidden: Record<string, string | undefined> = {
    response_type: "code",
    client_id: p.clientId,
    redirect_uri: p.redirectUriExplicit ? p.redirectUri.toString() : undefined,
    state: p.state,
    scope: p.scope,
    code_challenge: p.codeChallenge,
    code_challenge_method: p.codeChallengeMethod,
  };
  const inputs = Object.entries(hidden)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `<input type="hidden" name="${k}" value="${esc(v!)}">`)
    .join("");

  return page(
    "Izinkan Akses",
    `<h1>Izinkan akses ke MCP Gateway?</h1>
     <p>Aplikasi dengan client <code>${esc(p.clientId)}</code> meminta akses ke server MCP Anda dan akan diarahkan ke <code>${esc(p.redirectUri.origin)}</code>.</p>
     <form method="post" action="/oauth/authorize">${inputs}
       <div class="row">
         <button type="submit" name="decision" value="deny">Tolak</button>
         <button type="submit" name="decision" value="allow" class="primary">Izinkan Akses</button>
       </div>
     </form>`,
  );
}

const redirectTo = (url: URL) =>
  new Response(null, { status: 303, headers: { Location: url.toString(), ...noStore } });

// ─────────────────────────────────────────────────────────────────────────────
// Reverse proxy
// ─────────────────────────────────────────────────────────────────────────────

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

/** Bungkus body SSE untuk logging tiap chunk & mendeteksi siapa yang memutus koneksi. */
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

const metadataHeaders = { "Access-Control-Allow-Origin": "*" };

function oauthProtectedResource({ request }: { request: Request }): Response {
  const { id } = metaOf(request);
  const origin = publicOrigin(request);
  const suffix = new URL(request.url).pathname.slice("/.well-known/oauth-protected-resource".length);

  // Tanpa suffix = gateway secara umum; dengan suffix harus menunjuk /mcp/<server yang dikenal>/...
  if (suffix) {
    const serverName = suffix.match(/^\/mcp\/([^/]+)/)?.[1];
    if (!serverName || !MCP_SERVERS.has(safeDecode(serverName))) {
      log(id, `✗ 404 resource metadata untuk path tidak dikenal: ${suffix}`);
      return json({ error: "not_found" }, 404, metadataHeaders);
    }
  }
  log(id, `• discovery: protected resource ${origin}${suffix}`);
  return json(
    { resource: `${origin}${suffix}`, authorization_servers: [origin], bearer_methods_supported: ["header"] },
    200,
    metadataHeaders,
  );
}

function oauthServerMetadata({ request }: { request: Request }): Response {
  const { id } = metaOf(request);
  const origin = publicOrigin(request);
  log(id, `• discovery: authorization server metadata issuer=${origin}`);
  return json(
    {
      issuer: origin,
      authorization_endpoint: `${origin}/oauth/authorize`,
      token_endpoint: `${origin}/oauth/token`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"],
    },
    200,
    metadataHeaders,
  );
}

async function proxy(ctx: { request: Request; server: Bun.Server<unknown> | null }): Promise<Response> {
  const { request, server } = ctx;
  const { id, startedAt } = metaOf(request);
  const url = new URL(request.url);

  if (!isValidBearer(request.headers.get("authorization"))) {
    const hasToken = request.headers.has("authorization");
    log(id, `✗ 401 ${hasToken ? "access_token tidak valid/kedaluwarsa" : "tidak ada Authorization header"}`);
    // resource_metadata (RFC 9728) menuntun klien MCP ke discovery OAuth.
    const metadataUrl = `${publicOrigin(request)}/.well-known/oauth-protected-resource${url.pathname}`;
    return json({ error: "invalid_token", error_description: "Bearer token diperlukan" }, 401, {
      "WWW-Authenticate":
        `Bearer realm="mcp-gateway"${hasToken ? ', error="invalid_token"' : ""}, resource_metadata="${metadataUrl}"`,
    });
  }

  // /mcp/:serverName/<rest>
  const [, , serverName = "", ...restSegments] = url.pathname.split("/");
  const mcp = MCP_SERVERS.get(safeDecode(serverName));
  if (!mcp) {
    log(id, `✗ 404 server MCP "${serverName}" tidak ada di MCP_SERVERS`);
    return json({ error: "unknown_server", error_description: `Server MCP "${serverName}" tidak dikenal` }, 404);
  }
  const base = mcp.url;

  const target = new URL(base);
  target.pathname = base.pathname.replace(/\/+$/, "") + (restSegments.length ? `/${restSegments.join("/")}` : "");
  target.search = url.search;

  // Tanpa ini Bun memutus koneksi yang idle >10 detik (SSE & tool call lambat).
  server?.timeout(request, 0);

  const headers = new Headers(request.headers);
  for (const h of [...HOP_BY_HOP, "host", "authorization", "content-length"]) headers.delete(h);
  // Kirim content-length asli hanya jika ada body; fetch menghitung ulang untuk body stream.
  const contentLength = request.headers.get("content-length");
  if (contentLength && request.body) headers.set("content-length", contentLength);
  headers.set("accept-encoding", "identity"); // hindari kompresi yang merusak stream
  // Header milik server MCP menimpa apa pun yang dikirim klien dengan nama sama.
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
      `accept=${request.headers.get("accept") ?? "-"} content-type=${request.headers.get("content-type") ?? "-"} ` +
      `session=${request.headers.get("mcp-session-id") ?? "-"} last-event-id=${request.headers.get("last-event-id") ?? "-"}`,
  );

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? request.body : undefined,
      redirect: "manual",
      signal: request.signal,
      // @ts-expect-error `duplex` belum ada di tipe RequestInit, tapi diperlukan untuk body stream
      duplex: "half",
    });
  } catch (err) {
    const reason = (err as Error).message;
    if (request.signal.aborted) {
      log(id, `✗ klien membatalkan request sebelum upstream menjawab (${elapsed(startedAt)})`);
      return new Response(null, { status: 499 });
    }
    log(id, `✗ 502 gagal menghubungi upstream ${target.origin}: ${reason} (${elapsed(startedAt)})`);
    return json({ error: "bad_gateway", error_description: `Server MCP "${serverName}" tidak dapat dihubungi` }, 502);
  }

  const resHeaders = new Headers(upstream.headers);
  for (const h of HOP_BY_HOP) resHeaders.delete(h);
  if (resHeaders.has("content-encoding")) {
    // Bun sudah mendekompresi body; header lama tidak lagi berlaku.
    resHeaders.delete("content-encoding");
    resHeaders.delete("content-length");
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  const isSse = contentType.includes("text/event-stream");
  log(
    id,
    `← ${upstream.status} dari upstream content-type=${contentType || "-"} (header diterima ${elapsed(startedAt)})`,
  );

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

// ─────────────────────────────────────────────────────────────────────────────
// App
// ─────────────────────────────────────────────────────────────────────────────

const app = new Elysia()
  .onRequest(({ request }) => {
    const id = randomBytes(4).toString("hex");
    reqMeta.set(request, { id, startedAt: performance.now() });
    log(id, `⇢ ${request.method} ${safePath(new URL(request.url))}`);
  })
  .onAfterResponse(({ request, set, responseValue }) => {
    const { id, startedAt } = metaOf(request);
    const status = responseValue instanceof Response ? responseValue.status : set.status;
    log(id, `⇠ ${status} ${request.method} ${new URL(request.url).pathname} ${elapsed(startedAt)}`);
  })
  .onError(({ code, error, request, set }) => {
    const { id } = metaOf(request);
    if (code === "NOT_FOUND") return json({ error: "not_found" }, 404);
    log(id, `✗ error tak tertangani (${code}): ${(error as Error).message}`);
    set.status = code === "VALIDATION" || code === "PARSE" ? 400 : 500;
    return json({ error: code === "PARSE" ? "invalid_request" : "server_error" }, set.status as number);
  })

  .get("/health", () => ({ status: "ok", servers: [...MCP_SERVERS.keys()] }))

  // ── OAuth discovery (RFC 9728 & RFC 8414) ─────────────────────────────────
  // Protected resource metadata: /.well-known/oauth-protected-resource[/mcp/<server>/...]
  .get("/.well-known/oauth-protected-resource", oauthProtectedResource)
  .get("/.well-known/oauth-protected-resource/*", oauthProtectedResource)
  .get("/.well-known/oauth-authorization-server", oauthServerMetadata)
  .get("/.well-known/openid-configuration", oauthServerMetadata)

  // ── OAuth: halaman persetujuan ────────────────────────────────────────────
  .get("/oauth/authorize", ({ request }) => {
    const { id } = metaOf(request);
    const q = new URL(request.url).searchParams;
    const params = parseAuthorizeParams((k) => str(q.get(k) ?? undefined));
    if (typeof params === "string") {
      log(id, `✗ authorize ditolak: ${params}`);
      return page("Permintaan tidak valid", `<h1>Permintaan tidak valid</h1><p>${esc(params)}</p>`, 400);
    }
    log(id, `• authorize: menampilkan persetujuan untuk client_id=${params.clientId} redirect=${params.redirectUri.origin}`);
    return consentPage(params);
  })

  // ── OAuth: pengguna menekan tombol ────────────────────────────────────────
  .post("/oauth/authorize", ({ request, body }) => {
    const { id } = metaOf(request);
    const form = asRecord(body);
    const params = parseAuthorizeParams((k) => str(form[k]));
    if (typeof params === "string") {
      log(id, `✗ authorize POST ditolak: ${params}`);
      return page("Permintaan tidak valid", `<h1>Permintaan tidak valid</h1><p>${esc(params)}</p>`, 400);
    }

    const redirect = new URL(params.redirectUri);
    if (form.decision !== "allow") {
      log(id, "• authorize: pengguna MENOLAK");
      redirect.searchParams.set("error", "access_denied");
      if (params.state) redirect.searchParams.set("state", params.state);
      return redirectTo(redirect);
    }

    const code = newSecret();
    authCodes.set(code, {
      clientId: params.clientId,
      redirectUri: params.redirectUri.toString(),
      redirectUriExplicit: params.redirectUriExplicit,
      codeChallenge: params.codeChallenge,
      expiresAt: Date.now() + AUTH_CODE_TTL_MS,
    });
    redirect.searchParams.set("code", code);
    if (params.state) redirect.searchParams.set("state", params.state);
    log(id, `✓ authorize: code diterbitkan, redirect ke ${redirect.origin}${redirect.pathname} (pkce=${!!params.codeChallenge})`);
    return redirectTo(redirect);
  })

  // ── OAuth: tukar code / refresh_token → access_token ─────────────────────
  .post("/oauth/token", ({ request, body }) => {
    const { id } = metaOf(request);
    const form = asRecord(body);

    const creds = clientCredentials(request, form);
    if (!creds || !safeEqual(creds.id, CLIENT_ID) || !safeEqual(creds.secret, CLIENT_SECRET)) {
      log(id, `✗ token: client tidak valid (via=${creds?.via ?? "tidak ada kredensial"})`);
      return oauthError("invalid_client", "client_id/client_secret salah", 401, {
        "WWW-Authenticate": 'Basic realm="oauth"',
      });
    }

    const grantType = str(form.grant_type);
    if (grantType === "authorization_code") {
      const code = str(form.code);
      const record = code ? authCodes.get(code) : undefined;
      if (code) authCodes.delete(code); // sekali pakai, apa pun hasilnya

      const fail = (why: string) => {
        log(id, `✗ token: ${why}`);
        return oauthError("invalid_grant", why);
      };
      if (!record) return fail("code tidak ditemukan atau sudah dipakai");
      if (record.expiresAt <= Date.now()) return fail("code kedaluwarsa");
      if (record.clientId !== creds.id) return fail("code milik client lain");

      const redirectUri = str(form.redirect_uri);
      if (record.redirectUriExplicit && redirectUri !== record.redirectUri) return fail("redirect_uri tidak cocok");
      if (record.codeChallenge && !verifyPkce(str(form.code_verifier), record.codeChallenge)) {
        return fail("code_verifier (PKCE) tidak valid");
      }
    } else if (grantType === "refresh_token") {
      const refresh = str(form.refresh_token);
      const expiresAt = refresh ? refreshTokens.get(refresh) : undefined;
      if (refresh) refreshTokens.delete(refresh); // rotasi: refresh token lama hangus
      if (!expiresAt || expiresAt <= Date.now()) {
        log(id, "✗ token: refresh_token tidak valid/kedaluwarsa");
        return oauthError("invalid_grant", "refresh_token tidak valid atau kedaluwarsa");
      }
    } else {
      log(id, `✗ token: grant_type tidak didukung (${grantType ?? "kosong"})`);
      return oauthError("unsupported_grant_type", "gunakan authorization_code atau refresh_token");
    }

    const accessToken = newSecret();
    const refreshToken = newSecret();
    accessTokens.set(accessToken, Date.now() + ACCESS_TOKEN_TTL_MS);
    refreshTokens.set(refreshToken, Date.now() + REFRESH_TOKEN_TTL_MS);
    log(id, `✓ token: ${grantType} → access_token diterbitkan (via=${creds.via}, ttl=${ACCESS_TOKEN_TTL_MS / 1000}s)`);
    return json({
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: ACCESS_TOKEN_TTL_MS / 1000,
      refresh_token: refreshToken,
    });
  })

  // ── Reverse proxy ke server MCP ───────────────────────────────────────────
  // parse: "none" → body request tidak dibaca Elysia, diteruskan apa adanya sebagai stream.
  .all("/mcp/:serverName", proxy, { parse: "none" })
  .all("/mcp/:serverName/*", proxy, { parse: "none" })

  .listen({ port: PORT, hostname: "0.0.0.0", idleTimeout: 255 });

// Sebagai PID 1 di container, Bun tidak berhenti otomatis saat SIGTERM (docker stop menunggu 10 detik).
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    console.log(`${signal} diterima, gateway berhenti`);
    process.exit(0);
  });
}

console.log(`🦊 OAuth 2.1 MCP Gateway berjalan di http://${app.server?.hostname}:${app.server?.port}`);
for (const [name, { url, headers }] of MCP_SERVERS) {
  const names = [...headers.keys()];
  const injected = names.length ? ` (+header: ${names.join(", ")})` : "";
  console.log(`   /mcp/${name}/*  ⇒  ${url.origin}${url.pathname}${injected}`);
}
console.log(
  PUBLIC_URL
    ? `   PUBLIC_URL: ${PUBLIC_URL}`
    : "   ⚠ PUBLIC_URL belum di-set: URL discovery diturunkan dari header Host/X-Forwarded-*. Set PUBLIC_URL agar pasti benar.",
);
console.log(`   redirect_uri diizinkan: ${ALLOWED_REDIRECT_HOSTS.join(", ")} | log chunk SSE: ${LOG_SSE_CHUNKS}`);
