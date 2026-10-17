import { describe, expect, test } from "bun:test";
import { SERVER, byRole, click, clickEl, mount, requests, routes, text, tick, useHarness, waitFor } from "./harness";

useHarness();

const ID_LABEL = "ID slug (letters, digits, dashes, e.g. dokploy or filesystem)";
const DOKPLOY_SPEC = { DOKPLOY_TOOL_PRESET: { values: ["minimal", "standard", "full"], description: "Size of the tool list" } };

/** Type into a field the way a person does, so the component's onInput handler runs. */
async function typeInto(el: Element | null | undefined, value: string) {
  if (!el) throw new Error("field not found");
  (el as HTMLInputElement).value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  await tick();
}
const fieldsLabelled = (label: string) =>
  [...document.querySelectorAll("label")]
    .filter((l) => l.textContent?.trim() === label)
    .map((l) => document.getElementById(l.getAttribute("for") ?? "") as HTMLInputElement | null);
const saveButton = () => [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.includes("Save server"))!;

async function openAddServer(type: "http" | "command" = "command") {
  await mount();
  await click("MCP Servers");
  await waitFor(() => text().includes("/mcp/dokploy/*"), "server row");
  await click("Add MCP server");
  if (type === "command") await click("CLI / Stdio");
}

describe("server dialog: overridable variables", () => {
  test("the section is there for a command server and not for an HTTP one", async () => {
    await openAddServer("http");
    expect(text()).not.toContain("Overridable variables");
    await click("CLI / Stdio");
    expect(text()).toContain("Overridable variables");
  });

  test("Add variable adds a row whose three fields each have a label", async () => {
    await openAddServer();
    expect(fieldsLabelled("Variable name").length).toBe(0);
    await click("Add variable");
    expect(fieldsLabelled("Variable name").length).toBe(1);
    expect(fieldsLabelled("Allowed values").length).toBe(1);
    expect(fieldsLabelled("Description (optional)").length).toBe(1);
  });

  test.each([
    ["PATH", "controls which programs run"],
    ["DOKPLOY_API_KEY", "looks like a secret"],
    ["dokploy_x", "not a valid variable name"],
    ["DOKPLOY_URL", "explicit list of values"],
  ])("%s is refused where it is typed, and saving is blocked", async (name, reason) => {
    await openAddServer();
    await click("Add variable");
    await typeInto(fieldsLabelled("Variable name")[0], name);
    const alert = document.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain(reason);
    expect(saveButton().disabled).toBe(true);
  });

  test("a name that points somewhere is accepted once exact values are listed", async () => {
    await openAddServer();
    await click("Add variable");
    await typeInto(fieldsLabelled("Variable name")[0], "DOKPLOY_URL");
    await typeInto(fieldsLabelled("Allowed values")[0], "https://dokploy.example.com");
    expect(document.querySelector('[role="alert"]')).toBeNull();
    expect(saveButton().disabled).toBe(false);
  });

  test("a variable listed twice is flagged", async () => {
    await openAddServer();
    await click("Add variable");
    await click("Add variable");
    const names = fieldsLabelled("Variable name");
    await typeInto(names[0], "DOKPLOY_TOOL_PRESET");
    await typeInto(names[1], "DOKPLOY_TOOL_PRESET");
    expect(text()).toContain("listed twice");
    expect(saveButton().disabled).toBe(true);
  });

  test("the saved payload carries the spec's Dokploy example", async () => {
    await openAddServer();
    await typeInto(fieldsLabelled(ID_LABEL)[0], "dokploy2");
    await typeInto(fieldsLabelled("Display name")[0], "Dokploy 2");
    await click("Add variable");
    await typeInto(fieldsLabelled("Variable name")[0], "DOKPLOY_TOOL_PRESET");
    await typeInto(fieldsLabelled("Allowed values")[0], "minimal, standard, full");
    await typeInto(fieldsLabelled("Description (optional)")[0], "Size of the tool list");
    await clickEl(saveButton());
    await waitFor(() => requests.some((r) => r.method === "POST" && r.path === "/api/admin/servers"), "save request");
    const sent = requests.find((r) => r.method === "POST" && r.path === "/api/admin/servers")!.body;
    expect(JSON.parse(sent.overridable_env)).toEqual(DOKPLOY_SPEC);
  });

  test("removing a row removes it from the payload", async () => {
    await openAddServer();
    await typeInto(fieldsLabelled(ID_LABEL)[0], "dokploy2");
    await typeInto(fieldsLabelled("Display name")[0], "Dokploy 2");
    await click("Add variable");
    await typeInto(fieldsLabelled("Variable name")[0], "DOKPLOY_TOOL_PRESET");
    await clickEl(document.querySelector('button[aria-label="Remove variable DOKPLOY_TOOL_PRESET"]'));
    expect(fieldsLabelled("Variable name").length).toBe(0);
    await clickEl(saveButton());
    await waitFor(() => requests.some((r) => r.method === "POST" && r.path === "/api/admin/servers"), "save request");
    expect(JSON.parse(requests.find((r) => r.method === "POST" && r.path === "/api/admin/servers")!.body.overridable_env)).toEqual({});
  });

  test("editing a server shows what it already lists", async () => {
    const original = routes["/api/admin/servers"];
    routes["/api/admin/servers"] = { ok: true, servers: [{ ...SERVER, overridable_env: JSON.stringify(DOKPLOY_SPEC) }] };
    await mount();
    await click("MCP Servers");
    await waitFor(() => text().includes("/mcp/dokploy/*"), "server row");
    const edit = document.querySelector<HTMLElement>('button[aria-label^="Edit ("]')!;
    await clickEl(edit);
    expect(byRole("dialog", "Edit MCP server")).toBeDefined();
    expect(fieldsLabelled("Variable name")[0]!.value).toBe("DOKPLOY_TOOL_PRESET");
    expect(fieldsLabelled("Allowed values")[0]!.value).toBe("minimal, standard, full");
    expect(fieldsLabelled("Description (optional)")[0]!.value).toBe("Size of the tool list");
    routes["/api/admin/servers"] = original;
  });
});

const CMD_WITH_VARS = { ...SERVER, id: "dokploy", name: "Dokploy MCP", overridable_env: JSON.stringify({ ...DOKPLOY_SPEC, REGION_HINT: { description: "Preferred region, free text" } }) };
const HTTP_WITH_VARS = { ...SERVER, id: "web", name: "Web server", server_type: "http", command: "", overridable_env: JSON.stringify(DOKPLOY_SPEC) };
const CMD_WITHOUT_VARS = { ...SERVER, id: "plain", name: "Plain server", overridable_env: "{}" };
const CLIENT = { id: "gemini", name: "Gemini", secret: "s", redirect_uris: "", icon: "", enabled: true, env_overrides: JSON.stringify({ dokploy: { DOKPLOY_TOOL_PRESET: "minimal" } }), active_tokens: { access: 0, refresh: 0 } };

const clientSave = () => [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.includes("Save client"))!;
const sentClient = () => requests.find((r) => (r.method === "PUT" || r.method === "POST") && r.path.startsWith("/api/admin/clients"))?.body;

async function openClientDialog(servers: unknown[], client: unknown = CLIENT) {
  const before = { servers: routes["/api/admin/servers"], clients: routes["/api/admin/clients"] };
  routes["/api/admin/servers"] = { ok: true, servers };
  routes["/api/admin/clients"] = { ok: true, clients: [client] };
  await mount();
  await click("OAuth Clients");
  await waitFor(() => text().includes(String((client as any).id)), "client row");
  await clickEl(document.querySelector('button[aria-label^="Edit ("]'));
  await waitFor(() => !!byRole("dialog", "Edit OAuth client"), "dialog");
  return () => Object.assign(routes, { "/api/admin/servers": before.servers, "/api/admin/clients": before.clients });
}

describe("client dialog: environment overrides", () => {
  test("only command servers that list variables are offered, under the server's name", async () => {
    const restore = await openClientDialog([CMD_WITH_VARS, HTTP_WITH_VARS, CMD_WITHOUT_VARS]);
    await waitFor(() => text().includes("Environment overrides"), "section");
    const section = document.querySelector('section[aria-labelledby="env-overrides-heading"]')!;
    expect(section.textContent).toContain("Dokploy MCP");
    expect(section.textContent).not.toContain("Web server");
    expect(section.textContent).not.toContain("Plain server");
    restore();
  });

  test("a variable with listed values is a select that starts at Default", async () => {
    const restore = await openClientDialog([CMD_WITH_VARS], { ...CLIENT, env_overrides: "{}" });
    await waitFor(() => fieldsLabelled("DOKPLOY_TOOL_PRESET").length > 0, "preset field");
    const select = fieldsLabelled("DOKPLOY_TOOL_PRESET")[0] as unknown as HTMLSelectElement;
    expect(select.tagName).toBe("SELECT");
    expect([...select.options].map((o) => o.textContent)).toEqual(["Default (no override)", "minimal", "standard", "full"]);
    expect(select.value).toBe("");
    restore();
  });

  test("a free-text variable is an input, and its description is the hint", async () => {
    const restore = await openClientDialog([CMD_WITH_VARS], { ...CLIENT, env_overrides: "{}" });
    await waitFor(() => fieldsLabelled("REGION_HINT").length > 0, "region field");
    expect(fieldsLabelled("REGION_HINT")[0]!.tagName).toBe("INPUT");
    expect(text()).toContain("Preferred region, free text");
    restore();
  });

  test("choosing a value is saved", async () => {
    const restore = await openClientDialog([CMD_WITH_VARS], { ...CLIENT, env_overrides: "{}" });
    await waitFor(() => fieldsLabelled("DOKPLOY_TOOL_PRESET").length > 0, "preset field");
    const select = fieldsLabelled("DOKPLOY_TOOL_PRESET")[0] as unknown as HTMLSelectElement;
    select.value = "minimal";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await tick();
    await clickEl(clientSave());
    await waitFor(() => !!sentClient(), "save");
    expect(sentClient().env_overrides).toEqual({ dokploy: { DOKPLOY_TOOL_PRESET: "minimal" } });
    restore();
  });

  test("choosing Default removes an existing override, and the empty server entry with it", async () => {
    const restore = await openClientDialog([CMD_WITH_VARS]);
    await waitFor(() => fieldsLabelled("DOKPLOY_TOOL_PRESET").length > 0, "preset field");
    const select = fieldsLabelled("DOKPLOY_TOOL_PRESET")[0] as unknown as HTMLSelectElement;
    expect(select.value).toBe("minimal");
    select.value = "";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await tick();
    await clickEl(clientSave());
    await waitFor(() => !!sentClient(), "save");
    expect(sentClient().env_overrides).toEqual({});
    restore();
  });

  test("an existing override is shown selected", async () => {
    const restore = await openClientDialog([CMD_WITH_VARS]);
    await waitFor(() => fieldsLabelled("DOKPLOY_TOOL_PRESET").length > 0, "preset field");
    expect((fieldsLabelled("DOKPLOY_TOOL_PRESET")[0] as unknown as HTMLSelectElement).value).toBe("minimal");
    restore();
  });

  test("an invalid free-text value is explained and blocks saving", async () => {
    const restore = await openClientDialog([CMD_WITH_VARS], { ...CLIENT, env_overrides: "{}" });
    await waitFor(() => fieldsLabelled("REGION_HINT").length > 0, "region field");
    await typeInto(fieldsLabelled("REGION_HINT")[0], "a".repeat(300));
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("at most 256 characters");
    expect(clientSave().disabled).toBe(true);
    restore();
  });

  test("with no eligible server the section explains why and points to the servers", async () => {
    const restore = await openClientDialog([CMD_WITHOUT_VARS], { ...CLIENT, env_overrides: "{}" });
    await waitFor(() => text().includes("No server lists overridable variables yet"), "empty explanation");
    await click("Choose variables on a server");
    expect(byRole("dialog", "Edit OAuth client")).toBeUndefined();
    expect(location.hash).toBe("#servers");
    restore();
  });

  test("a saved override the server no longer allows is dropped on save, with a notice", async () => {
    const stale = { ...CLIENT, env_overrides: JSON.stringify({ dokploy: { DOKPLOY_TOOL_PRESET: "minimal", GONE: "x" }, vanished: { A: "1" } }) };
    const restore = await openClientDialog([CMD_WITH_VARS], stale);
    await waitFor(() => text().includes("no longer allowed"), "notice");
    await clickEl(clientSave());
    await waitFor(() => !!sentClient(), "save");
    expect(sentClient().env_overrides).toEqual({ dokploy: { DOKPLOY_TOOL_PRESET: "minimal" } });
    restore();
  });
});

describe("Connect dialog: URL builder", () => {
  const BASE = "https://gw.example.com/mcp/dokploy";
  const copyButton = () => [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.trim() === "Copy URL");
  const shownUrl = () => document.querySelector('[data-url-builder] [aria-live="polite"]')?.textContent;

  async function openConnect(servers: unknown[]) {
    const before = routes["/api/admin/servers"];
    routes["/api/admin/servers"] = { ok: true, servers };
    await mount();
    await click("MCP Servers");
    await waitFor(() => !!document.querySelector('button[aria-label^="Connect ("]'), "connect button");
    await clickEl(document.querySelector('button[aria-label^="Connect ("]'));
    await waitFor(() => !!byRole("dialog", "Connect to"), "dialog");
    return () => (routes["/api/admin/servers"] = before);
  }
  const choose = async (variable: string, value: string) => {
    const el = fieldsLabelled(variable)[0] as unknown as HTMLSelectElement | HTMLInputElement;
    el.value = value;
    el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
    await tick();
  };

  test("starts with the plain endpoint", async () => {
    const restore = await openConnect([CMD_WITH_VARS]);
    expect(shownUrl()).toBe(BASE);
    restore();
  });

  test("choosing a value puts it in the URL, and Default takes it out again", async () => {
    const restore = await openConnect([CMD_WITH_VARS]);
    await choose("DOKPLOY_TOOL_PRESET", "minimal");
    expect(shownUrl()).toBe(`${BASE}?env.DOKPLOY_TOOL_PRESET=minimal`);
    await choose("DOKPLOY_TOOL_PRESET", "");
    expect(shownUrl()).toBe(BASE);
    restore();
  });

  test("Copy URL copies exactly the URL shown and says so", async () => {
    const restore = await openConnect([CMD_WITH_VARS]);
    const copied: string[] = [];
    Object.defineProperty(navigator, "clipboard", { value: { writeText: (t: string) => (copied.push(t), Promise.resolve()) }, configurable: true });
    await choose("DOKPLOY_TOOL_PRESET", "minimal");
    await clickEl(copyButton());
    expect(copied).toEqual([`${BASE}?env.DOKPLOY_TOOL_PRESET=minimal`]);
    expect(text()).toContain("Copied to clipboard!");
    restore();
  });

  test("an invalid value is explained and Copy URL is off", async () => {
    const restore = await openConnect([CMD_WITH_VARS]);
    await choose("REGION_HINT", "a".repeat(300));
    expect(document.querySelector('[data-url-builder] [role="alert"]')?.textContent).toContain("at most 256 characters");
    expect(copyButton()!.disabled).toBe(true);
    restore();
  });

  test("the URL is announced politely when it changes, and the note names the alternative", async () => {
    const restore = await openConnect([CMD_WITH_VARS]);
    expect(document.querySelector('[data-url-builder] [aria-live="polite"]')).not.toBeNull();
    expect(document.querySelector("[data-url-builder]")!.textContent).toContain("must keep the query string");
    expect(document.querySelector("[data-url-builder]")!.textContent).toContain("per OAuth client");
    restore();
  });

  test("a server without overridable variables shows no builder", async () => {
    const restore = await openConnect([CMD_WITHOUT_VARS]);
    expect(document.querySelector("[data-url-builder]")).toBeNull();
    restore();
  });
});
