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
import type { ConsentPageData } from "./consent-data";
import { detectClientBranding, detectServerBranding } from "./icons";
import { renderConsentPage } from "./web";
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

  // Supports the RFC 9728 lookups:
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
    log(id, `✗ Dynamic client registration failed: ${(err as Error).message}`);
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
  // Per RFC 8252 (OAuth 2.0 Native Apps), loopback redirects (localhost / 127.0.0.1) may use http:
  const isLoopback =
    (url.protocol === "http:" || url.protocol === "https:") &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1");

  if ((url.protocol !== "https:" && !isLoopback) || url.username || url.password) return null;
  const host = url.hostname.toLowerCase();

  // If the client allows the wildcard '*'
  if (clientRedirectsRaw?.trim() === "*") {
    return url;
  }

  // Allowed hosts (system hosts plus the client-specific ones, if any)
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
  if (get("response_type") !== "code") return "response_type must be 'code'";
  const clientId = get("client_id");
  if (!clientId) return "client_id is missing";

  const client = getOAuthClient(clientId);
  if (!client) return `client_id "${clientId}" is not registered`;
  if (client.enabled !== 1) return `client_id "${clientId}" has been disabled by an administrator`;

  const rawRedirect = get("redirect_uri");
  const redirectUri = parseRedirectUri(rawRedirect ?? DEFAULT_REDIRECT_URI, client.redirect_uris);
  if (!redirectUri) {
    return `redirect_uri is not allowed (it must be https or loopback localhost/127.0.0.1, and on the allow-list)`;
  }

  const codeChallenge = get("code_challenge");
  const codeChallengeMethod = get("code_challenge_method");
  if (codeChallenge && codeChallengeMethod !== "S256") return "code_challenge_method must be 'S256'";

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
  const fields = Object.fromEntries(Object.entries(hidden).filter((e): e is [string, string] => e[1] !== undefined));

  const client = getOAuthClient(p.clientId);
  const redirectHost = p.redirectUri?.hostname || (p.redirectUriRaw ? (p.redirectUriRaw.startsWith("http") ? new URL(p.redirectUriRaw).hostname : p.redirectUriRaw) : "");
  const clientBranding = detectClientBranding(p.clientId, redirectHost, p.clientName, client?.icon);

  const brand = (id: string, name?: string, icon?: string) => {
    const b = detectServerBranding(id, name, icon);
    return { name: b.name, iconUrl: b.iconUrl };
  };

  // A specific target server may be requested through the RFC 8707 resource parameter;
  // otherwise show the first few enabled servers.
  let servers: Extract<ConsentPageData, { kind: "consent" }>["servers"] = { items: [], more: 0, requested: false };
  if (p.resource) {
    const match = p.resource.match(/\/mcp\/([^/?#]+)/);
    const id = match ? safeDecode(match[1]) : p.resource;
    const srv = getCachedServer(id);
    servers = { items: [brand(id, srv?.name, srv?.icon)], more: 0, requested: true };
  } else {
    const enabled = getAllMcpServers().filter((s) => s.enabled === 1);
    servers = { items: enabled.slice(0, 3).map((s) => brand(s.id, s.name, s.icon)), more: Math.max(0, enabled.length - 3), requested: false };
  }

  return renderConsentPage({
    kind: "consent",
    client: { name: clientBranding.name, iconUrl: clientBranding.iconUrl },
    clientName: p.clientName,
    clientId: p.clientId,
    servers,
    user: sessionUser ? { name: sessionUser.name, username: sessionUser.username } : undefined,
    redirectOrigin: p.redirectUri.origin,
    scope: p.scope,
    fields,
  });
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
    `• token: grant_type=${grantType ?? "-"} client_auth=${creds?.via ?? "none"} client_id=${creds?.id ?? "-"} ` +
      `redirect_uri=${str(form.redirect_uri) ?? "-"} code_verifier=${form.code_verifier ? "present" : "absent"}`,
  );

  let clientId = creds?.id;
  if (!clientId && grantType === "refresh_token" && form.refresh_token) {
    const rec = stmtGetRefreshToken.get(String(form.refresh_token));
    if (rec) clientId = rec.client_id;
  }

  if (!clientId) {
    log(id, `✗ token: client_id not found`);
    return oauthError("invalid_client", "client_id is missing", 401);
  }

  const client = getOAuthClient(clientId);
  if (!client) {
    log(id, `✗ token: client "${clientId}" not found`);
    return oauthError("invalid_client", "client_id is not registered", 401);
  }
  if (client.enabled !== 1) {
    log(id, `✗ token: client "${clientId}" is disabled`);
    return oauthError("invalid_client", "client_id has been disabled by an administrator", 401);
  }

  const secretProvided = !!creds?.secret;
  const secretOk = secretProvided && safeEqual(creds.secret!, client.secret);

  if ((grantType === "authorization_code" && !secretOk) || (secretProvided && !secretOk)) {
    log(id, `✗ token: invalid client secret for ${clientId}`);
    return oauthError("invalid_client", "client_secret is wrong", 401, {
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

    if (!record) return fail("code not found or already used");
    if (record.expires_at <= Date.now()) return fail("code has expired");
    if (record.client_id !== clientId) return fail("code belongs to another client");

    if (!record.user_id) return fail("code is not bound to a user (sign-in required)");
    userId = record.user_id;

    const redirectUri = str(form.redirect_uri);
    if (record.redirect_uri !== null && redirectUri !== record.redirect_uri) {
      return fail(`redirect_uri does not match (authorize=${record.redirect_uri} token=${redirectUri ?? "not sent"})`);
    }
    if (record.code_challenge && !verifyPkce(str(form.code_verifier), record.code_challenge)) {
      return fail("code_verifier (PKCE) is invalid");
    }
  } else if (grantType === "refresh_token") {
    const refresh = str(form.refresh_token);
    const fail = (why: string) => {
      log(id, `✗ token: ${why}`);
      addActivityLog(id, "POST", "/oauth/token", 400, performance.now() - startedAt, undefined, why);
      return oauthError("invalid_grant", why);
    };

    if (!refresh) return fail("refresh_token was not sent");
    const record = stmtGetRefreshToken.get(refresh);
    if (!record) return fail("refresh_token not found or expired");
    if (record.expires_at <= Date.now()) return fail("refresh_token has expired");
    if (record.client_id !== clientId) return fail("refresh_token belongs to another client");

    if (!record.user_id) return fail("refresh_token is not bound to a user (sign in again)");
    userId = record.user_id;

    if (record.revoked_at !== null) {
      if (Date.now() - record.revoked_at > REFRESH_GRACE_PERIOD_MS) {
        return fail("refresh_token was already used and the grace period has passed");
      }
      log(id, "⚠ token: refresh_token reused within the grace period (race condition / network retry)");
    } else {
      stmtRevokeRefreshToken.run(Date.now(), refresh);
    }
  } else {
    log(id, `✗ token: unsupported grant_type (${grantType ?? "empty"})`);
    return oauthError("unsupported_grant_type", "use authorization_code or refresh_token");
  }

  const now = Date.now();
  const accessToken = newSecret();
  const refreshToken = newSecret();
  stmtInsertAccessToken.run(accessToken, clientId, userId, now + ACCESS_TOKEN_TTL_MS, now);
  stmtInsertRefreshToken.run(refreshToken, clientId, userId, now + REFRESH_TOKEN_TTL_MS, now);

  log(id, `✓ token: ${grantType} → access_token issued for client ${clientId}${userId ? ` (user: ${userId})` : ""}`);
  addActivityLog(id, "POST", "/oauth/token", 200, performance.now() - startedAt, undefined, `Token issued for ${clientId}`);

  return json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_MS / 1000,
    refresh_token: refreshToken,
  });
}
