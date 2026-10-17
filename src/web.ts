import { existsSync } from "node:fs";
import { resolve, sep } from "node:path";
import { validateAdminRequest } from "./auth";

/** Folder hasil `bun run build` (web/dist). */
export const DEFAULT_DIST = resolve(import.meta.dir, "../web/dist");

const NO_STORE = { "Cache-Control": "no-store" };

const buildMissing = () =>
  new Response("Dashboard belum di-build. Jalankan `bun run build` (atau `bun run dev` saat development).", {
    status: 503,
    headers: { "Content-Type": "text/plain; charset=utf-8", ...NO_STORE },
  });

/** Hanya path internal yang diizinkan sebagai tujuan setelah login (cegah open redirect). */
export const safeNextPath = (raw: string) =>
  raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\") ? raw : "/admin";

/**
 * Menyajikan dashboard (Vite + Preact) dari folder build.
 * HTML-nya dijaga sesi admin; aset di /_app/* publik karena isinya hanya kode UI tanpa data.
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

    /** `relPath` adalah bagian setelah /_app/, misalnya "assets/index-abc.js". */
    serveAsset(relPath: string): Response {
      if (!existsSync(dist)) return buildMissing();
      const full = resolve(dist, relPath);
      if (!full.startsWith(dist + sep)) return new Response("Not found", { status: 404 });
      const file = Bun.file(full);
      if (file.size === 0) return new Response("Not found", { status: 404 });
      // Nama file berisi hash isinya, jadi aman di-cache selamanya.
      return new Response(file, { headers: { "Cache-Control": "public, max-age=31536000, immutable" } });
    },
  };
}

export const { renderAdminPage, renderLoginPage, serveAsset } = createWebServer();
