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
