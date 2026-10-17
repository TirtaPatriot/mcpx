import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { beforeAll, describe, expect, test } from "bun:test";
import { adminApi } from "../src/admin-api";
import { createAdminSession, getMcpServer, getOAuthClient, seedInitialData } from "../src/db";

const PRESET = { DOKPLOY_TOOL_PRESET: { values: ["minimal", "standard", "full"], description: "Size of the tool list" } };
let cookie = "";

beforeAll(() => {
  seedInitialData();
  createAdminSession("test-session-env", Date.now() + 3_600_000, "usr-admin");
  cookie = "admin_session=test-session-env";
});

const call = async (method: string, path: string, body?: unknown) => {
  const res = await adminApi.handle(
    new Request(`http://localhost/api/admin${path}`, {
      method,
      headers: { cookie, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
  return { status: res.status, json: (await res.json()) as Record<string, any> };
};

const server = (extra: Record<string, unknown> = {}) => ({ id: "dokploy", name: "Dokploy", server_type: "command", command: "bunx", args: "-y @dokploy/mcp", ...extra });

describe("server overridable variables", () => {
  test("a valid list is saved and returned", async () => {
    const saved = await call("POST", "/servers", server({ overridable_env: PRESET }));
    expect(saved.status).toBe(200);
    const list = await call("GET", "/servers");
    const row = list.json.servers.find((s: any) => s.id === "dokploy");
    expect(JSON.parse(row.overridable_env)).toEqual(PRESET);
  });

  test.each([
    ["a denied name", { PATH: {} }, "PATH"],
    ["a secret-looking name", { DOKPLOY_API_KEY: {} }, "DOKPLOY_API_KEY"],
    ["a malformed entry", { X: "no" }, "X"],
    ["21 variables", Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`VAR_${i}`, {}])), "at most 20"],
  ])("rejects %s and stores nothing", async (_why, bad, text) => {
    const before = getMcpServer("dokploy")!.overridable_env;
    const res = await call("PUT", "/servers/dokploy", { overridable_env: bad });
    expect(res.status).toBe(400);
    expect(res.json.error).toContain(text);
    expect(getMcpServer("dokploy")!.overridable_env).toBe(before);
  });

  test("an update that does not mention the list keeps it", async () => {
    await call("PUT", "/servers/dokploy", { name: "Dokploy MCP" });
    expect(JSON.parse(getMcpServer("dokploy")!.overridable_env)).toEqual(PRESET);
  });

  test("a JSON string is accepted too, like env_vars", async () => {
    const res = await call("PUT", "/servers/dokploy", { overridable_env: JSON.stringify(PRESET) });
    expect(res.status).toBe(200);
  });
});

describe("client environment overrides", () => {
  test("valid overrides are saved and returned", async () => {
    const saved = await call("POST", "/clients", { id: "gemini", name: "Gemini", env_overrides: { dokploy: { DOKPLOY_TOOL_PRESET: "minimal" } } });
    expect(saved.status).toBe(200);
    expect(JSON.parse(getOAuthClient("gemini")!.env_overrides)).toEqual({ dokploy: { DOKPLOY_TOOL_PRESET: "minimal" } });
    const list = await call("GET", "/clients");
    expect(JSON.parse(list.json.clients.find((c: any) => c.id === "gemini").env_overrides)).toEqual({ dokploy: { DOKPLOY_TOOL_PRESET: "minimal" } });
  });

  test.each([
    ["a value that is not listed", { dokploy: { DOKPLOY_TOOL_PRESET: "huge" } }, "minimal, standard, full"],
    ["an unknown server", { ghost: { X: "1" } }, "unknown server"],
    ["a variable the server does not list", { dokploy: { OTHER: "1" } }, "OTHER"],
  ])("rejects %s", async (_why, bad, text) => {
    const res = await call("PUT", "/clients/gemini", { env_overrides: bad });
    expect(res.status).toBe(400);
    expect(res.json.error).toContain(text);
    expect(JSON.parse(getOAuthClient("gemini")!.env_overrides)).toEqual({ dokploy: { DOKPLOY_TOOL_PRESET: "minimal" } });
  });

  test("an update that does not mention them keeps them, and an empty object clears them", async () => {
    await call("PUT", "/clients/gemini", { name: "Gemini mobile" });
    expect(JSON.parse(getOAuthClient("gemini")!.env_overrides)).toEqual({ dokploy: { DOKPLOY_TOOL_PRESET: "minimal" } });
    await call("PUT", "/clients/gemini", { env_overrides: {} });
    expect(JSON.parse(getOAuthClient("gemini")!.env_overrides)).toEqual({});
  });
});

describe("existing databases", () => {
  test("a database created before these columns gains them on start", () => {
    const path = join(mkdtempSync(join(tmpdir(), "mcpx-old-")), "old.db");
    const old = new Database(path);
    // The tables exactly as they were before these two columns existed.
    old.run(
      "CREATE TABLE mcp_servers (id TEXT PRIMARY KEY, name TEXT NOT NULL, url TEXT NOT NULL DEFAULT '', headers TEXT NOT NULL DEFAULT '{}', server_type TEXT NOT NULL DEFAULT 'http', command TEXT DEFAULT '', args TEXT DEFAULT '', env_vars TEXT DEFAULT '{}', enabled INTEGER NOT NULL DEFAULT 1, description TEXT DEFAULT '', icon TEXT DEFAULT '', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)",
    );
    old.run(
      "CREATE TABLE oauth_clients (id TEXT PRIMARY KEY, name TEXT NOT NULL, secret TEXT NOT NULL, redirect_uris TEXT NOT NULL DEFAULT '', enabled INTEGER NOT NULL DEFAULT 1, icon TEXT DEFAULT '', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)",
    );
    old.close();
    const script = `import "./src/db"; import { Database } from "bun:sqlite"; const d = new Database(process.env.DB_PATH!); const cols = (t: string) => d.query("PRAGMA table_info(" + t + ")").all().map((c: any) => c.name); console.log(JSON.stringify({ s: cols("mcp_servers"), c: cols("oauth_clients") }));`;
    const run = Bun.spawnSync(["bun", "-e", script], { cwd: join(import.meta.dir, ".."), env: { ...process.env, DB_PATH: path, ADMIN_PASSWORD: "x" } });
    expect(run.exitCode, run.stderr.toString()).toBe(0);
    const out = JSON.parse(run.stdout.toString().trim().split("\n").pop()!);
    expect(out.s).toContain("overridable_env");
    expect(out.c).toContain("env_overrides");
  });
});
