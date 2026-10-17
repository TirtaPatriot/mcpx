import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { render } from "preact";
import { App } from "../src/App";

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

const SERVER = { id: "dokploy", name: "Dokploy <b>MCP</b>", server_type: "command", url: "", headers: "", command: "bunx", args: "-y @dokploy/mcp", env_vars: "", icon: "", description: "", enabled: true };
const CLIENT = { id: "claude-desktop", name: "Claude Desktop", secret: "s3cr3t-value", redirect_uris: "", icon: "", enabled: true, active_tokens: { access: 2, refresh: 1 } };

const routes: Record<string, unknown> = {
  "/api/admin/me": { ok: true, user: { id: "u1", username: "admin", name: "Administrator", role: "admin" }, isDefaultPassword: true, origin: "https://gw.example.com", dbPath: "/data/t.db" },
  "/api/admin/stats": {
    ok: true,
    stats: { servers: { active: 1, total: 2 }, clients: { active: 3, total: 4 }, tokens: { access: 5, refresh: 6 }, users: { active: 7, total: 8 } },
    system: { uptime: 7200, memory: { rss: 50, heapUsed: 20 }, bunVersion: "1.3.0", runtimes: { uv: true }, dbPath: "/data/t.db" },
  },
  "/api/admin/servers": { ok: true, servers: [SERVER] },
  "/api/admin/clients": { ok: true, clients: [CLIENT] },
  "/api/admin/users": { ok: true, users: [{ id: "u1", username: "admin", name: "Administrator", role: "admin", enabled: true, created_at: 0, isSelf: true }] },
  "/api/admin/tokens": { ok: true, accessTokens: [{ token: "abcdefghijklmnop", client_id: "claude-desktop", created_at: 0, expires_at: 1, user_username: "admin", user_name: "Administrator" }], refreshTokens: [] },
  "/api/admin/logs": { ok: true, logs: [{ timestamp: 0, method: "GET", path: "/health", status: 200, duration_ms: 1.234, info: null }] },
};

let calls: string[] = [];
const realFetch = globalThis.fetch;

beforeEach(() => {
  calls = [];
  document.body.innerHTML = '<div id="app"></div>';
  location.hash = "";
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const path = new URL(String(input), "http://localhost").pathname;
    calls.push(path);
    return path in routes ? json(routes[path]) : json({ ok: false, error: `no route ${path}` }, 404);
  }) as typeof fetch;
});
afterEach(() => {
  render(null, document.getElementById("app")!);
  globalThis.fetch = realFetch;
});

const text = () => document.body.textContent ?? "";
async function waitFor(check: () => boolean, what: string) {
  for (let i = 0; i < 100; i++) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`timeout waiting for: ${what}\n${text().slice(0, 400)}`);
}
const tick = () => new Promise((r) => setTimeout(r, 0));
/** Klik tombol berdasarkan teksnya, lalu tunggu Preact selesai me-render ulang. */
const click = async (label: string) => {
  const btn = [...document.querySelectorAll("button")].find((b) => b.textContent?.includes(label));
  if (!btn) throw new Error(`button not found: ${label}`);
  btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await tick();
};

async function mount() {
  render(<App />, document.getElementById("app")!);
  await waitFor(() => text().includes("Ringkasan"), "app shell");
}

describe("dashboard", () => {
  test("shows the shell, the user badge and the temporary-password warning", async () => {
    await mount();
    expect(text()).toContain("Administrator");
    expect(text()).toContain("password sementara");
  });

  test("overview loads stats and uses the public origin in the guides", async () => {
    await mount();
    await waitFor(() => text().includes("1.3.0"), "stats");
    expect(text()).toContain("Hub Integrasi");
    expect(text()).toContain("https://gw.example.com/oauth/authorize");
    await click("Claude Desktop / Code");
    expect(text()).toContain("https://gw.example.com/mcp/dokploy");
  });

  test("servers tab renders rows and escapes HTML in names", async () => {
    await mount();
    await click("Server MCP");
    await waitFor(() => text().includes("/mcp/dokploy/*"), "server row");
    expect(text()).toContain("Dokploy <b>MCP</b>");
    expect(document.querySelector("tbody b")).toBeNull();
    expect(document.querySelector("td[data-label='Status']")).not.toBeNull();
  });

  test("clients tab hides the secret until revealed", async () => {
    await mount();
    await click("Klien OAuth");
    await waitFor(() => text().includes("claude-desktop"), "client row");
    expect(text()).toContain("3 sesi aktif");
    expect(text()).not.toContain("s3cr3t-value");
    await click("Lihat");
    await waitFor(() => text().includes("s3cr3t-value"), "revealed secret");
  });

  test("tokens, users, logs and settings tabs load their data", async () => {
    await mount();
    await click("Token & Sesi");
    await waitFor(() => text().includes("abcdefghijkl..."), "token row");
    await click("Pengguna");
    await waitFor(() => text().includes("(Anda)"), "user row");
    await click("Log Aktivitas");
    await waitFor(() => text().includes("/health"), "log row");
    expect(text()).toContain("1.2ms");
    await click("Pengaturan");
    await waitFor(() => text().includes("https://gw.example.com/health"), "settings links");
  });

  test("the add-server dialog opens and switches between HTTP and CLI fields", async () => {
    await mount();
    await click("Server MCP");
    await waitFor(() => text().includes("Tambah Server MCP"), "servers tab");
    await click("Tambah Server MCP");
    expect(text()).toContain("Upstream URL");
    await click("CLI / Stdio");
    expect(text()).toContain("Test Perintah Sekarang");
  });

  test("the token dialog lists clients and issues a token", async () => {
    routes["/api/admin/tokens/generate"] = { ok: true, token: "tok_123", expiresAt: 1_900_000_000_000 };
    await mount();
    await click("Buat Token Akses");
    await waitFor(() => text().includes("Claude Desktop (claude-desktop)"), "client option");
    await click("Terbitkan Token");
    await waitFor(() => text().includes("Token Akses Berhasil Dibuat"), "result");
    expect(text()).toContain("Bearer tok_123");
    expect(calls).toContain("/api/admin/tokens/generate");
  });
});
