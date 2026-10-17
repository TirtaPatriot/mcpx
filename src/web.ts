import { existsSync } from "node:fs";
import { resolve, sep } from "node:path";
import { validateAdminRequest } from "./auth";
import type { ConsentPageData } from "./consent-data";
import { esc } from "./utils";

/** Output folder of `bun run build` (web/dist). */
export const DEFAULT_DIST = resolve(import.meta.dir, "../web/dist");

const NO_STORE = { "Cache-Control": "no-store" };

const buildMissing = () =>
  new Response("The dashboard has not been built yet. Run `bun run build` (or `bun run dev` while developing).", {
    status: 503,
    headers: { "Content-Type": "text/plain; charset=utf-8", ...NO_STORE },
  });

/**
 * Only internal paths are allowed as the post-login destination (prevents open redirects).
 * Control characters and backslashes are rejected because browser URL parsers strip or normalise them,
 * so "/\t/evil.com" or "/\\evil.com" could turn into "//evil.com".
 */
export function safeNextPath(raw: string): string {
  const base = "http://local.invalid";
  if (!raw.startsWith("/") || /[\u0000-\u0020\\]/.test(raw)) return "/admin";
  try {
    const u = new URL(raw, base);
    const out = u.pathname + u.search + u.hash;
    // Parsing removes dot segments ("/.//evil.com" -> "//evil.com"), so check the final result.
    return u.origin === base && !out.startsWith("//") ? out : "/admin";
  } catch {
    return "/admin";
  }
}

/**
 * Serves the dashboard (Vite + Preact) from the build folder.
 * The HTML is guarded by the admin session; assets under /_app/* are public because they only hold UI code, no data.
 */
export function createWebServer(dist = DEFAULT_DIST) {
  const html = (name: string) => {
    const file = Bun.file(resolve(dist, name));
    return file.size > 0
      ? new Response(file, { headers: { "Content-Type": "text/html; charset=utf-8", ...NO_STORE } })
      : buildMissing();
  };

  /**
   * The consent and message pages are the same built page, filled with data by the gateway.
   * The data goes into a JSON <script> block, with "<" escaped so it can never close the tag.
   */
  const dataPage = (data: ConsentPageData, title: string, status: number) => {
    const file = Bun.file(resolve(dist, "consent.html"));
    if (file.size === 0) return buildMissing();
    return file.text().then(
      (html) => {
        const json = JSON.stringify(data).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
        const body = html.replace("__CONSENT_DATA__", () => json).replace(/<title>[^<]*<\/title>/, () => `<title>${esc(title)} — MCP X</title>`);
        return new Response(body, {
          status,
          // The consent page must never be framed: a hidden iframe could trick a click on "Allow".
          headers: { "Content-Type": "text/html; charset=utf-8", "X-Frame-Options": "DENY", ...NO_STORE },
        });
      },
    );
  };

  return {
    /** OAuth consent page for one authorisation request. */
    renderConsentPage: (data: Extract<ConsentPageData, { kind: "consent" }>, status = 200) => dataPage(data, `Allow access: ${data.client.name}`, status),

    /** A plain message page, such as "Invalid request" or "Sign-in required". */
    renderMessagePage: (title: string, message: string, status = 400) => dataPage({ kind: "message", title, message }, title, status),

    renderAdminPage(request: Request): Response {
      if (!validateAdminRequest(request)) {
        return new Response(null, { status: 302, headers: { Location: "/admin/login", ...NO_STORE } });
      }
      return html("index.html");
    },

    renderLoginPage(request: Request): Response {
      const next = safeNextPath(new URL(request.url).searchParams.get("next") ?? "");
      if (validateAdminRequest(request)) {
        return new Response(null, { status: 302, headers: { Location: next, ...NO_STORE } });
      }
      return html("login.html");
    },

    /** `relPath` is the part after /_app/, for example "assets/index-abc.js". */
    serveAsset(relPath: string): Response {
      if (!existsSync(dist)) return buildMissing();
      const full = resolve(dist, relPath);
      if (!full.startsWith(dist + sep)) return new Response("Not found", { status: 404 });
      const file = Bun.file(full);
      if (file.size === 0) return new Response("Not found", { status: 404 });
      // File names contain a hash of their content, so they are safe to cache forever.
      return new Response(file, { headers: { "Cache-Control": "public, max-age=31536000, immutable" } });
    },
  };
}

export const { renderAdminPage, renderLoginPage, renderConsentPage, renderMessagePage, serveAsset } = createWebServer();
