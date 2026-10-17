import axe from "axe-core";
import { describe, expect, test } from "bun:test";
import { render } from "preact";
import type { ConsentPageData } from "../../src/consent-data";
import { ConsentView } from "../src/components/ConsentView";
import { Login } from "../src/components/LoginForm";
import { SERVER, byRole, click, clickEl, mount, press, routes, tick, useHarness, waitFor, text } from "./harness";

useHarness();

/**
 * Runs axe-core's WCAG A/AA rules on the current page and fails with a readable list.
 * Rules that need real layout (colour contrast, tap-target size) are off here: the palette is
 * checked in theme.test.ts, and both were audited in a real browser.
 */
async function expectAccessible(label: string) {
  const result = await axe.run(document.body, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"] },
    rules: { "color-contrast": { enabled: false }, "target-size": { enabled: false }, region: { enabled: false }, "landmark-one-main": { enabled: false }, "page-has-heading-one": { enabled: false } },
  });
  const found = result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ").slice(0, 70)).join(" | ")}`);
  expect(found, label).toEqual([]);
}

const TABS = ["Overview", "MCP Servers", "OAuth Clients", "Users", "Tokens & Sessions", "Activity Log", "Settings"];

describe("dashboard sections", () => {
  for (const tab of TABS) {
    test(tab, async () => {
      await mount();
      await click(tab);
      await waitFor(() => !document.querySelector('[aria-hidden="true"] .animate-pulse'), "loaded");
      await tick();
      await expectAccessible(tab);
    });
  }
});

describe("dialogs and menus", () => {
  const open = async (tab: string, button: string) => {
    await mount();
    await click(tab);
    await waitFor(() => !document.querySelector('[aria-hidden="true"] .animate-pulse'), "loaded");
    await click(button);
  };

  test("add server", async () => {
    await open("MCP Servers", "Add MCP server");
    await expectAccessible("add server (HTTP)");
    await click("CLI / Stdio");
    await expectAccessible("add server (command)");
  });
  test("add server with overridable variables, one of them invalid", async () => {
    await open("MCP Servers", "Add MCP server");
    await click("CLI / Stdio");
    await click("Add variable");
    await click("Add variable");
    const names = [...document.querySelectorAll<HTMLInputElement>("label")].filter((l) => l.textContent === "Variable name").map((l) => document.getElementById(l.getAttribute("for")!) as HTMLInputElement);
    names[0].value = "DOKPLOY_TOOL_PRESET";
    names[0].dispatchEvent(new Event("input", { bubbles: true }));
    names[1].value = "PATH";
    names[1].dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    expect(document.querySelector('[role="alert"]')).not.toBeNull();
    await expectAccessible("overridable variables, one invalid");
  });
  test("connect to a server", async () => {
    await open("MCP Servers", "Connect");
    await expectAccessible("connect dialog");
  });
  test("add client, client guide", async () => {
    await open("OAuth Clients", "Add OAuth client");
    await expectAccessible("add client");
    await press("Escape");
    await click("AI guide");
    await expectAccessible("AI guide");
  });
  test("add user", async () => {
    await open("Users", "Add user");
    await expectAccessible("add user");
  });
  test("create access token", async () => {
    await open("Tokens & Sessions", "Create access token");
    await expectAccessible("token dialog");
  });
  test("row menu and delete confirmation", async () => {
    await mount();
    await click("MCP Servers");
    await waitFor(() => text().includes("/mcp/dokploy/*"), "row");
    await clickEl(document.querySelector('button[aria-label^="More actions for"]'));
    await expectAccessible("row menu");
    await clickEl(byRole("menuitem", "Delete server"));
    await waitFor(() => !!byRole("dialog", "Delete"), "confirm");
    await expectAccessible("confirmation");
  });
  test("keyboard shortcuts list", async () => {
    await mount();
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "?", bubbles: true }));
    await tick();
    await expectAccessible("shortcuts");
  });
});

describe("sign-in and consent pages", () => {
  test("sign in", async () => {
    render(<Login />, document.getElementById("app")!);
    await tick();
    await expectAccessible("sign in");
  });

  const consent: ConsentPageData = {
    kind: "consent",
    client: { name: "Claude", iconUrl: "/icons/claude.svg" },
    clientName: "Claude Desktop",
    clientId: "claude-desktop",
    servers: { items: [{ name: "Dokploy MCP", iconUrl: "/icons/dokploy.svg" }], more: 2, requested: false },
    user: { name: "Administrator", username: "admin" },
    redirectOrigin: "https://claude.ai",
    scope: "mcp",
    fields: { state: "x" },
  };
  test("consent", async () => {
    render(<ConsentView data={consent} />, document.getElementById("app")!);
    await expectAccessible("consent");
  });
  test("message", async () => {
    render(<ConsentView data={{ kind: "message", title: "Invalid request", message: "client_id is missing" }} />, document.getElementById("app")!);
    await expectAccessible("message page");
  });
});

describe("the audit itself", () => {
  test("catches real problems, so a clean result means something", async () => {
    // If axe could not see anything in this environment, every test above would pass for the wrong reason.
    document.getElementById("app")!.innerHTML = '<img src="x.png"><input type="text"><button></button><select><option>a</option></select><a href="#"></a>';
    const result = await axe.run(document.body, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] }, rules: { "color-contrast": { enabled: false } } });
    const ids = result.violations.map((v) => v.id);
    expect(ids).toContain("image-alt");
    expect(ids).toContain("label");
    expect(ids).toContain("button-name");
    expect(ids).toContain("select-name");
    expect(ids).toContain("link-name");
  });
});

describe("client dialog with environment overrides", () => {
  test("passes axe with a select, a free-text field and a stale-override notice", async () => {
    const original = { servers: routes["/api/admin/servers"], clients: routes["/api/admin/clients"] };
    routes["/api/admin/servers"] = {
      ok: true,
      servers: [{ ...SERVER, id: "dokploy", name: "Dokploy MCP", overridable_env: JSON.stringify({ DOKPLOY_TOOL_PRESET: { values: ["minimal", "full"], description: "Size" }, REGION_HINT: { description: "Free text" } }) }],
    };
    routes["/api/admin/clients"] = {
      ok: true,
      clients: [{ id: "gemini", name: "Gemini", secret: "s", redirect_uris: "", icon: "", enabled: true, env_overrides: JSON.stringify({ dokploy: { DOKPLOY_TOOL_PRESET: "minimal", GONE: "x" } }), active_tokens: { access: 0, refresh: 0 } }],
    };
    await mount();
    await click("OAuth Clients");
    await waitFor(() => text().includes("gemini"), "client row");
    await clickEl(document.querySelector('button[aria-label^="Edit ("]'));
    await waitFor(() => text().includes("no longer allowed"), "section with notice");
    await expectAccessible("client dialog with overrides");
    Object.assign(routes, { "/api/admin/servers": original.servers, "/api/admin/clients": original.clients });
  });
});

describe("connect dialog with the URL builder", () => {
  test("passes axe with a chosen value and an invalid free-text value", async () => {
    const original = routes["/api/admin/servers"];
    routes["/api/admin/servers"] = {
      ok: true,
      servers: [{ ...SERVER, id: "dokploy", name: "Dokploy MCP", overridable_env: JSON.stringify({ DOKPLOY_TOOL_PRESET: { values: ["minimal", "full"] }, REGION_HINT: {} }) }],
    };
    await mount();
    await click("MCP Servers");
    await waitFor(() => !!document.querySelector('button[aria-label^="Connect ("]'), "connect button");
    await clickEl(document.querySelector('button[aria-label^="Connect ("]'));
    await waitFor(() => !!document.querySelector("[data-url-builder]"), "builder");
    const select = [...document.querySelectorAll("label")].find((l) => l.textContent === "DOKPLOY_TOOL_PRESET");
    const field = document.getElementById(select!.getAttribute("for")!) as HTMLSelectElement;
    field.value = "minimal";
    field.dispatchEvent(new Event("change", { bubbles: true }));
    const free = document.getElementById([...document.querySelectorAll("label")].find((l) => l.textContent === "REGION_HINT")!.getAttribute("for")!) as HTMLInputElement;
    free.value = "a".repeat(300);
    free.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    expect(document.querySelector('[data-url-builder] [role="alert"]')).not.toBeNull();
    await expectAccessible("connect dialog with URL builder");
    routes["/api/admin/servers"] = original;
  });
});
