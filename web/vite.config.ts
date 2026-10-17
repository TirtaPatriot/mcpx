import { resolve } from "node:path";
import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import tailwindcss from "@tailwindcss/vite";

// The gateway serves the build output at /_app/*; the HTML pages are guarded by the admin session (src/web.ts).
const GATEWAY = process.env.GATEWAY_URL ?? "http://localhost:3000";

export default defineConfig({
  root: import.meta.dirname,
  base: "/_app/",
  plugins: [preact(), tailwindcss()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, "index.html"),
        login: resolve(import.meta.dirname, "login.html"),
      },
    },
  },
  server: {
    port: 5173,
    // During `bun run dev`, the API and static assets are still served by the gateway.
    proxy: Object.fromEntries(
      ["/api", "/icons", "/logo.png", "/icon.png", "/favicon.ico", "/manifest.webmanifest", "/.well-known"].map((p) => [p, GATEWAY]),
    ),
  },
});
