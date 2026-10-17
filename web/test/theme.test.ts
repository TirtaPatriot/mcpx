import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { THEME_KEY } from "../src/theme";

const css = readFileSync(join(import.meta.dir, "../src/styles.css"), "utf8");

/** Read `--color-x: #hex;` declarations out of one CSS block. */
function vars(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)) out[m[1]] = m[2].toLowerCase();
  return out;
}
const darkTokens = vars(css.slice(css.indexOf("@theme"), css.indexOf("}", css.indexOf("@theme"))));
const lightTokens = vars(css.slice(css.indexOf(':root[data-theme="light"]'), css.indexOf("}", css.indexOf(':root[data-theme="light"]'))));

// Tailwind's own palette values for the shades the dark theme uses without redefining them.
const TAILWIND: Record<string, string> = {
  "slate-100": "#f1f5f9", "slate-200": "#e2e8f0", "slate-300": "#cbd5e1", "slate-400": "#94a3b8", "slate-500": "#64748b",
  "blue-400": "#60a5fa", "purple-400": "#c084fc", "emerald-400": "#34d399", "amber-400": "#fbbf24", "red-400": "#f87171", "indigo-400": "#818cf8",
};
const dark = { ...TAILWIND, ...darkTokens };
const light = { ...TAILWIND, ...darkTokens, ...lightTokens };

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// Text colours the dashboard uses, against the surfaces they sit on.
const TEXT = ["strong", "slate-200", "slate-300", "slate-400", "slate-500", "blue-400", "purple-400", "emerald-400", "amber-400", "red-400", "indigo-400"];
const SURFACES = ["dark-900", "dark-800"];

describe.each([
  ["dark", dark],
  ["light", light],
] as const)("%s theme text contrast (WCAG AA, 4.5:1)", (_name, palette) => {
  for (const text of TEXT) {
    for (const surface of SURFACES) {
      test(`${text} on ${surface}`, () => {
        expect(palette[text], `${text} is defined`).toBeDefined();
        expect(contrast(palette[text], palette[surface])).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});

describe("theme bootstrap", () => {
  test("both pages set the theme before first paint, with the same storage key as theme.ts", () => {
    for (const page of ["index.html", "login.html"]) {
      const html = readFileSync(join(import.meta.dir, "..", page), "utf8");
      expect(html).toContain(`getItem("${THEME_KEY}")`);
      expect(html).toContain("dataset.theme");
    }
  });
});

describe("theme-safe styles", () => {
  test("the stylesheet has no hard-coded colours outside variable declarations", () => {
    // A literal like rgba(31, 41, 55) would stay dark in the light theme (the mobile action buttons once did).
    const offenders = css
      .split("\n")
      .filter((line) => /#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(line))
      .filter((line) => !/^\s*--color-/.test(line))
      .filter((line) => !/outline: 2px solid|color: #fff/.test(line));
    expect(offenders).toEqual([]);
  });
});

describe("self-contained pages", () => {
  test("no page loads anything from a third party", () => {
    // A render-blocking request to another host stalls the page when that host is unreachable,
    // for example behind a firewall.
    for (const page of ["index.html", "login.html", "consent.html"]) {
      const html = readFileSync(join(import.meta.dir, "..", page), "utf8");
      expect(html.match(/(?:src|href)="https?:\/\/[^"]+"/g) ?? [], page).toEqual([]);
    }
    expect(css).not.toMatch(/url\(\s*["']?https?:\/\//);
    expect(css).not.toMatch(/@import\s+url\(/);
  });
});
