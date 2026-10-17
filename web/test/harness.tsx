import { afterEach, beforeEach } from "bun:test";
import { render } from "preact";
import { App } from "../src/App";

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

export const SERVER = { id: "dokploy", name: "Dokploy <b>MCP</b>", server_type: "command", url: "", headers: "", command: "bunx", args: "-y @dokploy/mcp", env_vars: "", icon: "", description: "", enabled: true };
export const CLIENT = { id: "claude-desktop", name: "Claude Desktop", secret: "s3cr3t-value", redirect_uris: "", icon: "", enabled: true, active_tokens: { access: 2, refresh: 1 } };

export const routes: Record<string, unknown> = {
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

/** Every request the app made, in order; reset before each test. */
export const calls: string[] = [];
export const requests: { method: string; path: string; body?: any }[] = [];
const realFetch = globalThis.fetch;

/** Registers the per-test setup: an empty page, a fake fetch backed by `routes`, and cleanup. */
export function useHarness() {
beforeEach(() => {
  calls.length = 0;
  requests.length = 0;
  document.body.innerHTML = '<div id="app"></div>';
  location.hash = "";
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), "http://localhost").pathname;
    const method = init?.method ?? "GET";
    calls.push(path);
    requests.push({ method, path, body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined });
    if (path in routes) return json(routes[path]);
    // Writes that have no canned response simply succeed.
    return method === "GET" ? json({ ok: false, error: `no route ${path}` }, 404) : json({ ok: true });
  }) as typeof fetch;
});
afterEach(() => {
  render(null, document.getElementById("app")!);
  globalThis.fetch = realFetch;
});
}

export const text = () => document.body.textContent ?? "";
export async function waitFor(check: () => boolean, what: string) {
  for (let i = 0; i < 100; i++) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`timeout waiting for: ${what}\n${text().slice(0, 400)}`);
}
export const press = async (key: string) => {
  document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  await tick();
};
export const byRole = (role: string, name: string) =>
  [...document.querySelectorAll<HTMLElement>(`[role="${role}"]`)].find((el) => el.textContent?.includes(name) || el.getAttribute("aria-label")?.includes(name));
export const clickEl = async (el: Element | null | undefined) => {
  if (!el) throw new Error("element not found");
  el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await tick();
};
export const tick = () => new Promise((r) => setTimeout(r, 0));
/** Click a button by its text, then wait for Preact to finish re-rendering. */
export const click = async (label: string) => {
  const btn = [...document.querySelectorAll("button")].find((b) => b.textContent?.includes(label));
  if (!btn) throw new Error(`button not found: ${label}`);
  btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await tick();
};

export async function mount() {
  render(<App />, document.getElementById("app")!);
  await waitFor(() => text().includes("Overview"), "app shell");
}
