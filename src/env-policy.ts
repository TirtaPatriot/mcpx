/**
 * The rules for overriding the environment of an MCP server process.
 *
 * Everything that decides what may be overridden lives here, as pure functions with no server
 * imports, so the gateway, the admin API and the dashboard all apply exactly the same rules.
 * See docs/design/2026-10-18-env-overrides.md.
 */

export interface OverridableSpec {
  /** When present, only these values are accepted. */
  values?: string[];
  description?: string;
}

/** Variable name → what may be set. Stored per server. */
export type OverridableEnv = Record<string, OverridableSpec>;

/** Server id → variable name → value. Stored per OAuth client. */
export type ClientEnvOverrides = Record<string, Record<string, string>>;

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export const MAX_LISTED = 20;
export const MAX_URL_OVERRIDES = 20;
export const MAX_VALUE_LENGTH = 256;

const NAME_RULE = /^[A-Z][A-Z0-9_]{0,63}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const SECRET_LOOKING = /KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|PASSWD/i;

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const has = (obj: object, key: string) => Object.prototype.hasOwnProperty.call(obj, key);

// Names that can never be listed, grouped by why. Matching is case-insensitive.
const GATEWAY_SETTINGS = new Set(["ADMIN_PASSWORD", "CLIENT_ID", "CLIENT_SECRET", "MCP_SERVERS", "DB_PATH", "PUBLIC_URL", "MCP_PASSTHROUGH_ENV"]);
const PROGRAM_LOOKUP = new Set(["PATH", "HOME", "SHELL", "IFS"]);
const SHELL_STARTUP = new Set(["BASH_ENV", "ENV", "PROMPT_COMMAND"]);
// Runtimes and tools that read an environment variable to decide what code to load on start.
const RUNTIME_EXACT = new Set(["JAVA_TOOL_OPTIONS", "_JAVA_OPTIONS", "JDK_JAVA_OPTIONS", "GCONV_PATH"]);
const RUNTIME_PREFIXES = ["NODE_", "DENO_", "PERL", "RUBY"];
const NETWORK_ROUTING = new Set(["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY", "FTP_PROXY"]);
const TRUST_STORE = new Set(["SSL_CERT_FILE", "SSL_CERT_DIR", "REQUESTS_CA_BUNDLE", "CURL_CA_BUNDLE"]);
const LOADER_PREFIXES = ["LD_", "DYLD_"];
// Go toolchain variables (GOFLAGS, GOPATH, GOPROXY, ...) never contain an underscore,
// which keeps unrelated names such as GOOGLE_PROJECT_ID usable.
const GO_TOOLCHAIN = /^GO[A-Z0-9]*$/;
const TOOL_PREFIXES = ["PYTHON", "GIT_", "UV_", "BUN_", "NPM_"];

// A name that points at somewhere (a URL, host, directory, file) or runs something (a command,
// script, plugin) can send a server's own credentials or data elsewhere when set to free text,
// so such a variable is only accepted together with the exact values that may be used.
const POINTS_OR_RUNS = /URL|URI|HOST|ENDPOINT|ADDR|PROXY|CMD|COMMAND|EXEC|SCRIPT|PLUGIN|DIR|FILE|PATH/i;

/**
 * Why `name` can never be made overridable, or null when it can be listed.
 * The text is shown to the admin, so it says what the variable would let someone do.
 */
export function denyReason(name: string): string | null {
  const upper = name.toUpperCase();
  if (PROGRAM_LOOKUP.has(upper)) return `${name} cannot be overridden: it controls which programs run or how commands are read`;
  if (LOADER_PREFIXES.some((p) => upper.startsWith(p))) return `${name} cannot be overridden: it controls which libraries a program loads`;
  if (SHELL_STARTUP.has(upper) || upper.startsWith("BASH_FUNC_")) return `${name} cannot be overridden: it changes what a shell runs when it starts`;
  if (RUNTIME_EXACT.has(upper) || RUNTIME_PREFIXES.some((p) => upper.startsWith(p))) {
    return `${name} cannot be overridden: it changes how a runtime starts and can change which code runs`;
  }
  if (NETWORK_ROUTING.has(upper)) return `${name} cannot be overridden: it controls where network traffic goes`;
  if (TRUST_STORE.has(upper)) return `${name} cannot be overridden: it controls which certificates are trusted`;
  if (GATEWAY_SETTINGS.has(upper)) return `${name} cannot be overridden: it is a setting of the gateway itself`;
  if (GO_TOOLCHAIN.test(upper) || TOOL_PREFIXES.some((p) => upper.startsWith(p))) {
    return `${name} cannot be overridden: it configures a build or runtime tool and can change which code runs`;
  }
  if (SECRET_LOOKING.test(name)) {
    return `${name} looks like a secret (its name contains KEY, TOKEN, SECRET, PASSWORD or CREDENTIAL); values sent this way end up in URLs and logs, so secrets cannot be overridden`;
  }
  return null;
}

/** Error text when `value` is not acceptable for `name`, or null. */
export function validateValue(name: string, value: string, spec: OverridableSpec): string | null {
  if (value === "") return `${name} must not be empty`;
  if (value.length > MAX_VALUE_LENGTH) return `${name} must be at most ${MAX_VALUE_LENGTH} characters`;
  if (CONTROL.test(value)) return `${name} must not contain control characters or line breaks`;
  if (spec.values && spec.values.length > 0 && !spec.values.includes(value)) {
    return `${name} must be one of: ${spec.values.join(", ")}`;
  }
  return null;
}

/** Accepts the JSON text the API stores, or an already-parsed object; empty input means "nothing". */
function toObject(raw: unknown, what: string): Result<Record<string, unknown>> {
  let value = raw;
  if (value === undefined || value === null || value === "") return { ok: true, value: {} };
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return fail(`${what} must be valid JSON`);
    }
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return fail(`${what} must be a JSON object`);
  return { ok: true, value: value as Record<string, unknown> };
}

/** Checks the list an admin saves on a server. */
export function parseOverridableEnv(raw: unknown): Result<OverridableEnv> {
  const obj = toObject(raw, "Overridable variables");
  if (!obj.ok) return obj;
  const entries = Object.entries(obj.value);
  if (entries.length > MAX_LISTED) return fail(`A server can list at most ${MAX_LISTED} overridable variables`);

  const out: OverridableEnv = {};
  for (const [name, spec] of entries) {
    if (!NAME_RULE.test(name)) {
      return fail(`${name} is not a valid variable name: use upper-case letters, digits and underscores, starting with a letter`);
    }
    const reason = denyReason(name);
    if (reason) return fail(reason);
    if (typeof spec !== "object" || spec === null || Array.isArray(spec)) return fail(`${name}: the entry must be an object like {"values": [...]}`);

    const { values, description } = spec as { values?: unknown; description?: unknown };
    const clean: OverridableSpec = {};
    if (values !== undefined) {
      if (!Array.isArray(values) || values.some((v) => typeof v !== "string")) return fail(`${name}: "values" must be a list of strings`);
      const bad = (values as string[]).map((v) => validateValue(name, v, {})).find(Boolean);
      if (bad) return fail(`${name}: a listed value is not valid (${bad})`);
      clean.values = values as string[];
    }
    if (description !== undefined) {
      if (typeof description !== "string") return fail(`${name}: "description" must be text`);
      clean.description = description;
    }
    if (POINTS_OR_RUNS.test(name) && !(clean.values && clean.values.length > 0)) {
      return fail(`${name} points at somewhere or runs something, so it needs an explicit list of values (for example {"values": ["https://dokploy.example.com"]})`);
    }
    out[name] = clean;
  }
  return { ok: true, value: out };
}

/** Checks the overrides an admin saves on an OAuth client against each server's list. */
export function parseClientOverrides(raw: unknown, allowedFor: (serverId: string) => OverridableEnv | null): Result<ClientEnvOverrides> {
  const obj = toObject(raw, "Environment overrides");
  if (!obj.ok) return obj;

  const out: ClientEnvOverrides = {};
  for (const [serverId, vars] of Object.entries(obj.value)) {
    const allowed = allowedFor(serverId);
    if (!allowed) return fail(`${serverId} is an unknown server (or not a command server)`);
    if (typeof vars !== "object" || vars === null || Array.isArray(vars)) return fail(`${serverId}: overrides must be an object of NAME: value`);

    const clean: Record<string, string> = {};
    for (const [name, value] of Object.entries(vars as Record<string, unknown>)) {
      if (!has(allowed, name)) return fail(`${name} is not overridable on ${serverId}`);
      if (typeof value !== "string") return fail(`${name} must be text`);
      const problem = validateValue(name, value, allowed[name]);
      if (problem) return fail(problem);
      clean[name] = value;
    }
    if (Object.keys(clean).length > 0) out[serverId] = clean;
  }
  return { ok: true, value: out };
}

/** Reads `env.NAME=value` query parameters. A repeated name is an error, never a silent pick. */
export function overridesFromUrl(url: URL): Result<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [key, value] of url.searchParams) {
    if (!key.startsWith("env.")) continue;
    const name = key.slice(4);
    if (has(out, name)) return fail(`env.${name} was given more than once`);
    out[name] = value;
    if (Object.keys(out).length > MAX_URL_OVERRIDES) return fail(`A request can carry at most ${MAX_URL_OVERRIDES} env.* parameters`);
  }
  return { ok: true, value: out };
}

/**
 * Combines client and URL overrides for one connection. URL entries are checked strictly (the
 * person who typed them should see the problem); client entries leniently (a stale setting must
 * not break every request, so it is skipped and reported).
 */
export function resolveOverrides(input: {
  allowed: OverridableEnv;
  client?: Record<string, string>;
  url: Record<string, string>;
}): Result<{ env: Record<string, string>; skipped: string[] }> {
  const env: Record<string, string> = {};
  const skipped: string[] = [];

  for (const [name, value] of Object.entries(input.client ?? {})) {
    if (!has(input.allowed, name) || validateValue(name, value, input.allowed[name])) skipped.push(name);
    else env[name] = value;
  }
  for (const [name, value] of Object.entries(input.url)) {
    if (!has(input.allowed, name)) return fail(`${name} is not overridable on this server`);
    const problem = validateValue(name, value, input.allowed[name]);
    if (problem) return fail(problem);
    env[name] = value;
  }
  return { ok: true, value: { env, skipped } };
}

/**
 * A short key for an override set, used to give connections with different overrides their own
 * process. It separates processes of one token and is not a security boundary, so a small
 * dependency-free hash (FNV-1a) is enough; that also keeps this file usable in the browser.
 */
export function overrideKey(env: Record<string, string>): string {
  const entries = Object.entries(env).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  if (entries.length === 0) return "";
  const text = entries.map(([k, v]) => `${k}=${v}`).join("\n");
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** The server URL with the chosen overrides as `env.NAME=value` parameters, names sorted. */
export function buildOverrideUrl(origin: string, serverId: string, env: Record<string, string>): string {
  const base = `${origin.replace(/\/$/, "")}/mcp/${encodeURIComponent(serverId)}`;
  const query = Object.entries(env)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, value]) => `env.${name}=${encodeURIComponent(value)}`)
    .join("&");
  return query ? `${base}?${query}` : base;
}

/** A copy of `url` without `env.*` parameters; the other parameters stay exactly as sent. */
export function stripEnvParams(url: URL): URL {
  const copy = new URL(url.toString());
  const kept = url.search
    .slice(1)
    .split("&")
    .filter((segment) => {
      if (!segment) return false;
      const key = segment.split("=")[0].replace(/\+/g, " ");
      try {
        return !decodeURIComponent(key).startsWith("env.");
      } catch {
        return !key.startsWith("env.");
      }
    });
  copy.search = kept.join("&");
  return copy;
}
