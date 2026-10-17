import { validateValue, type ClientEnvOverrides } from "../../../src/env-policy";
import { withOverride, type EligibleServer } from "../overridable";
import { Field, inputCls, monoInputCls } from "../ui";

/**
 * The "Environment overrides" part of the OAuth client dialog: for each server that lists
 * overridable variables, what this client's connections should use instead of the default.
 */
export function EnvOverridesSection(props: {
  servers: EligibleServer[];
  value: ClientEnvOverrides;
  onChange: (value: ClientEnvOverrides) => void;
  /** How many saved overrides were dropped because their server no longer allows them. */
  removed: number;
  onManageServers: () => void;
}) {
  const { servers, value, onChange } = props;
  return (
    <section aria-labelledby="env-overrides-heading" class="space-y-3 rounded-xl border border-dark-700 p-3">
      <div>
        <h4 id="env-overrides-heading" class="text-sm font-medium text-strong">
          Environment overrides
        </h4>
        <p class="text-[11px] text-slate-400 mt-0.5">What this client's connections use instead of a server's default, for example a smaller tool list for an app with a payload limit.</p>
      </div>

      {props.removed > 0 && (
        <p role="status" class="text-[11px] text-amber-400">
          {props.removed} saved {props.removed === 1 ? "override is" : "overrides are"} no longer allowed by {props.removed === 1 ? "its" : "their"} server and will be removed when you save.
        </p>
      )}

      {servers.length === 0 ? (
        <div class="text-[11px] text-slate-400">
          <p>No server lists overridable variables yet.</p>
          <button type="button" onClick={props.onManageServers} class="text-blue-400 hover:underline mt-1">
            Choose variables on a server
          </button>
        </div>
      ) : (
        servers.map((server) => (
          <div key={server.id} role="group" aria-label={server.name} class="space-y-2 rounded-lg bg-dark-900/60 p-2.5">
            <h5 class="text-xs font-medium text-slate-200">{server.name}</h5>
            {Object.entries(server.spec).map(([name, spec]) => {
              const current = value[server.id]?.[name] ?? "";
              const error = current && !spec.values?.length ? validateValue(name, current, spec) : null;
              return (
                <Field key={name} label={<span class="font-mono">{name}</span>} hint={spec.description} error={error ?? undefined}>
                  {spec.values && spec.values.length > 0 ? (
                    <select value={current} onChange={(e) => onChange(withOverride(value, server.id, name, e.currentTarget.value))} class={inputCls}>
                      <option value="">Default (no override)</option>
                      {spec.values.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input type="text" value={current} onInput={(e) => onChange(withOverride(value, server.id, name, e.currentTarget.value))} placeholder="Default (no override)" class={monoInputCls} />
                  )}
                </Field>
              );
            })}
          </div>
        ))
      )}
    </section>
  );
}
