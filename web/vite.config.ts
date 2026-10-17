import { resolve } from "node:path";
import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import tailwindcss from "@tailwindcss/vite";

// Gateway menyajikan hasil build di /_app/*; halaman HTML-nya dijaga auth oleh server (src/web.ts).
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
    // Saat `bun run dev`, API dan aset statis tetap dilayani gateway.
    proxy: Object.fromEntries(
      ["/api", "/icons", "/logo.png", "/icon.png", "/favicon.ico", "/.well-known"].map((p) => [p, GATEWAY]),
    ),
  },
});
