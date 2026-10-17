import { useState } from "preact/hooks";
import { buildOverrideUrl, validateValue } from "../../../src/env-policy";
import { eligibleServers } from "../overridable";
import { copyText } from "../toast";
import type { McpServer } from "../types";
import { OverrideField } from "./OverrideField";

/**
 * Builds the server URL with `?env.NAME=value` for AI apps that only let you edit a URL (Gemini, for
 * example). Shown in the Connect dialog of a server that lists overridable variables.
 */
export function EnvUrlBuilder(props: { origin: string; server: McpServer }) {
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const entry = eligibleServers([props.server])[0];
  if (!entry) return null;

  const set = (name: string, value: string) =>
    setChosen((prev) => {
      const next = { ...prev };
      if (value === "") delete next[name];
      else next[name] = value;
      return next;
    });
  const invalid = Object.entries(chosen).some(([name, value]) => validateValue(name, value, entry.spec[name]) !== null);
  const url = buildOverrideUrl(props.origin, props.server.id, chosen);

  return (
    <section data-url-builder aria-labelledby="url-builder-heading" class="space-y-3 rounded-xl border border-dark-700 p-3">
      <div>
        <h4 id="url-builder-heading" class="text-sm font-medium text-strong">
          Build a URL with overrides
        </h4>
        <p class="text-[11px] text-slate-400 mt-0.5">
          For AI apps that only let you edit the server URL. The app must keep the query string on every request; if it does not, set the same values per OAuth client instead.
        </p>
      </div>

      {Object.entries(entry.spec).map(([name, spec]) => (
        <OverrideField key={name} name={name} spec={spec} value={chosen[name] ?? ""} onChange={(v) => set(name, v)} />
      ))}

      <div class="bg-dark-900/90 p-3 rounded-xl border border-dark-700 text-xs font-mono flex items-center justify-between gap-2">
        <div class="min-w-0">
          <span class="text-[11px] text-slate-500 block font-sans">URL for the AI app</span>
          <span aria-live="polite" class="text-blue-300 break-all">
            {url}
          </span>
        </div>
        <button
          type="button"
          disabled={invalid}
          onClick={() => copyText(url)}
          class="text-blue-400 hover:underline text-xs shrink-0 disabled:opacity-50 disabled:no-underline"
        >
          Copy URL
        </button>
      </div>
    </section>
  );
}
