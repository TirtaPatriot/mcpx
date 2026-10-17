import { describe, expect, test } from "bun:test";
import { render } from "preact";
import { SERVER, byRole, calls, click, clickEl, mount, press, requests, routes, text, tick, useHarness, waitFor } from "./harness";

useHarness();

describe("dashboard", () => {
  test("shows the shell, the user badge and the temporary-password warning", async () => {
    await mount();
    expect(text()).toContain("Administrator");
    expect(text()).toContain("temporary password");
  });

  test("overview loads stats and uses the public origin in the guides", async () => {
    await mount();
    await waitFor(() => text().includes("1.3.0"), "stats");
    expect(text()).toContain("Connect an AI app");
    expect(text()).toContain("https://gw.example.com/oauth/authorize");
    await click("Claude Desktop / Code");
    expect(text()).toContain("https://gw.example.com/mcp/dokploy");
  });

  test("servers tab renders rows and escapes HTML in names", async () => {
    await mount();
    await click("MCP Servers");
    await waitFor(() => text().includes("/mcp/dokploy/*"), "server row");
    expect(text()).toContain("Dokploy <b>MCP</b>");
    expect(document.querySelector("tbody b")).toBeNull();
    expect(document.querySelector("td[data-label='Status']")).not.toBeNull();
  });

  test("clients tab hides the secret until revealed", async () => {
    await mount();
    await click("OAuth Clients");
    await waitFor(() => text().includes("claude-desktop"), "client row");
    expect(text()).toContain("3 active sessions");
    expect(text()).not.toContain("s3cr3t-value");
    await click("Show");
    await waitFor(() => text().includes("s3cr3t-value"), "revealed secret");
  });

  test("tokens, users, logs and settings tabs load their data", async () => {
    await mount();
    await click("Tokens & Sessions");
    await waitFor(() => text().includes("abcdefghijkl..."), "token row");
    await click("Users");
    await waitFor(() => text().includes("(you)"), "user row");
    await click("Activity Log");
    await waitFor(() => text().includes("/health"), "log row");
    expect(text()).toContain("1.2ms");
    await click("Settings");
    await waitFor(() => text().includes("https://gw.example.com/health"), "settings links");
  });

  test("the add-server dialog opens and switches between HTTP and CLI fields", async () => {
    await mount();
    await click("MCP Servers");
    await waitFor(() => text().includes("Add MCP server"), "servers tab");
    await click("Add MCP server");
    expect(text()).toContain("Upstream URL");
    await click("CLI / Stdio");
    expect(text()).toContain("Test command now");
  });

  test("the token dialog lists clients and issues a token", async () => {
    routes["/api/admin/tokens/generate"] = { ok: true, token: "tok_123", expiresAt: 1_900_000_000_000 };
    await mount();
    await click("Create access token");
    await waitFor(() => text().includes("Claude Desktop (claude-desktop)"), "client option");
    await click("Issue token");
    await waitFor(() => text().includes("Access token created"), "result");
    expect(text()).toContain("Bearer tok_123");
    expect(calls).toContain("/api/admin/tokens/generate");
  });
});

describe("login redirect target", () => {
  test("only internal paths are accepted", async () => {
    const { safeNext } = await import("../src/components/LoginForm");
    const at = (next: string) => {
      history.replaceState(null, "", `/?next=${encodeURIComponent(next)}`);
      return safeNext();
    };
    expect(at("/oauth/authorize?client_id=x")).toBe("/oauth/authorize?client_id=x");
    expect(at("//evil.com")).toBe("/admin");
    expect(at("/\\evil.com")).toBe("/admin");
    expect(at("/\t/evil.com")).toBe("/admin");
    expect(at("/.//evil.com")).toBe("/admin");
    expect(at("/a/..//evil.com")).toBe("/admin");
    expect(at("https://evil.com")).toBe("/admin");
    expect(at("")).toBe("/admin");
  });
});

describe("safe destructive actions", () => {
  async function openDeleteConfirm() {
    await mount();
    await click("MCP Servers");
    await waitFor(() => text().includes("/mcp/dokploy/*"), "server row");
    await clickEl(document.querySelector('button[aria-label^="More actions for"]'));
    await clickEl(byRole("menuitem", "Delete server"));
    await waitFor(() => !!byRole("dialog", "Delete"), "confirm dialog");
  }

  test("deleting a server asks first, says what happens, and does nothing until confirmed", async () => {
    await openDeleteConfirm();
    expect(text()).toContain("AI clients will no longer reach");
    expect(requests.some((r) => r.method === "DELETE")).toBe(false);
    await click("Delete server"); // the confirm button
    await waitFor(() => requests.some((r) => r.method === "DELETE" && r.path === "/api/admin/servers/dokploy"), "DELETE request");
  });

  test("cancelling the confirmation keeps the server", async () => {
    await openDeleteConfirm();
    await click("Cancel");
    expect(byRole("dialog", "Delete")).toBeUndefined();
    expect(requests.some((r) => r.method === "DELETE")).toBe(false);
  });

  test("Escape closes only the top-most dialog", async () => {
    await mount();
    await click("MCP Servers");
    await waitFor(() => text().includes("/mcp/dokploy/*"), "server row");
    await click("Add MCP server");
    expect(byRole("dialog", "Add MCP server")).toBeDefined();
    await press("Escape");
    expect(byRole("dialog", "Add MCP server")).toBeUndefined();
  });

  test("the row menu opens with the keyboard-friendly menu roles and closes on Escape", async () => {
    await mount();
    await click("MCP Servers");
    await waitFor(() => text().includes("/mcp/dokploy/*"), "server row");
    const trigger = document.querySelector('button[aria-label^="More actions for"]')!;
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    await clickEl(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(byRole("menu", "Actions for")).toBeDefined();
    byRole("menu", "Actions for")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await tick();
    expect(byRole("menu", "Actions for")).toBeUndefined();
  });
});

describe("finding things", () => {
  test("search narrows the server list and explains an empty result", async () => {
    routes["/api/admin/servers"] = { ok: true, servers: [SERVER, { ...SERVER, id: "filesystem", name: "Filesystem", command: "", url: "http://fs" }] };
    await mount();
    await click("MCP Servers");
    await waitFor(() => text().includes("/mcp/filesystem/*"), "both rows");
    const box = document.querySelector<HTMLInputElement>('input[aria-label="Search MCP servers"]')!;
    box.value = "files";
    box.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    expect(text()).toContain("/mcp/filesystem/*");
    expect(text()).not.toContain("/mcp/dokploy/*");
    box.value = "zzz";
    box.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    expect(text()).toContain('No server matches "zzz"');
    routes["/api/admin/servers"] = { ok: true, servers: [SERVER] };
  });

  test("an empty list offers the next step", async () => {
    routes["/api/admin/servers"] = { ok: true, servers: [] };
    await mount();
    await click("MCP Servers");
    await waitFor(() => text().includes("No MCP servers yet"), "empty state");
    await click("Add MCP server"); // the call to action in the empty state or the header
    expect(byRole("dialog", "Add MCP server")).toBeDefined();
    routes["/api/admin/servers"] = { ok: true, servers: [SERVER] };
  });
});

describe("forms", () => {
  test("invalid JSON is flagged in place and blocks saving", async () => {
    await mount();
    await click("MCP Servers");
    await waitFor(() => text().includes("/mcp/dokploy/*"), "server row");
    await click("Add MCP server");
    const headers = document.querySelector<HTMLTextAreaElement>("textarea")!;
    headers.value = "{not json";
    headers.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    expect(text()).toContain("Not valid JSON");
    expect(document.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
    headers.value = '{"Authorization": "Bearer x"}';
    headers.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    expect(text()).not.toContain("Not valid JSON");
    expect(document.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false);
  });

  test("the sign-in password can be revealed and hidden again", async () => {
    const { Login } = await import("../src/components/LoginForm");
    render(<Login />, document.getElementById("app")!);
    await tick();
    const input = document.querySelector<HTMLInputElement>("#password")!;
    expect(input.type).toBe("password");
    await click("Show");
    expect(input.type).toBe("text");
    await click("Hide");
    expect(input.type).toBe("password");
  });
});

describe("getting started", () => {
  test("a fresh install shows the two steps, and each step leads somewhere", async () => {
    const stats = routes["/api/admin/stats"] as { stats: { servers: { total: number }; tokens: { access: number; refresh: number } } };
    const original = JSON.stringify(stats);
    stats.stats.servers.total = 0;
    stats.stats.tokens.access = 0;
    stats.stats.tokens.refresh = 0;
    await mount();
    await waitFor(() => text().includes("Get started"), "checklist");
    expect(text()).toContain("Add an MCP server");
    expect(text()).toContain("Give an AI app access");
    await click("Add server");
    await waitFor(() => text().includes("MCP servers") && location.hash === "#servers", "servers tab");
    routes["/api/admin/stats"] = JSON.parse(original);
  });

  test("once set up the checklist is gone and the status strip links to each area", async () => {
    await mount();
    await waitFor(() => text().includes("Connect an AI app"), "overview");
    expect(text()).not.toContain("Get started");
    await clickEl([...document.querySelectorAll("button")].find((b) => b.textContent?.startsWith("OAuth clients")));
    await waitFor(() => location.hash === "#clients", "navigated to clients");
  });
});

describe("theme", () => {
  const themeButton = () => document.querySelector<HTMLButtonElement>('button[aria-label^="Theme:"]')!;

  test("the toggle cycles system, light, dark and remembers the choice", async () => {
    localStorage.removeItem("mcpx-theme");
    await mount();
    expect(themeButton().getAttribute("aria-label")).toContain("Theme: System");

    await clickEl(themeButton());
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("mcpx-theme")).toBe("light");
    expect(themeButton().getAttribute("aria-label")).toContain("Theme: Light");

    await clickEl(themeButton());
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("mcpx-theme")).toBe("dark");

    await clickEl(themeButton());
    expect(localStorage.getItem("mcpx-theme")).toBeNull();
    expect(themeButton().getAttribute("aria-label")).toContain("Theme: System");
  });
});

describe("keyboard shortcuts", () => {
  const key = async (k: string, target: EventTarget = document.body) => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
    await tick();
  };

  test("g then a letter jumps to a section", async () => {
    await mount();
    await key("g");
    await key("s");
    expect(location.hash).toBe("#servers");
    await key("g");
    await key("c");
    expect(location.hash).toBe("#clients");
    await key("g");
    await key(",");
    expect(location.hash).toBe("#settings");
  });

  test("a stray g followed by an unknown key does nothing", async () => {
    await mount();
    await key("g");
    await key("z");
    expect(location.hash).toBe("");
  });

  test("/ focuses the search box of the current list", async () => {
    await mount();
    await click("MCP Servers");
    await waitFor(() => !!document.querySelector('input[type="search"]'), "search box");
    await key("/");
    expect(document.activeElement).toBe(document.querySelector('input[type="search"]'));
  });

  test("? lists the shortcuts, and shortcuts are ignored while typing", async () => {
    await mount();
    await key("?");
    expect(byRole("dialog", "Keyboard shortcuts")).toBeDefined();
    await press("Escape");
    expect(byRole("dialog", "Keyboard shortcuts")).toBeUndefined();

    await click("MCP Servers");
    await waitFor(() => !!document.querySelector('input[type="search"]'), "search box");
    const box = document.querySelector<HTMLInputElement>('input[type="search"]')!;
    box.focus();
    await key("g", box);
    await key("c", box);
    expect(location.hash).toBe("#servers");
  });

  test("Shift+/ counts as ? on layouts that report it that way", async () => {
    await mount();
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "/", shiftKey: true, bubbles: true }));
    await tick();
    expect(byRole("dialog", "Keyboard shortcuts")).toBeDefined();
  });

  test("shortcuts do nothing while a dialog is open", async () => {
    await mount();
    await click("MCP Servers");
    await waitFor(() => text().includes("/mcp/dokploy/*"), "server row");
    await click("Add MCP server");
    await key("g");
    await key("c");
    expect(location.hash).toBe("#servers");
  });
});

describe("dialog focus", () => {
  const dialog = () => byRole("dialog", "Add MCP server")!;
  const focusables = () => [...dialog().querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href]')];
  const tab = async (shift = false) => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: shift, bubbles: true, cancelable: true }));
    await tick();
  };

  async function openAddServer() {
    await mount();
    await click("MCP Servers");
    await waitFor(() => text().includes("/mcp/dokploy/*"), "server row");
    const opener = [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("Add MCP server"))!;
    opener.focus();
    await clickEl(opener);
    return opener;
  }

  test("opening a dialog moves focus to its first field", async () => {
    await openAddServer();
    expect(dialog().contains(document.activeElement)).toBe(true);
    expect(document.activeElement!.tagName).toBe("INPUT");
  });

  test("Tab wraps from the last control to the first, and Shift+Tab the other way", async () => {
    await openAddServer();
    const list = focusables();
    list[list.length - 1].focus();
    await tab();
    expect(document.activeElement).toBe(list[0]);
    list[0].focus();
    await tab(true);
    expect(document.activeElement).toBe(list[list.length - 1]);
  });

  test("closing a dialog returns focus to the button that opened it", async () => {
    const opener = await openAddServer();
    await press("Escape");
    expect(byRole("dialog", "Add MCP server")).toBeUndefined();
    expect(document.activeElement).toBe(opener);
  });

  test("the page behind a dialog does not scroll", async () => {
    await openAddServer();
    expect(document.body.style.overflow).toBe("hidden");
    await press("Escape");
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  test("a section change moves focus to the content and updates the title", async () => {
    await mount();
    await click("OAuth Clients");
    expect(document.activeElement?.id).toBe("main");
    expect(document.title).toBe("OAuth Clients — MCP X");
  });

  test("the platform tabs follow the arrow-key pattern", async () => {
    await mount();
    const tabs = () => [...document.querySelectorAll<HTMLElement>('[role="tab"]')];
    expect(tabs()[0].getAttribute("aria-selected")).toBe("true");
    expect(tabs().filter((t) => t.tabIndex === 0).length).toBe(1);
    tabs()[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    await tick();
    expect(tabs()[1].getAttribute("aria-selected")).toBe("true");
    expect(document.querySelector('[role="tabpanel"]')!.getAttribute("aria-labelledby")).toBe(tabs()[1].id);
    tabs()[1].dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    await tick();
    expect(tabs()[tabs().length - 1].getAttribute("aria-selected")).toBe("true");
  });
});
