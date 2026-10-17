import { useEffect, useState } from "preact/hooks";
import { api } from "../api";
import { useApp } from "../context";
import { copyText, showToast } from "../toast";
import type { OAuthClient, User } from "../types";
import { Field, Modal, btnPrimary, btnGhost, inputCls, mcpConfigJson, monoInputCls } from "../ui";

interface Generated {
  token: string;
  expiresAt: number;
}

/** Dialog that issues a static access token (API key) for clients without a browser OAuth flow. */
export function GenerateTokenModal(props: { initialClientId: string; onClose: () => void; onCreated: () => void }) {
  const { me } = useApp();
  const [clients, setClients] = useState<OAuthClient[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [clientId, setClientId] = useState(props.initialClientId);
  const [userId, setUserId] = useState("");
  const [ttlDays, setTtlDays] = useState("0");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Generated | null>(null);

  useEffect(() => {
    api<{ clients: OAuthClient[] }>("/clients", { silent: true }).then((d) => {
      const list = d.clients || [];
      setClients(list);
      setClientId((cur) => cur || list[0]?.id || "");
    }, () => {});
    api<{ users: User[] }>("/users", { silent: true }).then((d) => setUsers(d.users || []), () => {});
  }, []);

  const submit = async (e: Event) => {
    e.preventDefault();
    if (!clientId) return showToast("Select a client first", true);
    setBusy(true);
    try {
      const res = await api<{ ok: boolean; token?: string; expiresAt?: number; error?: string }>("/tokens/generate", {
        method: "POST",
        body: { clientId, ttlDays: Number(ttlDays), userId: userId || undefined },
      });
      if (res.ok && res.token) {
        showToast("Access token issued!");
        setResult({ token: res.token, expiresAt: res.expiresAt ?? 0 });
        props.onCreated();
      } else {
        showToast(res.error || "Could not create the token", true);
        setBusy(false);
      }
    } catch {
      setBusy(false);
    }
  };

  return (
    <Modal title={<><span>🔑</span> Create access token / API key</>} onClose={props.onClose}>
      <p class="text-xs text-slate-300 leading-relaxed">
        Create a static Bearer access token for AI clients that cannot use the browser-redirect OAuth flow (such as Claude Desktop, Cursor, Open WebUI, LibreChat, etc.)
      </p>

      <form onSubmit={submit} class="space-y-3 text-xs">
        <Field label="OAuth client">
          <select required value={clientId} onChange={(e) => setClientId(e.currentTarget.value)} class={monoInputCls}>
            {clients.length === 0 && <option value="">No active clients</option>}
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.id})
              </option>
            ))}
          </select>
        </Field>
        <Field label="User / token owner">
          <select value={userId} onChange={(e) => setUserId(e.currentTarget.value)} class={monoInputCls}>
            <option value="">Myself (signed-in account)</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} (@{u.username})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Token lifetime">
          <select value={ttlDays} onChange={(e) => setTtlDays(e.currentTarget.value)} class={inputCls}>
            <option value="30">30 days (default)</option>
            <option value="90">90 days</option>
            <option value="365">1 year (365 days)</option>
            <option value="0">Permanent / 10 years (recommended for Claude Desktop and Cursor)</option>
          </select>
        </Field>
        <div class="flex justify-end gap-2 pt-2 border-t border-dark-700">
          <button type="button" onClick={props.onClose} class={btnGhost}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            class="bg-purple-600 hover:bg-purple-500 text-white font-medium px-4 py-2 rounded-xl transition shadow-md shadow-purple-600/30 flex items-center gap-1.5"
          >
            <span>⚡</span> Issue token
          </button>
        </div>
      </form>

      {result && (
        <div class="space-y-3 pt-3 border-t border-dark-700 text-xs">
          <div class="bg-emerald-950/40 border border-emerald-800/40 p-3 rounded-xl space-y-2">
            <div class="flex items-center justify-between text-emerald-300 font-semibold">
              <span>✓ Access token created</span>
              <span class="text-[10px] font-normal text-emerald-400 font-mono">Expires: {new Date(result.expiresAt).toLocaleDateString()}</span>
            </div>
            <div class="flex items-center gap-2">
              <input type="text" readOnly value={result.token} class="w-full bg-dark-900 border border-dark-700 rounded-xl px-3 py-2 font-mono text-white text-xs select-all" />
              <button type="button" onClick={() => copyText(result.token)} class="shrink-0 bg-dark-700 hover:bg-dark-600 text-white px-3 py-2 rounded-xl">
                Copy
              </button>
            </div>
          </div>
          <div class="bg-dark-900/90 p-3 rounded-xl border border-dark-700 space-y-2 font-mono text-[11px]">
            <div class="flex items-center justify-between text-slate-400 font-sans">
              <span>Ready-to-paste snippet for Claude Desktop:</span>
              <button type="button" onClick={() => copyText(mcpConfigJson(me.origin, result.token))} class="text-blue-400 hover:underline text-xs">
                Copy
              </button>
            </div>
            <pre class="text-slate-300 overflow-x-auto whitespace-pre">{mcpConfigJson(me.origin, result.token)}</pre>
          </div>
          <div class="flex justify-end">
            <button type="button" onClick={props.onClose} class={`${btnPrimary} text-xs`}>
              Done
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
