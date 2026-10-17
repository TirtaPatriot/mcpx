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
    expect(safeNextPath("//evil.com")).toBe("/admin");
    expect(safeNextPath("/\\evil.com")).toBe("/admin");
    expect(safeNextPath("https://evil.com")).toBe("/admin");
    expect(safeNextPath("")).toBe("/admin");
  });
});
