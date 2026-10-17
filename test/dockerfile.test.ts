import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "bun:test";

const root = join(import.meta.dir, "..");
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(path) ? [path] : [];
  });

test("the image's web stage contains every server file the dashboard imports", () => {
  // The dashboard shares pure modules with the server (src/env-policy.ts, src/consent-data.ts). The
  // Docker web stage builds from a copy of the repo, so a shared file that is not copied there breaks
  // `bun run build` inside the image while everything passes on a developer's machine.
  const dockerfile = readFileSync(join(root, "Dockerfile"), "utf8");
  const stage = dockerfile.split(/^FROM /m).find((s) => /\sAS web\b/.test(s.split("\n")[0]));
  expect(stage, "a stage named web").toBeDefined();

  const shared = new Set<string>();
  for (const file of files(join(root, "web/src"))) {
    for (const m of readFileSync(file, "utf8").matchAll(/from\s+["'](?:\.\.\/)+src\/([\w-]+)["']/g)) shared.add(`src/${m[1]}.ts`);
  }
  expect(shared.size, "the dashboard does import shared server files").toBeGreaterThan(0);

  const copiesAllOfSrc = /^COPY\s+src\s/m.test(stage!);
  for (const file of shared) {
    expect(copiesAllOfSrc || stage!.includes(`COPY ${file}`), `${file} is copied into the web stage`).toBe(true);
  }
});
