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
  newSecret,
  publicOrigin,
  safeDecode,
} from "./utils";
import { reloadMcpCache, proxyMcpRequest, getCachedServer, getServerIconUrl } from "./proxy";
import {
  oauthProtectedResource,
  oauthServerMetadata,
  handleDynamicClientRegistration,
  parseAuthorizeParams,
  consentPage,
  redirectTo,
  handleTokenExchange,
} from "./oauth";
import { adminApi } from "./admin-api";
import { renderAdminPage, renderLoginPage, renderMessagePage, serveAsset } from "./web";
import { getSessionUser } from "./auth";

/** Static assets ship inside the package, so resolve them from this file, not the working directory. */
const PUBLIC_DIR = new URL("../public", import.meta.url).pathname;

// ─────────────────────────────────────────────────────────────────────────────
// Database & cache initialisation
// ─────────────────────────────────────────────────────────────────────────────

const { defaultAdminCreated, initialPassword } = seedInitialData();
reloadMcpCache();

// ─────────────────────────────────────────────────────────────────────────────
// Elysia gateway server
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
    log(id, `✗ unhandled error (${code}): ${(error as Error).message}`);
    set.status = code === "VALIDATION" || code === "PARSE" ? 400 : 500;
    addActivityLog(id, request.method, url.pathname, set.status as number, performance.now() - startedAt, undefined, (error as Error).message);
    return Response.json({ error: code === "PARSE" ? "invalid_request" : "server_error" }, { status: set.status as number });
  })

  // ── CORS Preflight Options ────────────────────────────────────────────────
  .options("/*", () => new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
      "Access-Control-Max-Age": "86400",
    },
  }))

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
    const f = Bun.file(`${PUBLIC_DIR}/favicon.ico`);
    return new Response(f, {
      headers: { "Content-Type": "image/x-icon", "Cache-Control": "public, max-age=86400", "Access-Control-Allow-Origin": "*" },
    });
  })
  .get("/manifest.webmanifest", () =>
    new Response(Bun.file(`${PUBLIC_DIR}/manifest.webmanifest`), {
      headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=86400" },
    }),
  )
  .get("/logo.png", () => {
    const f = Bun.file(`${PUBLIC_DIR}/logo.png`);
    return new Response(f, {
      headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400", "Access-Control-Allow-Origin": "*" },
    });
  })
  .get("/icon.png", () => {
    const f = Bun.file(`${PUBLIC_DIR}/icon.png`);
    return new Response(f, {
      headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400", "Access-Control-Allow-Origin": "*" },
    });
  })
  .get("/apple-touch-icon.png", () => {
    const f = Bun.file(`${PUBLIC_DIR}/logo.png`);
    return new Response(f, {
      headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400", "Access-Control-Allow-Origin": "*" },
    });
  })
  .get("/apple-touch-icon-precomposed.png", () => {
    const f = Bun.file(`${PUBLIC_DIR}/logo.png`);
    return new Response(f, {
      headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400", "Access-Control-Allow-Origin": "*" },
    });
  })
  .get("/icons/:file", ({ params }) => {
    const safeFile = params.file.replace(/[^a-zA-Z0-9._-]/g, "");
    const f = Bun.file(`${PUBLIC_DIR}/icons/${safeFile}`);
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
    const f = Bun.file(`${PUBLIC_DIR}/${path}`);
    return new Response(f, {
      headers: { "Cache-Control": "public, max-age=86400", "Access-Control-Allow-Origin": "*" },
    });
  })
  .get("/mcp/:serverName/favicon.ico", () => {
    const f = Bun.file(`${PUBLIC_DIR}/favicon.ico`);
    return new Response(f, {
      headers: { "Content-Type": "image/x-icon", "Cache-Control": "public, max-age=86400", "Access-Control-Allow-Origin": "*" },
    });
  })
  .get("/mcp/:serverName/icon", ({ params, request }) => {
    const origin = publicOrigin(request);
    const mcp = getCachedServer(safeDecode(params.serverName));
    const url = new URL(request.url);
    const format = url.searchParams.get("format") === "svg" ? "svg" : "png";
    const iconUrl = getServerIconUrl(mcp || params.serverName, origin, format);
    return Response.redirect(iconUrl, 302);
  })

  // ── Root & dashboard pages ──────────────────────────────────────────────
  .get("/", () => Response.redirect("/admin", 302))
  .get("/admin", ({ request }) => renderAdminPage(request))
  .get("/admin/login", ({ request }) => renderLoginPage(request))
  .get("/_app/*", ({ params }) => serveAsset(params["*"]))

  // ── Admin Management REST API ────────────────────────────────────────────
  .use(adminApi)

  // ── OAuth Discovery (RFC 9728 & RFC 8414) ─────────────────────────────────
  .get("/.well-known/oauth-protected-resource", oauthProtectedResource)
  .get("/.well-known/oauth-protected-resource/*", oauthProtectedResource)
  .get("/mcp/:serverName/.well-known/oauth-protected-resource", oauthProtectedResource)
  .get("/.well-known/oauth-authorization-server", oauthServerMetadata)
  .get("/.well-known/openid-configuration", oauthServerMetadata)

  // ── OAuth: consent page (authorize) ────────────────────────────────
  .get("/oauth/authorize", ({ request }) => {
    const { id, startedAt } = metaOf(request);
    const q = new URL(request.url).searchParams;
    const params = parseAuthorizeParams((k) => str(q.get(k) ?? undefined));
    if (typeof params === "string") {
      log(id, `✗ authorize rejected: ${params}`);
      addActivityLog(id, "GET", "/oauth/authorize", 400, performance.now() - startedAt, undefined, params);
      return renderMessagePage("Invalid request", params, 400);
    }
    const sessionUser = getSessionUser(request);
    if (!sessionUser) {
      const u = new URL(request.url);
      log(id, `• authorize: not signed in, redirecting to /admin/login (client_id=${params.clientId})`);
      addActivityLog(id, "GET", "/oauth/authorize", 302, performance.now() - startedAt, undefined, `Login required for ${params.clientId}`);
      return new Response(null, {
        status: 302,
        headers: {
          Location: `/admin/login?next=${encodeURIComponent(u.pathname + u.search)}`,
          "Cache-Control": "no-store",
        },
      });
    }
    log(id, `• authorize: consent client_id=${params.clientId} user=${sessionUser.username} redirect=${params.redirectUri.origin}`);
    addActivityLog(id, "GET", "/oauth/authorize", 200, performance.now() - startedAt, undefined, `Consent shown for ${params.clientId}`);
    return consentPage(params, sessionUser);
  })

  .post("/oauth/authorize", ({ request, body }) => {
    const { id, startedAt } = metaOf(request);
    const form = asRecord(body);
    const params = parseAuthorizeParams((k) => str(form[k]));
    if (typeof params === "string") {
      log(id, `✗ authorize POST rejected: ${params}`);
      addActivityLog(id, "POST", "/oauth/authorize", 400, performance.now() - startedAt, undefined, params);
      return renderMessagePage("Invalid request", params, 400);
    }

    const sessionUser = getSessionUser(request);
    if (!sessionUser) {
      log(id, `✗ authorize POST rejected: no login session (client_id=${params.clientId})`);
      addActivityLog(id, "POST", "/oauth/authorize", 401, performance.now() - startedAt, undefined, "Login required");
      return renderMessagePage("Sign-in required", "No sign-in session was found, or it has expired. Start the connection again from your AI app.", 401);
    }

    const redirect = new URL(params.redirectUri);
    if (form.decision !== "allow") {
      log(id, "• authorize: user DENIED");
      redirect.searchParams.set("error", "access_denied");
      if (params.state) redirect.searchParams.set("state", params.state);
      addActivityLog(id, "POST", "/oauth/authorize", 303, performance.now() - startedAt, undefined, `Denied by user (${params.clientId})`);
      return redirectTo(redirect);
    }

    const userId = sessionUser.id;

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
    log(id, `✓ authorize: code issued (user=${sessionUser.username}), redirecting to ${redirect.origin}${redirect.pathname} (pkce=${!!params.codeChallenge})`);
    addActivityLog(id, "POST", "/oauth/authorize", 303, performance.now() - startedAt, undefined, `Allowed for ${params.clientId}`);
    return redirectTo(redirect);
  })

  // ── OAuth: Dynamic Client Registration (RFC 7591) ─────────────────────────
  .post("/oauth/register", handleDynamicClientRegistration)

  // ── OAuth: exchange code / refresh token ────────────────────────────────────
  .post("/oauth/token", handleTokenExchange)

  // ── Reverse proxy to MCP servers ───────────────────────────────────────────
  .all("/mcp/:serverName", (ctx) => proxyMcpRequest(ctx as unknown as { request: Request; server: Bun.Server<unknown> | null }), { parse: "none" })
  .all("/mcp/:serverName/*", (ctx) => proxyMcpRequest(ctx as unknown as { request: Request; server: Bun.Server<unknown> | null }), { parse: "none" })

  .listen({ port: PORT, hostname: "0.0.0.0", idleTimeout: 255 });

// Graceful termination
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    console.log(`${signal} received, gateway stopping`);
    process.exit(0);
  });
}

console.log(`\n=============================================================`);
console.log(`⚡ MCP X (OAuth 2.1 gateway + dashboard) is running!`);
console.log(`   Host: http://${app.server?.hostname}:${app.server?.port}`);
console.log(`   Dashboard UI: http://localhost:${PORT}/admin`);
if (defaultAdminCreated) {
  console.log(`   🔑 First admin sign-in: username "admin", password "${initialPassword}" (random, shown only once; change it under Settings)`);
}
console.log(`   Database: ${DB_PATH} (SQLite WAL mode)`);
console.log(`   Access Token TTL: ${(ACCESS_TOKEN_TTL_MS / 86400000).toFixed(0)} days | Refresh grace: ${REFRESH_GRACE_PERIOD_MS / 1000}s`);
console.log(`   Public URL: ${PUBLIC_URL ?? "Auto-detect (Host header)"}`);
console.log(`   Redirect allow-list: ${ALLOWED_REDIRECT_HOSTS.join(", ")}`);
console.log(`=============================================================\n`);
