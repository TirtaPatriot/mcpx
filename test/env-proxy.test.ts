import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createManualAccessToken, saveMcpServer, saveOAuthClient, seedInitialData } from "../src/db";
import { proxyMcpRequest, reloadMcpCache } from "../src/proxy";
import { closeAllStdioSessions } from "../src/stdio-manager";

const FIXTURE = join(import.meta.dir, "fixtures/env-echo-mcp.ts");
const PRESET = { DOKPLOY_TOOL_PRESET: { values: ["minimal", "standard", "full"] } };
let gemini = "";
let claude = "";

beforeAll(() => {
  seedInitialData();
  process.env.ADMIN_PASSWORD = "leak-me-if-you-can";
  process.env.CLIENT_SECRET = "leak-me-too";
  saveMcpServer({
    id: "echo",
    name: "Echo",
    server_type: "command",
    command: "bun",
    args: `"${FIXTURE}"`,
    env_vars: JSON.stringify({ BASE: "1" }),
    overridable_env: JSON.stringify(PRESET),
  });
  saveOAuthClient({ id: "gemini", name: "Gemini", secret: "s", env_overrides: JSON.stringify({ echo: { DOKPLOY_TOOL_PRESET: "minimal" } }) });
  saveOAuthClient({ id: "claude", name: "Claude", secret: "s" });
  gemini = createManualAccessToken("gemini", 3_600_000, "usr-admin").token;
  claude = createManualAccessToken("claude", 3_600_000, "usr-admin").token;
  reloadMcpCache();
});

afterAll(() => closeAllStdioSessions());

interface Seen {
  status: number;
  env: Record<string, string>;
  pid: number;
  /** The error body when the request was refused. */
  body?: { error: string; error_description: string };
}

async function readEnv(token: string, query = ""): Promise<Seen> {
  const res = await proxyMcpRequest({
    request: new Request(`http://localhost/mcp/echo${query}`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "env" } }),
    }),
    server: null,
  });
  const body = (await res.json()) as any;
  if (res.status !== 200) return { status: res.status, env: {}, pid: -1, body };
  return { status: 200, ...JSON.parse(body.result.content[0].text) };
}

describe("overrides reach the process", () => {
  test("a client override applies, and the server's own env_vars are still there", async () => {
    const r = await readEnv(gemini);
    expect(r.env.DOKPLOY_TOOL_PRESET).toBe("minimal");
    expect(r.env.BASE).toBe("1");
  });

  test("a client without an override sees no preset, and its request still succeeds", async () => {
    const r = await readEnv(claude);
    expect(r.status).toBe(200);
    expect(r.env.DOKPLOY_TOOL_PRESET).toBeUndefined();
  });

  test("a URL override beats the client's", async () => {
    const r = await readEnv(gemini, "?env.DOKPLOY_TOOL_PRESET=full");
    expect(r.env.DOKPLOY_TOOL_PRESET).toBe("full");
  });
});

describe("the process does not inherit the gateway's secrets", () => {
  test("neither ADMIN_PASSWORD nor CLIENT_SECRET is visible, even though a .env sits in the working directory", async () => {
    const r = await readEnv(claude);
    expect(r.env.ADMIN_PASSWORD ?? "").toBe("");
    expect(r.env.CLIENT_SECRET ?? "").toBe("");
  });
});

describe("a URL override that is wrong is refused", () => {
  test("an unlisted variable returns 400 and names it", async () => {
    const r = await readEnv(claude, "?env.NOPE=1");
    expect(r.status).toBe(400);
    expect(r.body!.error).toBe("invalid_env_override");
    expect(r.body!.error_description).toContain("NOPE");
  });

  test("a value that is not allowed returns 400 and names the valid ones", async () => {
    const r = await readEnv(claude, "?env.DOKPLOY_TOOL_PRESET=huge");
    expect(r.status).toBe(400);
    expect(r.body!.error_description).toContain("minimal, standard, full");
  });

  test("a repeated parameter returns 400", async () => {
    const r = await readEnv(claude, "?env.DOKPLOY_TOOL_PRESET=full&env.DOKPLOY_TOOL_PRESET=minimal");
    expect(r.status).toBe(400);
    expect(r.body!.error_description).toContain("more than once");
  });
});

describe("processes are separated by their overrides", () => {
  test("different overrides for the same token run in different processes; identical ones share one", async () => {
    const a = await readEnv(claude, "?env.DOKPLOY_TOOL_PRESET=minimal");
    const b = await readEnv(claude, "?env.DOKPLOY_TOOL_PRESET=full");
    const a2 = await readEnv(claude, "?env.DOKPLOY_TOOL_PRESET=minimal");
    expect(a.pid).not.toBe(b.pid);
    expect(a2.pid).toBe(a.pid);
  });

  test("two tokens never share a process", async () => {
    const a = await readEnv(gemini);
    const b = await readEnv(claude);
    expect(a.pid).not.toBe(b.pid);
  });
});

describe("a stale client override", () => {
  test("is skipped when the variable is no longer listed, and the request succeeds", async () => {
    saveMcpServer({ id: "echo", name: "Echo", server_type: "command", command: "bun", args: `"${FIXTURE}"`, env_vars: JSON.stringify({ BASE: "1" }), overridable_env: "{}" });
    reloadMcpCache();
    const stale = createManualAccessToken("gemini", 3_600_000, "usr-admin").token;
    const r = await readEnv(stale);
    expect(r.status).toBe(200);
    expect(r.env.DOKPLOY_TOOL_PRESET).toBeUndefined();
    saveMcpServer({ id: "echo", name: "Echo", server_type: "command", command: "bun", args: `"${FIXTURE}"`, env_vars: JSON.stringify({ BASE: "1" }), overridable_env: JSON.stringify(PRESET) });
    reloadMcpCache();
  });
});

describe("HTTP servers", () => {
  test("ignore env.* parameters and never forward them upstream", async () => {
    saveMcpServer({ id: "web", name: "Web", server_type: "http", url: "http://upstream.test/base" });
    reloadMcpCache();
    const seen: string[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      seen.push(String(input));
      return new Response("{}", { headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    try {
      const res = await proxyMcpRequest({
        request: new Request("http://localhost/mcp/web?env.A=1&keep=2", { method: "POST", headers: { authorization: `Bearer ${claude}`, "content-type": "application/json" }, body: "{}" }),
        server: null,
      });
      expect(res.status).toBe(200);
    } finally {
      globalThis.fetch = realFetch;
    }
    expect(seen).toEqual(["http://upstream.test/base?keep=2"]);
  });
});
