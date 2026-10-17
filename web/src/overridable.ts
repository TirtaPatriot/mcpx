import { MAX_LISTED, parseOverridableEnv, type OverridableEnv } from "../../src/env-policy";

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
