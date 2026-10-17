import { describe, expect, test } from "bun:test";
import {
  buildOverrideUrl,
  denyReason,
  overrideKey,
  overridesFromUrl,
  parseClientOverrides,
  parseOverridableEnv,
  resolveOverrides,
  stripEnvParams,
  validateValue,
  type OverridableEnv,
} from "../src/env-policy";

const PRESET: OverridableEnv = { DOKPLOY_TOOL_PRESET: { values: ["minimal", "standard", "full"], description: "Size of the tool list" } };

describe("denyReason", () => {
  test.each(["PATH", "Path", "LD_PRELOAD", "DYLD_INSERT_LIBRARIES", "NODE_OPTIONS", "PYTHONPATH", "GOFLAGS", "npm_config_registry", "ADMIN_PASSWORD", "MCP_PASSTHROUGH_ENV"])(
    "%s can never be listed",
    (name) => {
      expect(denyReason(name)).toBeString();
    },
  );

  test("an ordinary behaviour switch is allowed", () => {
    expect(denyReason("DOKPLOY_TOOL_PRESET")).toBeNull();
  });

  test.each(["DOKPLOY_API_KEY", "X_Token", "MY_SECRET", "DB_PASSWD", "SERVICE_CREDENTIAL"])("%s looks like a secret and says so", (name) => {
    expect(denyReason(name)).toMatch(/secret|credential/i);
  });

  test("the reason for PATH says what it controls", () => {
    expect(denyReason("PATH")).toContain("controls which programs run");
  });
});

describe("parseOverridableEnv", () => {
  test("the Dokploy example parses to the same object", () => {
    expect(parseOverridableEnv(JSON.stringify(PRESET))).toEqual({ ok: true, value: PRESET });
    expect(parseOverridableEnv(PRESET)).toEqual({ ok: true, value: PRESET });
  });

  test.each(["{}", "", undefined, null])("%p means nothing is overridable", (raw) => {
    expect(parseOverridableEnv(raw)).toEqual({ ok: true, value: {} });
  });

  test.each([
    ["a name that is not upper case", { dokploy_x: {} }, "dokploy_x"],
    ["a denied name", { PATH: {} }, "PATH"],
    ["a secret-looking name", { DOKPLOY_API_KEY: {} }, "DOKPLOY_API_KEY"],
    ["values that are not an array", { X: { values: "a" } }, "X"],
    ["a non-string value", { X: { values: ["a", 1] } }, "X"],
    ["an entry that is not an object", { X: "a" }, "X"],
  ])("rejects %s and names the offender", (_why, raw, offender) => {
    const r = parseOverridableEnv(raw);
    expect(r.ok).toBe(false);
    expect(r.ok ? "" : r.error).toContain(offender);
  });

  test("rejects an array and invalid JSON", () => {
    expect(parseOverridableEnv("[]").ok).toBe(false);
    expect(parseOverridableEnv("{nope").ok).toBe(false);
  });

  test("rejects more than 20 variables", () => {
    const many = Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`VAR_${i}`, {}]));
    const r = parseOverridableEnv(many);
    expect(r.ok ? "" : r.error).toContain("at most 20");
  });
});

describe("validateValue", () => {
  test("accepts a listed value", () => {
    expect(validateValue("DOKPLOY_TOOL_PRESET", "minimal", PRESET.DOKPLOY_TOOL_PRESET)).toBeNull();
  });
  test("rejects an unlisted value and names the valid ones", () => {
    expect(validateValue("DOKPLOY_TOOL_PRESET", "huge", PRESET.DOKPLOY_TOOL_PRESET)).toContain("minimal, standard, full");
  });
  test("rejects an empty value", () => {
    expect(validateValue("X", "", {})).toContain("must not be empty");
  });
  test("rejects a value longer than 256 characters but accepts 256", () => {
    expect(validateValue("X", "a".repeat(257), {})).toBeString();
    expect(validateValue("X", "a".repeat(256), {})).toBeNull();
  });
  test.each(["a\nb", "a\u0000b", "a\rb"])("rejects control characters (%p)", (v) => {
    expect(validateValue("X", v, {})).toBeString();
  });
  test("accepts '=', spaces and non-ASCII in free text", () => {
    expect(validateValue("X", "a=b ü", {})).toBeNull();
  });
});

describe("overridesFromUrl", () => {
  test("reads env.* parameters and ignores the rest", () => {
    expect(overridesFromUrl(new URL("https://x/mcp/a?env.DOKPLOY_TOOL_PRESET=minimal&x=1"))).toEqual({ ok: true, value: { DOKPLOY_TOOL_PRESET: "minimal" } });
  });
  test("no env.* parameters gives an empty object", () => {
    expect(overridesFromUrl(new URL("https://x/mcp/a?x=1"))).toEqual({ ok: true, value: {} });
  });
  test("a repeated parameter is rejected, not resolved silently", () => {
    const r = overridesFromUrl(new URL("https://x/mcp/a?env.X=a&env.X=b"));
    expect(r.ok ? "" : r.error).toContain("more than once");
  });
  test("21 distinct env.* parameters are rejected", () => {
    const qs = Array.from({ length: 21 }, (_, i) => `env.V${i}=1`).join("&");
    expect(overridesFromUrl(new URL(`https://x/mcp/a?${qs}`)).ok).toBe(false);
  });
  test("percent-encoded values are decoded", () => {
    expect(overridesFromUrl(new URL("https://x/mcp/a?env.X=a%20b%3Dc"))).toEqual({ ok: true, value: { X: "a b=c" } });
  });
});

describe("resolveOverrides", () => {
  test("a URL value beats a client value", () => {
    const r = resolveOverrides({ allowed: PRESET, client: { DOKPLOY_TOOL_PRESET: "minimal" }, url: { DOKPLOY_TOOL_PRESET: "full" } });
    expect(r).toEqual({ ok: true, value: { env: { DOKPLOY_TOOL_PRESET: "full" }, skipped: [] } });
  });
  test("a client value applies when the URL says nothing", () => {
    const r = resolveOverrides({ allowed: PRESET, client: { DOKPLOY_TOOL_PRESET: "minimal" }, url: {} });
    expect(r.ok && r.value.env).toEqual({ DOKPLOY_TOOL_PRESET: "minimal" });
  });
  test("nothing configured gives an empty result", () => {
    expect(resolveOverrides({ allowed: {}, url: {} })).toEqual({ ok: true, value: { env: {}, skipped: [] } });
  });
  test("a URL name that is not listed fails and names it", () => {
    const r = resolveOverrides({ allowed: PRESET, url: { NOPE: "1" } });
    expect(r.ok ? "" : r.error).toContain("NOPE is not overridable");
  });
  test("a lower-case URL name is not a match", () => {
    const r = resolveOverrides({ allowed: PRESET, url: { dokploy_tool_preset: "minimal" } });
    expect(r.ok ? "" : r.error).toContain("is not overridable");
  });
  test("an invalid URL value fails with the value rule's text", () => {
    const r = resolveOverrides({ allowed: PRESET, url: { DOKPLOY_TOOL_PRESET: "huge" } });
    expect(r.ok ? "" : r.error).toContain("minimal, standard, full");
  });
  test("a stale client override is skipped and does not fail", () => {
    const r = resolveOverrides({ allowed: PRESET, client: { GONE: "1", DOKPLOY_TOOL_PRESET: "minimal" }, url: {} });
    expect(r).toEqual({ ok: true, value: { env: { DOKPLOY_TOOL_PRESET: "minimal" }, skipped: ["GONE"] } });
  });
  test("a client value that is no longer valid is skipped", () => {
    const r = resolveOverrides({ allowed: PRESET, client: { DOKPLOY_TOOL_PRESET: "huge" }, url: {} });
    expect(r).toEqual({ ok: true, value: { env: {}, skipped: ["DOKPLOY_TOOL_PRESET"] } });
  });
});

describe("overrideKey", () => {
  test("no overrides give an empty key", () => {
    expect(overrideKey({})).toBe("");
  });
  test("the order of the entries does not matter", () => {
    expect(overrideKey({ A: "1", B: "2" })).toBe(overrideKey({ B: "2", A: "1" }));
  });
  test("different values give different keys", () => {
    expect(overrideKey({ A: "1" })).not.toBe(overrideKey({ A: "2" }));
    expect(overrideKey({ A: "1", B: "2" })).not.toBe(overrideKey({ A: "12" }));
  });
  test("the key is 8 hex digits", () => {
    expect(overrideKey({ A: "1" })).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe("parseClientOverrides", () => {
  const allowedFor = (id: string) => (id === "dokploy" ? PRESET : null);
  test("a valid set round-trips", () => {
    const raw = { dokploy: { DOKPLOY_TOOL_PRESET: "minimal" } };
    expect(parseClientOverrides(raw, allowedFor)).toEqual({ ok: true, value: raw });
  });
  test.each(["{}", undefined, null, ""])("%p means no overrides", (raw) => {
    expect(parseClientOverrides(raw, allowedFor)).toEqual({ ok: true, value: {} });
  });
  test("an unknown server is rejected", () => {
    const r = parseClientOverrides({ ghost: { X: "1" } }, allowedFor);
    expect(r.ok ? "" : r.error).toContain("unknown server");
  });
  test("a variable the server does not list is rejected", () => {
    const r = parseClientOverrides({ dokploy: { OTHER: "1" } }, allowedFor);
    expect(r.ok ? "" : r.error).toContain("OTHER");
  });
  test("an invalid value is rejected", () => {
    const r = parseClientOverrides({ dokploy: { DOKPLOY_TOOL_PRESET: "huge" } }, allowedFor);
    expect(r.ok ? "" : r.error).toContain("minimal, standard, full");
  });
});

describe("buildOverrideUrl", () => {
  test("builds the example URL", () => {
    expect(buildOverrideUrl("https://gw.example.com", "dokploy", { DOKPLOY_TOOL_PRESET: "minimal" })).toBe(
      "https://gw.example.com/mcp/dokploy?env.DOKPLOY_TOOL_PRESET=minimal",
    );
  });
  test("percent-encodes values and sorts names", () => {
    expect(buildOverrideUrl("https://gw", "a", { B: "x y", A: "1&2" })).toBe("https://gw/mcp/a?env.A=1%262&env.B=x%20y");
  });
  test("no overrides gives the bare URL", () => {
    expect(buildOverrideUrl("https://gw", "a", {})).toBe("https://gw/mcp/a");
  });
});

describe("stripEnvParams", () => {
  test("removes env.* and keeps the other parameters in order", () => {
    expect(stripEnvParams(new URL("https://x/mcp/a?env.A=1&keep=2&env.B=3")).toString()).toBe("https://x/mcp/a?keep=2");
  });
  test("a URL without env.* is returned equal", () => {
    expect(stripEnvParams(new URL("https://x/mcp/a?keep=2&z=1")).toString()).toBe("https://x/mcp/a?keep=2&z=1");
  });
  test("the input is not mutated", () => {
    const input = new URL("https://x/mcp/a?env.A=1");
    stripEnvParams(input);
    expect(input.search).toBe("?env.A=1");
  });
});
