import { existsSync } from "node:fs";
import { resolve, sep } from "node:path";
import { validateAdminRequest } from "./auth";

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

  return {
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

export const { renderAdminPage, renderLoginPage, serveAsset } = createWebServer();
