import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { render } from "preact";
import type { ConsentPageData } from "../../src/consent-data";
import { ConsentView } from "../src/components/ConsentView";

const base: Extract<ConsentPageData, { kind: "consent" }> = {
  kind: "consent",
  client: { name: "Claude", iconUrl: "/icons/claude.svg" },
  clientName: "Claude Desktop (MacBook)",
  clientId: "claude-desktop",
  servers: { items: [{ name: "Dokploy MCP", iconUrl: "/icons/dokploy.svg" }], more: 0, requested: false },
  user: { name: "Administrator", username: "admin" },
  redirectOrigin: "https://claude.ai",
  scope: "mcp",
  fields: { response_type: "code", client_id: "claude-desktop", state: "s<1>", code_challenge: "abc" },
};

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>';
});
afterEach(() => render(null, document.getElementById("app")!));

const mount = (data: ConsentPageData) => render(<ConsentView data={data} />, document.getElementById("app")!);
const text = () => document.body.textContent ?? "";

describe("consent page", () => {
  test("says who is asking, for what, and as whom", () => {
    mount(base);
    expect(document.querySelector("h1")!.textContent).toBe("Connect to your MCP servers?");
    expect(text()).toContain("Claude is asking for permission");
    expect(text()).toContain("Claude Desktop (MacBook)");
    expect(text()).toContain("Dokploy MCP");
    expect(text()).toContain("Administrator (@admin)");
    expect(text()).toContain("https://claude.ai");
    expect(text()).toContain("Run MCP tools on behalf of your account");
  });

  test("posts the OAuth parameters back as hidden fields, untouched", () => {
    mount(base);
    const form = document.querySelector("form")!;
    expect(form.getAttribute("method")).toBe("post");
    expect(form.getAttribute("action")).toBe("/oauth/authorize");
    const sent = Object.fromEntries([...form.querySelectorAll<HTMLInputElement>('input[type="hidden"]')].map((i) => [i.name, i.value]));
    expect(sent).toEqual(base.fields);
  });

  test("offers exactly two decisions, with Deny first in the DOM order for narrow screens", () => {
    mount(base);
    const buttons = [...document.querySelectorAll<HTMLButtonElement>('button[name="decision"]')];
    expect(buttons.map((b) => [b.value, b.textContent])).toEqual([
      ["deny", "Deny"],
      ["allow", "Allow access"],
    ]);
  });

  test("counts the servers that do not fit, and names a requested one as the target", () => {
    mount({ ...base, servers: { items: base.servers.items, more: 4, requested: false } });
    expect(text()).toContain("+4 more");
    mount({ ...base, servers: { items: base.servers.items, more: 0, requested: true } });
    expect(text()).toContain("Target server");
  });

  test("untrusted values are shown as text, never as markup", () => {
    mount({ ...base, clientName: "<img src=x onerror=alert(1)>", client: { ...base.client, name: "<b>Claude</b>" } });
    expect(document.querySelector("img[src='x']")).toBeNull();
    expect(document.querySelector("main b")).toBeNull();
    expect(text()).toContain("<img src=x onerror=alert(1)>");
  });

  test("is built from landmarks and a description list so assistive tech can read it", () => {
    mount(base);
    expect(document.querySelector("main")).not.toBeNull();
    expect(document.querySelectorAll("h1").length).toBe(1);
    expect(document.querySelector("dl")).not.toBeNull();
    // The pictures repeat what the heading and text already say, so they are decorative.
    const pictures = [...document.querySelectorAll("img")];
    expect(pictures.length).toBeGreaterThan(0);
    expect(pictures.every((img) => img.getAttribute("alt") === "")).toBe(true);
  });
});

describe("message page", () => {
  test("shows the title and the reason, announced as an alert", () => {
    mount({ kind: "message", title: "Invalid request", message: "client_id is missing" });
    expect(document.querySelector("h1")!.textContent).toBe("Invalid request");
    expect(document.querySelector('[role="alert"]')!.textContent).toBe("client_id is missing");
    expect(document.querySelector("form")).toBeNull();
  });
});
