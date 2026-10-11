import { Elysia } from "elysia";
import { randomBytes } from "node:crypto";
import {
  PORT,
  DB_PATH,
  ACCESS_TOKEN_TTL_MS,
  REFRESH_GRACE_PERIOD_MS,
  ALLOWED_REDIRECT_HOSTS,
  PUBLIC_URL,
  AUTH_CODE_TTL_MS,
  LOG_SSE_CHUNKS,
} from "./config";
import {
  seedInitialData,
  stmtInsertAuthCode,
  getAllMcpServers,
  addActivityLog,
} from "./db";
import {
  log,
  reqMeta,
  metaOf,
  safePath,
  elapsed,
  asRecord,
  str,
  esc,
  newSecret,
  publicOrigin,
  safeDecode,
} from "./utils";
import { reloadMcpCache, proxyMcpRequest, getCachedServer, getServerIconUrl } from "./proxy";
import {
  oauthProtectedResource,
  oauthServerMetadata,
  parseAuthorizeParams,
  consentPage,
  redirectTo,
  handleTokenExchange,
  page,
} from "./oauth";
import { adminApi } from "./admin-api";
import { renderAdminPage, renderLoginPage } from "./admin-ui";
import { getSessionUser } from "./auth";

// ─────────────────────────────────────────────────────────────────────────────
// Inisialisasi Database & Cache
// ─────────────────────────────────────────────────────────────────────────────

const { defaultAdminCreated, initialPassword } = seedInitialData();
reloadMcpCache();

// ─────────────────────────────────────────────────────────────────────────────
// Elysia Gateway Server
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
    const { id, startedAt } = metaOf(request);
    const url = new URL(request.url);
    if (code === "NOT_FOUND") {
      addActivityLog(id, request.method, url.pathname, 404, performance.now() - startedAt, undefined, "Not found");
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    log(id, `✗ error tak tertangani (${code}): ${(error as Error).message}`);
    set.status = code === "VALIDATION" || code === "PARSE" ? 400 : 500;
    addActivityLog(id, request.method, url.pathname, set.status as number, performance.now() - startedAt, undefined, (error as Error).message);
    return Response.json({ error: code === "PARSE" ? "invalid_request" : "server_error" }, { status: set.status as number });
  })

  // ── Health Check ─────────────────────────────────────────────────────────
  .get("/health", () => {
    const servers = getAllMcpServers();
    return {
      status: "ok",
      active_servers: servers.filter((s) => s.enabled === 1).map((s) => s.id),
      total_servers: servers.length,
      database: "sqlite-wal",
      version: "2.0.0",
    };
  })

  // ── Static Assets (Favicon, Logo & Brand Icons) ───────────────────────────
  .get("/favicon.ico", () => {
    const f = Bun.file("./public/favicon.ico");
    return new Response(f, {
      headers: { "Content-Type": "image/x-icon", "Cache-Control": "public, max-age=86400" },
    });
  })
  .get("/logo.png", () => {
    const f = Bun.file("./public/logo.png");
    return new Response(f, {
      headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" },
    });
  })
  .get("/icon.png", () => {
    const f = Bun.file("./public/icon.png");
    return new Response(f, {
      headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" },
    });
  })
  .get("/icons/:file", ({ params }) => {
    const safeFile = params.file.replace(/[^a-zA-Z0-9._-]/g, "");
    const f = Bun.file(`./public/icons/${safeFile}`);
    const ext = safeFile.split(".").pop()?.toLowerCase();
    const mime =
      ext === "svg"
        ? "image/svg+xml"
        : ext === "png"
          ? "image/png"
          : ext === "jpg" || ext === "jpeg"
            ? "image/jpeg"
            : "application/octet-stream";
    return new Response(f, {
      headers: { "Content-Type": mime, "Cache-Control": "public, max-age=86400", "Access-Control-Allow-Origin": "*" },
    });
  })
  .get("/public/*", ({ request }) => {
    const path = new URL(request.url).pathname.replace(/^\/public\//, "").replace(/\.\./g, "");
    const f = Bun.file(`./public/${path}`);
    return new Response(f, {
      headers: { "Cache-Control": "public, max-age=86400", "Access-Control-Allow-Origin": "*" },
    });
  })
  .get("/mcp/:serverName/icon", ({ params, request }) => {
    const origin = publicOrigin(request);
    const mcp = getCachedServer(safeDecode(params.serverName));
    const iconUrl = getServerIconUrl(mcp || params.serverName, origin);
    return Response.redirect(iconUrl, 302);
  })

  // ── Halaman Root & Admin UI ──────────────────────────────────────────────
  .get("/", () => Response.redirect("/admin", 302))
  .get("/admin", ({ request }) => renderAdminPage(request))
  .get("/admin/login", ({ request }) => renderLoginPage(request))

  // ── Admin Management REST API ────────────────────────────────────────────
  .use(adminApi)

  // ── OAuth Discovery (RFC 9728 & RFC 8414) ─────────────────────────────────
  .get("/.well-known/oauth-protected-resource", oauthProtectedResource)
  .get("/.well-known/oauth-protected-resource/*", oauthProtectedResource)
  .get("/.well-known/oauth-authorization-server", oauthServerMetadata)
  .get("/.well-known/openid-configuration", oauthServerMetadata)

  // ── OAuth: Halaman Persetujuan (Authorize) ────────────────────────────────
  .get("/oauth/authorize", ({ request }) => {
    const { id, startedAt } = metaOf(request);
    const q = new URL(request.url).searchParams;
    const params = parseAuthorizeParams((k) => str(q.get(k) ?? undefined));
    if (typeof params === "string") {
      log(id, `✗ authorize ditolak: ${params}`);
      addActivityLog(id, "GET", "/oauth/authorize", 400, performance.now() - startedAt, undefined, params);
      return page("Permintaan tidak valid", `<h1>Permintaan tidak valid</h1><p>${esc(params)}</p>`, 400);
    }
    const sessionUser = getSessionUser(request);
    log(id, `• authorize: persetujuan client_id=${params.clientId} user=${sessionUser?.username ?? "tamu"} redirect=${params.redirectUri.origin}`);
    addActivityLog(id, "GET", "/oauth/authorize", 200, performance.now() - startedAt, undefined, `Consent shown for ${params.clientId}`);
    return consentPage(params, sessionUser);
  })

  .post("/oauth/authorize", ({ request, body }) => {
    const { id, startedAt } = metaOf(request);
    const form = asRecord(body);
    const params = parseAuthorizeParams((k) => str(form[k]));
    if (typeof params === "string") {
      log(id, `✗ authorize POST ditolak: ${params}`);
      addActivityLog(id, "POST", "/oauth/authorize", 400, performance.now() - startedAt, undefined, params);
      return page("Permintaan tidak valid", `<h1>Permintaan tidak valid</h1><p>${esc(params)}</p>`, 400);
    }

    const redirect = new URL(params.redirectUri);
    if (form.decision !== "allow") {
      log(id, "• authorize: pengguna MENOLAK");
      redirect.searchParams.set("error", "access_denied");
      if (params.state) redirect.searchParams.set("state", params.state);
      addActivityLog(id, "POST", "/oauth/authorize", 303, performance.now() - startedAt, undefined, `Denied by user (${params.clientId})`);
      return redirectTo(redirect);
    }

    const sessionUser = getSessionUser(request);
    const userId = sessionUser?.id ?? (form.user_id ? String(form.user_id) : null);

    const code = newSecret();
    stmtInsertAuthCode.run(
      code,
      params.clientId,
      userId,
      params.redirectUriRaw ?? null,
      params.codeChallenge ?? null,
      Date.now() + AUTH_CODE_TTL_MS,
      Date.now(),
    );
    redirect.searchParams.set("code", code);
    if (params.state) redirect.searchParams.set("state", params.state);
    log(id, `✓ authorize: code diterbitkan (user=${sessionUser?.username ?? "anon"}), redirect ke ${redirect.origin}${redirect.pathname} (pkce=${!!params.codeChallenge})`);
    addActivityLog(id, "POST", "/oauth/authorize", 303, performance.now() - startedAt, undefined, `Allowed for ${params.clientId}`);
    return redirectTo(redirect);
  })

  // ── OAuth: Tukar Code / Refresh Token ────────────────────────────────────
  .post("/oauth/token", handleTokenExchange)

  // ── Reverse Proxy ke Server MCP ───────────────────────────────────────────
  .all("/mcp/:serverName", (ctx) => proxyMcpRequest(ctx as unknown as { request: Request; server: Bun.Server<unknown> | null }), { parse: "none" })
  .all("/mcp/:serverName/*", (ctx) => proxyMcpRequest(ctx as unknown as { request: Request; server: Bun.Server<unknown> | null }), { parse: "none" })

  .listen({ port: PORT, hostname: "0.0.0.0", idleTimeout: 255 });

// Graceful termination
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    console.log(`${signal} diterima, gateway berhenti`);
    process.exit(0);
  });
}

console.log(`\n=============================================================`);
console.log(`⚡ OAuth 2.1 MCP Gateway + UI Management aktif!`);
console.log(`   Host: http://${app.server?.hostname}:${app.server?.port}`);
console.log(`   Dashboard UI: http://localhost:${PORT}/admin`);
if (defaultAdminCreated) {
  console.log(`   ⚠️  Password Admin Default: "${initialPassword}" (Silakan ganti di menu Pengaturan)`);
}
console.log(`   Database: ${DB_PATH} (SQLite WAL mode)`);
console.log(`   Access Token TTL: ${(ACCESS_TOKEN_TTL_MS / 86400000).toFixed(0)} hari | Refresh Grace: ${REFRESH_GRACE_PERIOD_MS / 1000}s`);
console.log(`   Public URL: ${PUBLIC_URL ?? "Auto-detect (Host header)"}`);
console.log(`   Whitelist Redirect: ${ALLOWED_REDIRECT_HOSTS.join(", ")}`);
console.log(`=============================================================\n`);
