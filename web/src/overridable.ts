import { MAX_LISTED, parseOverridableEnv, validateValue, type ClientEnvOverrides, type OverridableEnv } from "../../src/env-policy";
import type { McpServer } from "./types";

/** One line of the "Overridable variables" editor, as the admin types it. */
export interface OverridableRow {
  name: string;
  /** Comma-separated valid values; empty means any text. */
  values: string;
  description: string;
}

export const emptyRow = (): OverridableRow => ({ name: "", values: "", description: "" });

const isBlank = (r: OverridableRow) => !r.name.trim() && !r.values.trim() && !r.description.trim();

const splitValues = (values: string) =>
  values
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

function rowToSpec(row: OverridableRow) {
  const values = splitValues(row.values);
  const description = row.description.trim();
  return { ...(values.length > 0 ? { values } : {}), ...(description ? { description } : {}) };
}

/** The stored JSON of a server turns back into editable rows. */
export function specToRows(raw: string | undefined): OverridableRow[] {
  const parsed = parseOverridableEnv(raw);
  const spec: OverridableEnv = parsed.ok ? parsed.value : {};
  return Object.entries(spec).map(([name, s]) => ({ name, values: (s.values ?? []).join(", "), description: s.description ?? "" }));
}

/** The rows as the JSON the API takes; blank rows are left out. */
export function rowsToJson(rows: OverridableRow[]): string {
  const spec: OverridableEnv = {};
  for (const row of rows) if (!isBlank(row) && row.name.trim()) spec[row.name.trim()] = rowToSpec(row);
  return JSON.stringify(spec);
}

/** What is wrong with the rows, one message per row (or null), plus a message about the list as a whole. */
export function overridableErrors(rows: OverridableRow[]): { rowErrors: (string | null)[]; listError: string | null; hasErrors: boolean } {
  const seen = new Set<string>();
  const rowErrors = rows.map((row) => {
    if (isBlank(row)) return null;
    const name = row.name.trim();
    if (!name) return "Give the variable a name";
    if (seen.has(name)) return `${name} is listed twice`;
    seen.add(name);
    const checked = parseOverridableEnv({ [name]: rowToSpec(row) });
    return checked.ok ? null : checked.error;
  });
  const count = rows.filter((r) => !isBlank(r)).length;
  const listError = count > MAX_LISTED ? `A server can list at most ${MAX_LISTED} overridable variables` : null;
  return { rowErrors, listError, hasErrors: Boolean(listError) || rowErrors.some(Boolean) };
}

/** A command server that lists at least one overridable variable, with that list. */
export interface EligibleServer {
  id: string;
  name: string;
  spec: OverridableEnv;
}

export function eligibleServers(servers: McpServer[]): EligibleServer[] {
  return servers.flatMap((s) => {
    if (s.server_type !== "command") return [];
    const parsed = parseOverridableEnv(s.overridable_env);
    return parsed.ok && Object.keys(parsed.value).length > 0 ? [{ id: s.id, name: s.name, spec: parsed.value }] : [];
  });
}

/** A client's saved overrides (JSON text from the API); anything unreadable counts as none. */
export function parseClientEnv(raw: string | undefined): ClientEnvOverrides {
  try {
    const value = JSON.parse(raw || "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const out: ClientEnvOverrides = {};
    for (const [server, vars] of Object.entries(value as Record<string, unknown>)) {
      if (!vars || typeof vars !== "object" || Array.isArray(vars)) continue;
      const clean = Object.fromEntries(Object.entries(vars).filter(([, v]) => typeof v === "string")) as Record<string, string>;
      if (Object.keys(clean).length > 0) out[server] = clean;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Keeps only the overrides a server still allows, and counts the rest. A server can later drop a
 * variable or change its valid values; saving the old setting would be refused by the API, so it is
 * dropped here and the admin is told.
 */
export function pruneClientEnv(eligible: EligibleServer[], value: ClientEnvOverrides): { value: ClientEnvOverrides; removed: number } {
  const out: ClientEnvOverrides = {};
  let removed = 0;
  for (const [serverId, vars] of Object.entries(value)) {
    const server = eligible.find((e) => e.id === serverId);
    for (const [name, v] of Object.entries(vars)) {
      const spec = server?.spec[name];
      if (spec && !validateValue(name, v, spec)) (out[serverId] ??= {})[name] = v;
      else removed++;
    }
  }
  return { value: out, removed };
}

/** Sets or clears one override, dropping a server entry that becomes empty. */
export function withOverride(value: ClientEnvOverrides, serverId: string, name: string, v: string): ClientEnvOverrides {
  const next: ClientEnvOverrides = { ...value, [serverId]: { ...value[serverId] } };
  if (v === "") delete next[serverId][name];
  else next[serverId][name] = v;
  if (Object.keys(next[serverId]).length === 0) delete next[serverId];
  return next;
}

/** True when any chosen value is not valid for its variable. */
export function clientEnvInvalid(eligible: EligibleServer[], value: ClientEnvOverrides): boolean {
  return Object.entries(value).some(([serverId, vars]) =>
    Object.entries(vars).some(([name, v]) => {
      const spec = eligible.find((e) => e.id === serverId)?.spec[name];
      return !spec || validateValue(name, v, spec) !== null;
    }),
  );
}
