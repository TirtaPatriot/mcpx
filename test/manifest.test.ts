import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const root = join(import.meta.dir, "..");
const manifest = JSON.parse(readFileSync(join(root, "public/manifest.webmanifest"), "utf8"));

describe("web manifest", () => {
  test("has the fields browsers need to offer installation", () => {
    expect(manifest.name).toBe("MCP X");
    expect(manifest.start_url).toBe("/admin");
    expect(manifest.display).toBe("standalone");
    const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    expect(manifest.icons.some((i: { purpose: string }) => i.purpose === "maskable")).toBe(true);
  });

  test("start_url sits inside the scope", () => {
    expect(manifest.start_url.startsWith(manifest.scope)).toBe(true);
  });

  test("every icon it lists exists under public/", () => {
    for (const icon of manifest.icons as { src: string }[]) {
      expect(existsSync(join(root, "public", icon.src))).toBe(true);
    }
  });

  test("both pages link to the manifest", () => {
    for (const page of ["index.html", "login.html"]) {
      expect(readFileSync(join(root, "web", page), "utf8")).toContain('rel="manifest" href="/manifest.webmanifest"');
    }
  });
});
