import { emptyRow, overridableErrors, type OverridableRow } from "../overridable";
import { Field, inputCls, monoInputCls } from "../ui";

/**
 * The "Overridable variables" part of the server dialog: which environment variables a connecting
 * AI app or OAuth client may change. The rules come from src/env-policy.ts, so what is refused here
 * is exactly what the API refuses.
 */
export function OverridableEnvEditor(props: { rows: OverridableRow[]; onChange: (rows: OverridableRow[]) => void }) {
  const { rows, onChange } = props;
  const { rowErrors, listError } = overridableErrors(rows);
  const update = (i: number, patch: Partial<OverridableRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <section aria-labelledby="overridable-heading" class="space-y-3 rounded-xl border border-dark-700 p-3">
      <div>
        <h4 id="overridable-heading" class="text-sm font-medium text-strong">
          Overridable variables
        </h4>
        <p class="text-[11px] text-slate-400 mt-0.5">
          AI apps and OAuth clients can change these when they connect, for example to ask for a shorter tool list. List only settings that are safe for anyone who can connect to
          change. The values are not secret, so keys, tokens and passwords cannot be listed.
        </p>
      </div>

      {rows.length === 0 && <p class="text-[11px] text-slate-500">Nothing can be overridden yet.</p>}

      {rows.map((row, i) => (
        <div key={i} role="group" aria-label={`Overridable variable ${i + 1}`} class="space-y-2 rounded-lg bg-dark-900/60 p-2.5">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Field label="Variable name" error={rowErrors[i] ?? undefined}>
              <input type="text" value={row.name} onInput={(e) => update(i, { name: e.currentTarget.value })} placeholder="DOKPLOY_TOOL_PRESET" class={monoInputCls} />
            </Field>
            <Field label="Allowed values" hint="Separate with commas. Leave empty to accept any text.">
              <input type="text" value={row.values} onInput={(e) => update(i, { values: e.currentTarget.value })} placeholder="minimal, standard, full" class={monoInputCls} />
            </Field>
          </div>
          <Field label="Description (optional)">
            <input type="text" value={row.description} onInput={(e) => update(i, { description: e.currentTarget.value })} placeholder="Size of the tool list" class={inputCls} />
          </Field>
          <div class="flex justify-end">
            <button
              type="button"
              aria-label={`Remove variable ${row.name.trim() || i + 1}`}
              onClick={() => onChange(rows.filter((_, j) => j !== i))}
              class="text-red-400 hover:underline text-xs"
            >
              Remove
            </button>
          </div>
        </div>
      ))}

      {listError && (
        <p role="alert" class="text-[11px] text-red-400">
          {listError}
        </p>
      )}

      <button type="button" onClick={() => onChange([...rows, emptyRow()])} class="text-blue-400 hover:underline text-xs">
        + Add variable
      </button>
    </section>
  );
}
