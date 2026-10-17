import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { createWebServer, safeNextPath } from "../src/web";

function fakeDist() {
  const dir = mkdtempSync(join(tmpdir(), "mcpx-dist-"));
  mkdirSync(join(dir, "assets"));
  writeFileSync(join(dir, "index.html"), "<html>dashboard</html>");
  writeFileSync(join(dir, "login.html"), "<html>login</html>");
  writeFileSync(join(dir, "consent.html"), '<html><head><title>Allow access — MCP X</title></head><body><script id="consent-data" type="application/json">__CONSENT_DATA__</script></body></html>');
  writeFileSync(join(dir, "assets", "app-abc123.js"), "console.log(1)");
  return dir;
}

describe("serveAsset", () => {
  const web = createWebServer(fakeDist());

  test("serves built files with long-lived caching", async () => {
    const res = web.serveAsset("assets/app-abc123.js");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("immutable");
    expect(await res.text()).toBe("console.log(1)");
  });

  test("404 for unknown files and for paths that escape the build folder", () => {
    expect(web.serveAsset("assets/missing.js").status).toBe(404);
    expect(web.serveAsset("../package.json").status).toBe(404);
    expect(web.serveAsset("assets/../../package.json").status).toBe(404);
  });

  test("503 with a hint when the app has not been built", () => {
    const res = createWebServer(join(tmpdir(), "mcpx-no-such-dist")).serveAsset("assets/x.js");
    expect(res.status).toBe(503);
  });
});

describe("pages", () => {
  const web = createWebServer(fakeDist());

  test("login page is served without a session, never cached", async () => {
    const res = web.renderLoginPage(new Request("http://x/admin/login"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.text()).toContain("login");
  });

  test("dashboard redirects to the login page without a session", () => {
    const res = web.renderAdminPage(new Request("http://x/admin"));
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/admin/login");
  });
});

describe("safeNextPath", () => {
  test("allows internal paths only", () => {
    expect(safeNextPath("/oauth/authorize?x=1")).toBe("/oauth/authorize?x=1");
    expect(safeNextPath("/oauth/authorize?a=1#h")).toBe("/oauth/authorize?a=1#h");
    expect(safeNextPath("//evil.com")).toBe("/admin");
    expect(safeNextPath("/\\evil.com")).toBe("/admin");
    expect(safeNextPath("https://evil.com")).toBe("/admin");
    expect(safeNextPath("")).toBe("/admin");
    // characters that browsers strip or normalise into "//evil.com"
    expect(safeNextPath("/\t/evil.com")).toBe("/admin");
    expect(safeNextPath("/\n/evil.com")).toBe("/admin");
    expect(safeNextPath("/ /evil.com")).toBe("/admin");
    // dot segments that the parser removes, leaving "//evil.com"
    expect(safeNextPath("/.//evil.com")).toBe("/admin");
    expect(safeNextPath("/a/..//evil.com")).toBe("/admin");
    expect(safeNextPath("/%5Cevil.com")).toBe("/%5Cevil.com"); // stays an internal path; not normalised into a host
  });
});

describe("consent and message pages", () => {
  const web = createWebServer(fakeDist());
  const consent = (over: Record<string, unknown> = {}) => ({
    kind: "consent" as const,
    client: { name: "Claude", iconUrl: "/icons/claude.svg" },
    clientName: "Claude Desktop",
    clientId: "claude-desktop",
    servers: { items: [], more: 0, requested: false },
    redirectOrigin: "https://claude.ai",
    fields: { state: "abc" },
    ...over,
  });
  const dataOf = (html: string) => JSON.parse(html.match(/<script id="consent-data" type="application\/json">([\s\S]*?)<\/script>/)![1]);

  test("fills the page with the data and refuses to be framed", async () => {
    const res = await web.renderConsentPage(consent());
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const html = await res.text();
    expect(html).not.toContain("__CONSENT_DATA__");
    expect(dataOf(html).clientId).toBe("claude-desktop");
    expect(html).toContain("<title>Allow access: Claude — MCP X</title>");
  });

  test("data can never break out of the script tag", async () => {
    const evil = '</script><script>alert(1)</script>';
    const html = await (await web.renderConsentPage(consent({ clientName: evil, fields: { state: evil } }))).text();
    expect(html.match(/<script/g)!.length).toBe(1);
    expect(dataOf(html).clientName).toBe(evil);
  });

  test("a client name with $ patterns is not treated as a replacement pattern", async () => {
    const html = await (await web.renderConsentPage(consent({ clientName: "$& $1 $$" }))).text();
    expect(dataOf(html).clientName).toBe("$& $1 $$");
  });

  test("message pages carry their status and an escaped title", async () => {
    const res = await web.renderMessagePage("Invalid <request>", "client_id is missing", 400);
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(dataOf(html)).toEqual({ kind: "message", title: "Invalid <request>", message: "client_id is missing" });
    expect(html).toContain("<title>Invalid &lt;request&gt; — MCP X</title>");
  });

  test("503 with a hint when the app has not been built", async () => {
    const res = await createWebServer(join(tmpdir(), "mcpx-no-such-dist")).renderMessagePage("x", "y");
    expect(res.status).toBe(503);
  });
});
