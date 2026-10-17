import { createHash, randomBytes } from "node:crypto";
import {
  ALLOWED_REDIRECT_HOSTS,
  DEFAULT_REDIRECT_URI,
  ACCESS_TOKEN_TTL_MS,
  REFRESH_TOKEN_TTL_MS,
  REFRESH_GRACE_PERIOD_MS,
  AUTH_CODE_TTL_MS,
} from "./config";
import {
  getOAuthClient,
  saveOAuthClient,
  stmtInsertAuthCode,
  stmtGetAuthCode,
  stmtDeleteAuthCode,
  stmtInsertAccessToken,
  stmtInsertRefreshToken,
  stmtGetRefreshToken,
  stmtRevokeRefreshToken,
  addActivityLog,
  getAllMcpServers,
} from "./db";
import { getCachedServer, getServerIconUrl } from "./proxy";
import { detectClientBranding, detectServerBranding } from "./icons";
import {
  log,
  metaOf,
  safeEqual,
  str,
  asRecord,
  esc,
  publicOrigin,
  safeDecode,
  newSecret,
} from "./utils";

const noStore = {
  "Cache-Control": "no-store",
  Pragma: "no-cache",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(data, { status, headers: { ...noStore, ...headers } });

const oauthError = (error: string, description: string, status = 400, headers: Record<string, string> = {}) =>
  json({ error, error_description: description }, status, headers);

const metadataHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export function oauthProtectedResource({ request }: { request: Request }): Response {
  const { id } = metaOf(request);
  const origin = publicOrigin(request);
  const pathname = new URL(request.url).pathname;
  let serverName: string | undefined;

  // Mendukung query RFC 9728:
  // 1. /.well-known/oauth-protected-resource
  // 2. /.well-known/oauth-protected-resource/mcp/:serverName
  // 3. /mcp/:serverName/.well-known/oauth-protected-resource
  if (pathname.includes("/mcp/")) {
    const match = pathname.match(/\/mcp\/([^/]+)/);
    if (match) serverName = safeDecode(match[1]);
  }

  let logoUri = `${origin}/logo.png`;
  let resourceUri = `${origin}${pathname.replace(/\/\.well-known\/oauth-protected-resource.*$/, "")}`;
  if (!resourceUri.endsWith("/mcp") && !resourceUri.includes("/mcp/")) {
    resourceUri = `${origin}`;
  }

  if (serverName) {
    const srv = getCachedServer(serverName);
    if (srv) {
      logoUri = getServerIconUrl(srv, origin, "png");
      resourceUri = `${origin}/mcp/${serverName}`;
    }
  }

  log(id, `• discovery: protected resource ${resourceUri} logo=${logoUri}`);
  return json(
    {
      resource: resourceUri,
      authorization_servers: [origin],
      bearer_methods_supported: ["header"],
      resource_documentation: `${origin}/admin`,
      logo_uri: logoUri,
    },
    200,
    metadataHeaders,
  );
}

export function oauthServerMetadata({ request }: { request: Request }): Response {
  const { id } = metaOf(request);
  const origin = publicOrigin(request);
  log(id, `• discovery: authorization server metadata issuer=${origin}`);
  return json(
    {
      issuer: origin,
      authorization_endpoint: `${origin}/oauth/authorize`,
      token_endpoint: `${origin}/oauth/token`,
      registration_endpoint: `${origin}/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"],
      service_documentation: `${origin}/admin`,
      logo_uri: `${origin}/logo.png`,
      op_policy_uri: `${origin}/policy`,
      op_tos_uri: `${origin}/tos`,
    },
    200,
    metadataHeaders,
  );
}

export async function handleDynamicClientRegistration({
  request,
  body,
}: {
  request: Request;
  body?: unknown;
}): Promise<Response> {
  const { id } = metaOf(request);
  const origin = publicOrigin(request);
  try {
    let payload = asRecord(body);
    if (Object.keys(payload).length === 0) {
      payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    }
    const redirectUrisArr = Array.isArray(payload.redirect_uris)
      ? payload.redirect_uris.map((u) => String(u).trim()).filter(Boolean)
      : typeof payload.redirect_uris === "string"
        ? [payload.redirect_uris.trim()]
        : [];
    const redirectUris = redirectUrisArr.length > 0 ? redirectUrisArr.join(",") : "*";

    const userAgent = (request.headers.get("user-agent") || "").toLowerCase();
    const referer = (request.headers.get("referer") || "").toLowerCase();
    const originHeader = (request.headers.get("origin") || "").toLowerCase();
    const rawClientName = str(payload.client_name);
    const clientUri = str(payload.client_uri) || "";

    const allHints = [
      rawClientName || "",
      clientUri,
      ...redirectUrisArr,
      userAgent,
      referer,
      originHeader,
    ].join(" ").toLowerCase();

    let prefix = "client";
    let defaultName = "Universal AI Client";
    let icon = "/icons/universal.png";

    if (allHints.includes("chatgpt") || allHints.includes("openai")) {
      prefix = "chatgpt";
      defaultName = "OpenAI / ChatGPT";
      icon = "/icons/chatgpt.png";
    } else if (allHints.includes("claude") || allHints.includes("anthropic")) {
      prefix = "claude";
      defaultName = "Anthropic Claude";
      icon = "/icons/claude.png";
    } else if (allHints.includes("cursor") || allHints.includes("windsurf")) {
      prefix = "cursor";
      defaultName = "Cursor IDE";
      icon = "/icons/cursor.png";
    } else if (allHints.includes("gemini") || allHints.includes("google")) {
      prefix = "gemini";
      defaultName = "Google Gemini";
      icon = "/icons/gemini.png";
    } else if (allHints.includes("grok") || allHints.includes("x.ai")) {
      prefix = "grok";
      defaultName = "xAI Grok";
      icon = "/icons/grok.png";
    } else if (allHints.includes("localhost") || allHints.includes("127.0.0.1")) {
      prefix = "desktop";
      defaultName = "AI Desktop Client";
      icon = "/icons/universal.png";
    }

    if (str(payload.logo_uri)) {
      icon = str(payload.logo_uri)!;
    }

    const clientName = rawClientName || defaultName;
    const clientId = `${prefix}-${randomBytes(6).toString("hex")}`;
    const clientSecret = newSecret();

    saveOAuthClient({
      id: clientId,
      name: clientName,
      secret: clientSecret,
      redirect_uris: redirectUris,
      icon,
      enabled: 1,
    });

    log(id, `✓ Dynamic client registered (RFC 7591): ${clientId} (${clientName})`);

    return json(
      {
        client_id: clientId,
        client_secret: clientSecret,
        client_id_issued_at: Math.floor(Date.now() / 1000),
        client_secret_expires_at: 0,
        client_name: clientName,
        redirect_uris: redirectUrisArr.length > 0 ? redirectUrisArr : ["*"],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "client_secret_post",
      },
      201,
      metadataHeaders,
    );
  } catch (err) {
    log(id, `✗ Dynamic client registration gagal: ${(err as Error).message}`);
    return oauthError("invalid_request", (err as Error).message, 400, metadataHeaders);
  }
}

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

export function parseRedirectUri(raw: string, clientRedirectsRaw?: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  // Per RFC 8252 (OAuth 2.0 Native Apps), loopback redirect (localhost / 127.0.0.1) boleh menggunakan http:
  const isLoopback =
    (url.protocol === "http:" || url.protocol === "https:") &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1");

  if ((url.protocol !== "https:" && !isLoopback) || url.username || url.password) return null;
  const host = url.hostname.toLowerCase();

  // Jika client mengizinkan wildcard '*'
  if (clientRedirectsRaw?.trim() === "*") {
    return url;
  }

  // Daftar host yang diizinkan (gabungan host sistem + host spesifik client jika ada)
  const allowedList = [...ALLOWED_REDIRECT_HOSTS];
  if (clientRedirectsRaw) {
    const customEntries = clientRedirectsRaw
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    for (const entry of customEntries) {
      if (entry === "*") return url;
      if (entry.toLowerCase() === raw.toLowerCase()) return url;
      try {
        const u = new URL(entry);
        allowedList.push(u.hostname.toLowerCase());
      } catch {
        allowedList.push(entry.toLowerCase());
      }
    }
  }

  const allowed = allowedList.some((h) => host === h || host.endsWith(`.${h}`));
  return allowed ? url : null;
}

export function verifyPkce(verifier: string | undefined, challenge: string): boolean {
  if (!verifier) return false;
  const computed = createHash("sha256").update(verifier).digest("base64url");
  return safeEqual(computed, challenge);
}

export interface AuthorizeParams {
  clientId: string;
  clientName: string;
  redirectUri: URL;
  redirectUriRaw?: string;
  state?: string;
  scope?: string;
  resource?: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
}

export function parseAuthorizeParams(get: (key: string) => string | undefined): AuthorizeParams | string {
  if (get("response_type") !== "code") return "response_type harus 'code'";
  const clientId = get("client_id");
  if (!clientId) return "client_id tidak diberikan";

  const client = getOAuthClient(clientId);
  if (!client) return `client_id "${clientId}" tidak terdaftar di database`;
  if (client.enabled !== 1) return `client_id "${clientId}" sedang dinonaktifkan oleh administrator`;

  const rawRedirect = get("redirect_uri");
  const redirectUri = parseRedirectUri(rawRedirect ?? DEFAULT_REDIRECT_URI, client.redirect_uris);
  if (!redirectUri) {
    return `redirect_uri tidak diizinkan (harus https atau loopback localhost/127.0.0.1, dan terdaftar di whitelist)`;
  }

  const codeChallenge = get("code_challenge");
  const codeChallengeMethod = get("code_challenge_method");
  if (codeChallenge && codeChallengeMethod !== "S256") return "code_challenge_method harus 'S256'";

  return {
    clientId,
    clientName: client.name,
    redirectUri,
    redirectUriRaw: rawRedirect,
    state: get("state"),
    scope: get("scope"),
    resource: get("resource"),
    codeChallenge,
    codeChallengeMethod,
  };
}

const htmlHeaders = { "Content-Type": "text/html; charset=utf-8", "X-Frame-Options": "DENY", ...noStore };

const PAGE_STYLE = `
  :root { color-scheme: light dark; }
  body {
    font: 15px/1.5 system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    display: grid;
    place-items: center;
    min-height: 100vh;
    margin: 0;
    padding: 24px;
    box-sizing: border-box;
    background: radial-gradient(circle at 50% 10%, #1e293b 0%, #0f172a 100%);
    color: #f8fafc;
  }
  .card {
    max-width: 30rem;
    width: 100%;
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 24px;
    padding: 32px;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05);
  }
  .connection-bridge {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
    margin-bottom: 24px;
  }
  .avatar-box {
    width: 64px;
    height: 64px;
    border-radius: 18px;
    background: #0f172a;
    border: 1px solid #334155;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 10px;
    box-sizing: border-box;
    box-shadow: 0 8px 16px -4px rgba(0, 0, 0, 0.3);
  }
  .avatar-box img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .connector {
    display: flex;
    align-items: center;
    gap: 6px;
    color: #64748b;
  }
  .connector-line {
    width: 24px;
    height: 2px;
    background: linear-gradient(90deg, #3b82f6, #8b5cf6);
    border-radius: 2px;
  }
  .connector-badge {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: #0f172a;
    border: 1px solid #475569;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    color: #a855f7;
    box-shadow: 0 0 12px rgba(168, 85, 247, 0.3);
  }
  h1 { font-size: 1.35rem; font-weight: 700; margin: 0 0 6px; text-align: center; color: #f8fafc; letter-spacing: -0.01em; }
  .subtitle { text-align: center; margin: 0 0 24px; color: #94a3b8; font-size: 0.9rem; }
  .info-box { background: #0f172a; border: 1px solid #334155; border-radius: 14px; padding: 16px; margin-bottom: 20px; font-size: 0.88rem; }
  .info-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; gap: 12px; }
  .info-row:last-child { margin-bottom: 0; }
  .info-label { color: #64748b; font-weight: 500; font-size: 0.85rem; flex-shrink: 0; }
  .info-value { color: #e2e8f0; font-size: 0.85rem; word-break: break-all; text-align: right; }
  .font-mono { font-family: monospace; }
  .badge { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; border: 1px solid rgba(255,255,255,0.1); }
  .badge img { width: 14px; height: 14px; object-fit: contain; }
  .perm-box { background: rgba(59, 130, 246, 0.05); border: 1px solid rgba(59, 130, 246, 0.15); border-radius: 12px; padding: 12px 14px; margin-bottom: 24px; font-size: 0.82rem; }
  .perm-item { display: flex; align-items: center; gap: 8px; color: #93c5fd; margin-bottom: 6px; }
  .perm-item:last-child { margin-bottom: 0; }
  .row { display: flex; gap: 12px; }
  button { font: inherit; font-weight: 600; font-size: 0.95rem; padding: 12px 20px; border-radius: 12px; border: 1px solid #475569; background: #334155; color: #f8fafc; cursor: pointer; transition: all 0.15s ease; flex: 1; text-align: center; }
  button:hover { background: #475569; }
  button.primary { background: linear-gradient(135deg, #2563eb, #4f46e5); border: none; color: #fff; box-shadow: 0 4px 14px rgba(37, 99, 235, 0.4); flex: 1.4; }
  button.primary:hover { background: linear-gradient(135deg, #1d4ed8, #4338ca); box-shadow: 0 6px 18px rgba(37, 99, 235, 0.5); }
  @media (max-width: 480px) {
    body { padding: 12px; place-items: start center; }
    .card { padding: 20px; border-radius: 20px; margin-top: 8px; }
    .connection-bridge { margin-bottom: 18px; }
    .avatar-box { width: 52px; height: 52px; border-radius: 14px; }
    .info-row { flex-direction: column; align-items: flex-start; gap: 4px; }
    .info-value { text-align: left; }
    .row { flex-direction: column-reverse; }
    button { padding: 14px 20px; min-height: 48px; }
  }
`;

export const page = (title: string, body: string, status = 200) =>
  new Response(
    `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <link rel="icon" type="image/x-icon" href="/favicon.ico">
  <link rel="icon" type="image/png" sizes="32x32" href="/logo.png">
  <link rel="apple-touch-icon" href="/logo.png">
  <title>${esc(title)}</title>
  <style>${PAGE_STYLE}</style>
</head>
<body>
  <div class="card">${body}</div>
</body>
</html>`,
    { status, headers: htmlHeaders },
  );

export function consentPage(p: AuthorizeParams, sessionUser?: { id: string; name: string; username: string } | null) {
  const hidden: Record<string, string | undefined> = {
    response_type: "code",
    client_id: p.clientId,
    redirect_uri: p.redirectUriRaw,
    state: p.state,
    scope: p.scope,
    resource: p.resource,
    code_challenge: p.codeChallenge,
    code_challenge_method: p.codeChallengeMethod,
  };
  const inputs = Object.entries(hidden)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `<input type="hidden" name="${k}" value="${esc(v!)}">`)
    .join("");

  const client = getOAuthClient(p.clientId);
  const redirectHost = p.redirectUri?.hostname || (p.redirectUriRaw ? (p.redirectUriRaw.startsWith("http") ? new URL(p.redirectUriRaw).hostname : p.redirectUriRaw) : "");
  const clientBranding = detectClientBranding(p.clientId, redirectHost, p.clientName, client?.icon);

  // Periksa apakah ada target server spesifik yang diminta (misal via resource parameter RFC 8707)
  let targetServerHtml = "";
  if (p.resource) {
    const srvMatch = p.resource.match(/\/mcp\/([^/?#]+)/);
    const srvId = srvMatch ? safeDecode(srvMatch[1]) : p.resource;
    const srv = getCachedServer(srvId);
    const srvBranding = detectServerBranding(srvId, srv?.name, srv?.icon);
    targetServerHtml = `
      <div class="info-row">
        <span class="info-label">Server Target:</span>
        <span class="info-value">
          <span class="badge" style="background: rgba(139, 92, 246, 0.15); color: #c084fc; border-color: rgba(139, 92, 246, 0.3);">
            <img src="${srvBranding.iconUrl}" alt="" onerror="this.style.display='none'">
            ${esc(srvBranding.name)}
          </span>
        </span>
      </div>`;
  } else {
    const servers = getAllMcpServers().filter((s) => s.enabled === 1);
    if (servers.length > 0) {
      const serverBadges = servers
        .slice(0, 3)
        .map((s) => {
          const b = detectServerBranding(s.id, s.name, s.icon);
          return `<span class="badge" style="background: rgba(59, 130, 246, 0.1); color: #93c5fd; border-color: rgba(59, 130, 246, 0.2);"><img src="${b.iconUrl}" alt="" onerror="this.style.display='none'">${esc(s.name)}</span>`;
        })
        .join(" ");
      targetServerHtml = `
        <div class="info-row">
          <span class="info-label">Server Akses:</span>
          <span class="info-value">${serverBadges}${servers.length > 3 ? ` <span class="badge" style="background:#334155; color:#cbd5e1;">+${servers.length - 3} lainnya</span>` : ""}</span>
        </div>`;
    }
  }

  return page(
    `Izinkan Akses — ${clientBranding.name}`,
    `
      <div class="connection-bridge">
        <div class="avatar-box" title="${esc(clientBranding.name)}">
          <img src="${clientBranding.iconUrl}" alt="${esc(clientBranding.name)}" onerror="this.src='/icons/universal.svg'">
        </div>
        <div class="connector">
          <div class="connector-line"></div>
          <div class="connector-badge">⚡</div>
          <div class="connector-line"></div>
        </div>
        <div class="avatar-box" title="Perumda Tirta Patriot MCP Gateway">
          <img src="/logo.png" alt="MCP Gateway" onerror="this.src='/icons/mcp.svg'">
        </div>
      </div>

      <h1>Hubungkan ke Server MCP?</h1>
      <p class="subtitle"><strong>${esc(clientBranding.name)}</strong> meminta izin untuk mengakses server Model Context Protocol (MCP) Tirta Patriot Anda.</p>

      <div class="info-box">
        <div class="info-row">
          <span class="info-label">Aplikasi AI:</span>
          <span class="info-value">
            <span class="badge" style="background: rgba(59, 130, 246, 0.15); color: #60a5fa; border-color: rgba(59, 130, 246, 0.3);">
              <img src="${clientBranding.iconUrl}" alt="" onerror="this.style.display='none'">
              ${esc(p.clientName)}
            </span>
          </span>
        </div>
        ${targetServerHtml}
        <div class="info-row">
          <span class="info-label">Client ID:</span>
          <span class="info-value font-mono">${esc(p.clientId)}</span>
        </div>
        ${sessionUser ? `<div class="info-row"><span class="info-label">Akun Otorisasi:</span><span class="info-value"><strong>${esc(sessionUser.name)}</strong> (@${esc(sessionUser.username)})</span></div>` : ""}
        <div class="info-row">
          <span class="info-label">Redirect ke:</span>
          <span class="info-value font-mono">${esc(p.redirectUri.origin)}</span>
        </div>
        ${p.scope ? `<div class="info-row"><span class="info-label">Scope:</span><span class="info-value">${esc(p.scope)}</span></div>` : ""}
      </div>

      <div class="perm-box">
        <div class="perm-item">
          <span style="color:#10b981;">✓</span>
          <span>Membaca deskripsi tools, resources, dan skema MCP</span>
        </div>
        <div class="perm-item">
          <span style="color:#10b981;">✓</span>
          <span>Mengeksekusi tools MCP atas nama akun Anda</span>
        </div>
      </div>

      <form method="post" action="/oauth/authorize">${inputs}
        <div class="row">
          <button type="submit" name="decision" value="deny">Tolak</button>
          <button type="submit" name="decision" value="allow" class="primary">Izinkan Akses</button>
        </div>
      </form>
    `,
  );
}

export const redirectTo = (url: URL) =>
  new Response(null, { status: 303, headers: { Location: url.toString(), ...noStore } });

export async function handleTokenExchange({ request, body }: { request: Request; body: unknown }): Promise<Response> {
  const { id, startedAt } = metaOf(request);
  const form = asRecord(body);
  const creds = clientCredentials(request, form);
  const grantType = str(form.grant_type);

  log(
    id,
    `• token: grant_type=${grantType ?? "-"} client_auth=${creds?.via ?? "tidak ada"} client_id=${creds?.id ?? "-"} ` +
      `redirect_uri=${str(form.redirect_uri) ?? "-"} code_verifier=${form.code_verifier ? "ada" : "tidak ada"}`,
  );

  let clientId = creds?.id;
  if (!clientId && grantType === "refresh_token" && form.refresh_token) {
    const rec = stmtGetRefreshToken.get(String(form.refresh_token));
    if (rec) clientId = rec.client_id;
  }

  if (!clientId) {
    log(id, `✗ token: client_id tidak ditemukan`);
    return oauthError("invalid_client", "client_id tidak diberikan", 401);
  }

  const client = getOAuthClient(clientId);
  if (!client) {
    log(id, `✗ token: client "${clientId}" tidak ditemukan di database`);
    return oauthError("invalid_client", "client_id tidak terdaftar", 401);
  }
  if (client.enabled !== 1) {
    log(id, `✗ token: client "${clientId}" sedang dinonaktifkan`);
    return oauthError("invalid_client", "client_id dinonaktifkan oleh administrator", 401);
  }

  const secretProvided = !!creds?.secret;
  const secretOk = secretProvided && safeEqual(creds.secret!, client.secret);

  if ((grantType === "authorization_code" && !secretOk) || (secretProvided && !secretOk)) {
    log(id, `✗ token: client secret tidak valid untuk ${clientId}`);
    return oauthError("invalid_client", "client_secret salah", 401, {
      "WWW-Authenticate": 'Basic realm="oauth"',
    });
  }

  let userId: string | null = null;

  if (grantType === "authorization_code") {
    const code = str(form.code);
    const record = code ? stmtGetAuthCode.get(code) : undefined;
    if (code) stmtDeleteAuthCode.run(code);

    const fail = (why: string) => {
      log(id, `✗ token: ${why}`);
      addActivityLog(id, "POST", "/oauth/token", 400, performance.now() - startedAt, undefined, why);
      return oauthError("invalid_grant", why);
    };

    if (!record) return fail("code tidak ditemukan atau sudah dipakai");
    if (record.expires_at <= Date.now()) return fail("code kedaluwarsa");
    if (record.client_id !== clientId) return fail("code milik client lain");

    if (!record.user_id) return fail("code tidak terikat ke user (login diperlukan)");
    userId = record.user_id;

    const redirectUri = str(form.redirect_uri);
    if (record.redirect_uri !== null && redirectUri !== record.redirect_uri) {
      return fail(`redirect_uri tidak cocok (authorize=${record.redirect_uri} token=${redirectUri ?? "tidak dikirim"})`);
    }
    if (record.code_challenge && !verifyPkce(str(form.code_verifier), record.code_challenge)) {
      return fail("code_verifier (PKCE) tidak valid");
    }
  } else if (grantType === "refresh_token") {
    const refresh = str(form.refresh_token);
    const fail = (why: string) => {
      log(id, `✗ token: ${why}`);
      addActivityLog(id, "POST", "/oauth/token", 400, performance.now() - startedAt, undefined, why);
      return oauthError("invalid_grant", why);
    };

    if (!refresh) return fail("refresh_token tidak dikirim");
    const record = stmtGetRefreshToken.get(refresh);
    if (!record) return fail("refresh_token tidak ditemukan atau kedaluwarsa");
    if (record.expires_at <= Date.now()) return fail("refresh_token kedaluwarsa");
    if (record.client_id !== clientId) return fail("refresh_token milik client lain");

    if (!record.user_id) return fail("refresh_token tidak terikat ke user (login ulang diperlukan)");
    userId = record.user_id;

    if (record.revoked_at !== null) {
      if (Date.now() - record.revoked_at > REFRESH_GRACE_PERIOD_MS) {
        return fail("refresh_token sudah dipakai dan melewati batas grace period");
      }
      log(id, "⚠ token: refresh_token digunakan kembali dalam grace period (race condition / network retry)");
    } else {
      stmtRevokeRefreshToken.run(Date.now(), refresh);
    }
  } else {
    log(id, `✗ token: grant_type tidak didukung (${grantType ?? "kosong"})`);
    return oauthError("unsupported_grant_type", "gunakan authorization_code atau refresh_token");
  }

  const now = Date.now();
  const accessToken = newSecret();
  const refreshToken = newSecret();
  stmtInsertAccessToken.run(accessToken, clientId, userId, now + ACCESS_TOKEN_TTL_MS, now);
  stmtInsertRefreshToken.run(refreshToken, clientId, userId, now + REFRESH_TOKEN_TTL_MS, now);

  log(id, `✓ token: ${grantType} → access_token diterbitkan untuk client ${clientId}${userId ? ` (user: ${userId})` : ""}`);
  addActivityLog(id, "POST", "/oauth/token", 200, performance.now() - startedAt, undefined, `Token issued for ${clientId}`);

  return json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_MS / 1000,
    refresh_token: refreshToken,
  });
}
