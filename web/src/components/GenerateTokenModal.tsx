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

/** Dialog untuk menerbitkan access token statis (API key) bagi klien tanpa alur browser OAuth. */
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
    if (!clientId) return showToast("Pilih klien terlebih dahulu", true);
    setBusy(true);
    try {
      const res = await api<{ ok: boolean; token?: string; expiresAt?: number; error?: string }>("/tokens/generate", {
        method: "POST",
        body: { clientId, ttlDays: Number(ttlDays), userId: userId || undefined },
      });
      if (res.ok && res.token) {
        showToast("Token akses berhasil diterbitkan!");
        setResult({ token: res.token, expiresAt: res.expiresAt ?? 0 });
        props.onCreated();
      } else {
        showToast(res.error || "Gagal membuat token", true);
        setBusy(false);
      }
    } catch {
      setBusy(false);
    }
  };

  return (
    <Modal title={<><span>🔑</span> Buat Token Akses / API Key Langsung</>} onClose={props.onClose}>
      <p class="text-xs text-slate-300 leading-relaxed">
        Buat Access Token Bearer statis untuk klien AI yang tidak mendukung alur web redirect OAuth (seperti Claude Desktop, Cursor, Open WebUI, LibreChat, dll.)
      </p>

      <form onSubmit={submit} class="space-y-3 text-xs">
        <Field label="Pilih Klien OAuth">
          <select required value={clientId} onChange={(e) => setClientId(e.currentTarget.value)} class={monoInputCls}>
            {clients.length === 0 && <option value="">Tidak ada klien aktif</option>}
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.id})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Pengguna / Pemilik Token">
          <select value={userId} onChange={(e) => setUserId(e.currentTarget.value)} class={monoInputCls}>
            <option value="">Saya sendiri (akun aktif)</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} (@{u.username})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Masa Berlaku Token">
          <select value={ttlDays} onChange={(e) => setTtlDays(e.currentTarget.value)} class={inputCls}>
            <option value="30">30 Hari (Standar)</option>
            <option value="90">90 Hari</option>
            <option value="365">1 Tahun (365 Hari)</option>
            <option value="0">Permanen / 10 Tahun (Direkomendasikan untuk Claude Desktop & Cursor)</option>
          </select>
        </Field>
        <div class="flex justify-end gap-2 pt-2 border-t border-dark-700">
          <button type="button" onClick={props.onClose} class={btnGhost}>
            Batal
          </button>
          <button
            type="submit"
            disabled={busy}
            class="bg-purple-600 hover:bg-purple-500 text-white font-medium px-4 py-2 rounded-xl transition shadow-md shadow-purple-600/30 flex items-center gap-1.5"
          >
            <span>⚡</span> Terbitkan Token
          </button>
        </div>
      </form>

      {result && (
        <div class="space-y-3 pt-3 border-t border-dark-700 text-xs">
          <div class="bg-emerald-950/40 border border-emerald-800/40 p-3 rounded-xl space-y-2">
            <div class="flex items-center justify-between text-emerald-300 font-semibold">
              <span>✓ Token Akses Berhasil Dibuat</span>
              <span class="text-[10px] font-normal text-emerald-400 font-mono">Kedaluwarsa: {new Date(result.expiresAt).toLocaleDateString()}</span>
            </div>
            <div class="flex items-center gap-2">
              <input type="text" readOnly value={result.token} class="w-full bg-dark-900 border border-dark-700 rounded-xl px-3 py-2 font-mono text-white text-xs select-all" />
              <button type="button" onClick={() => copyText(result.token)} class="shrink-0 bg-dark-700 hover:bg-dark-600 text-white px-3 py-2 rounded-xl">
                Salin
              </button>
            </div>
          </div>
          <div class="bg-dark-900/90 p-3 rounded-xl border border-dark-700 space-y-2 font-mono text-[11px]">
            <div class="flex items-center justify-between text-slate-400 font-sans">
              <span>Snippet Siap Tempel untuk Claude Desktop:</span>
              <button type="button" onClick={() => copyText(mcpConfigJson(me.origin, result.token))} class="text-blue-400 hover:underline text-xs">
                Salin
              </button>
            </div>
            <pre class="text-slate-300 overflow-x-auto whitespace-pre">{mcpConfigJson(me.origin, result.token)}</pre>
          </div>
          <div class="flex justify-end">
            <button type="button" onClick={props.onClose} class={`${btnPrimary} text-xs`}>
              Selesai
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
