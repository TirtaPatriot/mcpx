import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "bun:test";

const SRC = join(import.meta.dir, "../src");
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : path.endsWith(".tsx") ? [path] : [];
  });

// Pictograms and symbols that are decoration, not information.
const DECORATION = /[●○✓✗⋯↗→]|\p{Extended_Pictographic}|&rarr;/u;

test("decorative symbols are hidden from screen readers", () => {
  // Otherwise a reader announces "bar chart Overview" or "rightwards arrow". A symbol is fine when an
  // aria-hidden wrapper opens within a few lines above it, or when an aria-label replaces the content.
  const offenders: string[] = [];
  for (const file of files(SRC)) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      if (!DECORATION.test(line) || /^\s*(\/\/|\/\*|\*)/.test(line)) return;
      const nearby = lines.slice(Math.max(0, i - 6), i + 1).join("\n");
      const hidden = /aria-hidden|aria-label=/.test(nearby);
      // Data such as the tab icon table is hidden where it is rendered; the rendering line is checked instead.
      const data = /^\s*\{ id: "/.test(line);
      if (!hidden && !data) offenders.push(`${file.replace(SRC, "src")}:${i + 1}: ${line.trim().slice(0, 80)}`);
    });
  }
  expect(offenders).toEqual([]);
});

test("a logo next to a heading that names the product is decorative", () => {
  for (const file of ["App.tsx", "components/LoginForm.tsx"]) {
    expect(readFileSync(join(SRC, file), "utf8")).not.toMatch(/<img src="\/logo\.png" alt="[^"]+"/);
  }
});

test("only shapes pulse, never text, and every pulse stops for people who ask for less motion", () => {
  // A pulsing text lowers its own contrast at the dim point of the animation.
  const offenders: string[] = [];
  for (const file of files(SRC)) {
    readFileSync(file, "utf8").split("\n").forEach((line, i) => {
      if (!line.includes("animate-pulse")) return;
      const isShape = /\bbg-[a-z0-9/-]+/.test(line) && !/text-\[|text-xs|text-sm/.test(line);
      if (!isShape || !line.includes("motion-reduce:animate-none")) offenders.push(`${file.replace(SRC, "src")}:${i + 1}`);
    });
  }
  expect(offenders).toEqual([]);
});
