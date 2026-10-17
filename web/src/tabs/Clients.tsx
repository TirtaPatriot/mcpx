import { useEffect, useState } from "preact/hooks";
import { api } from "../api";
import { PlatformGuide } from "../components/PlatformGuide";
import { useApp } from "../context";
import { CLIENT_ICON_PRESETS, clientIcon } from "../icons";
import { copyText, showToast } from "../toast";
import type { OAuthClient } from "../types";
import {
  DataTable,
  EmptyRow,
  EnabledPill,
  Field,
  IconBox,
  Modal,
  ModalFooter,
  SectionHeader,
  Td,
  btnPrimary,
  btnPurple,
  inputCls,
  monoInputCls,
} from "../ui";

const MASK = "••••••••••••••";

function randomHex(len: number) {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("").slice(0, len);
}

export function Clients() {
  const { openGenToken } = useApp();
  const [clients, setClients] = useState<OAuthClient[] | null>(null);
  const [editing, setEditing] = useState<OAuthClient | "new" | null>(null);
  const [guide, setGuide] = useState<OAuthClient | null>(null);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  const load = () => api<{ clients: OAuthClient[] }>("/clients").then((d) => setClients(d.clients || []), () => {});
  useEffect(() => void load(), []);

  const toggle = async (id: string) => {
    await api(`/clients/${id}/toggle`, { method: "POST" });
    showToast("Status klien diubah");
    load();
  };
  const revokeSessions = async (id: string) => {
    if (!confirm(`Cabut seluruh token dan sesi aktif untuk klien "${id}"? Sesi AI yang terhubung akan terputus.`)) return;
    await api(`/clients/${id}/tokens`, { method: "DELETE" });
    showToast(`Seluruh sesi klien "${id}" berhasil dicabut!`);
    load();
  };
  const regenerate = async (id: string) => {
    if (!confirm("Acak ulang secret klien ini? Klien AI yang terhubung harus diperbarui dengan secret baru.")) return;
    await api(`/clients/${id}/regenerate-secret`, { method: "POST" });
    showToast("Secret baru berhasil di-generate!");
    load();
  };
  const remove = async (id: string) => {
    if (!confirm(`Hapus klien "${id}" beserta semua token aksesnya?`)) return;
    await api(`/clients/${id}`, { method: "DELETE" });
    showToast("Klien dihapus");
    load();
  };
  const toggleSecret = (id: string) =>
    setRevealed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <section class="space-y-4">
      <SectionHeader
        title="Klien OAuth 2.1 & Token Akses"
        subtitle="Kelola kredensial OAuth & Bearer Token untuk berbagai AI Client (Claude, Cursor, Gemini, ChatGPT, LibreChat, dll.)"
      >
        <button type="button" onClick={() => openGenToken()} class={`${btnPurple} text-xs px-3.5 flex items-center gap-1.5`}>
          <span>🔑</span> Buat Token Akses / API Key
        </button>
        <button type="button" onClick={() => setEditing("new")} class={`${btnPrimary} text-xs px-3.5 flex items-center gap-1.5`}>
          <span>+</span> Tambah Klien OAuth
        </button>
      </SectionHeader>

      <DataTable head={["Status", "Client ID", "Nama Aplikasi", "Client Secret", "Sesi Aktif", "Aksi"]}>
        {clients === null ? (
          <EmptyRow cols={6}>Memuat klien...</EmptyRow>
        ) : clients.length === 0 ? (
          <EmptyRow cols={6}>Belum ada klien OAuth. Tambahkan klien untuk AI Anda (Claude, Cursor, Gemini, ChatGPT, dll.).</EmptyRow>
        ) : (
          clients.map((c) => {
            const sessions = (c.active_tokens?.access || 0) + (c.active_tokens?.refresh || 0);
            return (
              <tr key={c.id} class="hover:bg-dark-900/30 transition">
                <Td label="Status">
                  <EnabledPill enabled={c.enabled} offLabel="Nonaktif" onClick={() => toggle(c.id)} />
                </Td>
                <Td label="Client ID" class="font-mono font-medium text-blue-400">
                  <div class="flex items-center gap-2.5">
                    <IconBox src={clientIcon(c)} fallback="/icons/universal.svg" size="sm" />
                    <span>{c.id}</span>
                  </div>
                </Td>
                <Td label="Aplikasi" class="font-medium text-white">
                  {c.name}
                </Td>
                <Td label="Secret" class="font-mono">
                  <div class="flex items-center gap-1.5">
                    <span class="text-slate-400 truncate max-w-[130px]">{revealed.has(c.id) ? c.secret : MASK}</span>
                    <button type="button" onClick={() => toggleSecret(c.id)} class="text-slate-400 hover:text-white text-[11px] px-1.5 py-0.5 rounded bg-dark-700">
                      Lihat
                    </button>
                    <button type="button" onClick={() => copyText(c.secret)} class="text-slate-400 hover:text-white text-[11px] px-1.5 py-0.5 rounded bg-dark-700">
                      Salin
                    </button>
                  </div>
                </Td>
                <Td label="Sesi" class="font-mono">
                  <span class={`px-2 py-0.5 rounded-full text-[11px] ${sessions > 0 ? "bg-blue-500/10 text-blue-400 font-bold border border-blue-500/20" : "text-slate-500"}`}>
                    {sessions} sesi aktif
                  </span>
                </Td>
                <Td label="Aksi" actions>
                  <button type="button" onClick={() => openGenToken(c.id)} class="text-purple-400 hover:underline font-medium" title="Buat Token Akses / API Key">
                    + Token
                  </button>
                  <button type="button" onClick={() => setGuide(c)} class="text-emerald-400 hover:underline">
                    Panduan AI
                  </button>
                  <button type="button" onClick={() => revokeSessions(c.id)} class="text-amber-400 hover:underline" title="Cabut seluruh token aktif klien ini">
                    Cabut Sesi
                  </button>
                  <button type="button" onClick={() => setEditing(c)} class="text-blue-400 hover:underline">
                    Edit
                  </button>
                  <button type="button" onClick={() => regenerate(c.id)} class="text-slate-400 hover:text-white hover:underline">
                    Acak Secret
                  </button>
                  <button type="button" onClick={() => remove(c.id)} class="text-red-400 hover:underline">
                    Hapus
                  </button>
                </Td>
              </tr>
            );
          })
        )}
      </DataTable>

      {editing && (
        <ClientModal
          client={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            showToast("Klien OAuth disimpan");
            load();
          }}
        />
      )}
      {guide && <AiGuideModal client={guide} onClose={() => setGuide(null)} />}
    </section>
  );
}

function ClientModal(props: { client: OAuthClient | null; onClose: () => void; onSaved: () => void }) {
  const c = props.client;
  const [id, setId] = useState(c?.id ?? "");
  const [name, setName] = useState(c?.name ?? "");
  const [icon, setIcon] = useState(c?.icon ?? "");
  const [secret, setSecret] = useState(c?.secret ?? randomHex(32));
  const [redirects, setRedirects] = useState(c?.redirect_uris ?? "");
  const [enabled, setEnabled] = useState(c?.enabled ?? true);

  const save = async (e: Event) => {
    e.preventDefault();
    const payload = { id, name, secret, redirect_uris: redirects, icon: icon.trim(), enabled };
    if (c) await api(`/clients/${id}`, { method: "PUT", body: payload });
    else await api("/clients", { method: "POST", body: payload });
    props.onSaved();
  };

  return (
    <Modal title={c ? "Edit Klien OAuth" : "Tambah Klien OAuth"} onClose={props.onClose}>
      <form onSubmit={save} class="space-y-3 text-xs">
        <Field label="Client ID">
          <input type="text" required disabled={!!c} value={id} onInput={(e) => setId(e.currentTarget.value)} placeholder="claude-desktop" class={monoInputCls} />
        </Field>
        <Field label="Nama Aplikasi / Deskripsi">
          <input type="text" required value={name} onInput={(e) => setName(e.currentTarget.value)} placeholder="Claude Desktop (Macbook) atau Google Gemini" class={inputCls} />
        </Field>
        <div>
          <div class="flex items-center justify-between mb-1">
            <label class="text-slate-400">Logo / Icon Klien (Preset atau URL gambar)</label>
            <div class="flex items-center gap-1">
              {CLIENT_ICON_PRESETS.map(([label, path]) => (
                <button key={path} type="button" onClick={() => setIcon(path)} class="text-[10px] bg-dark-700 hover:bg-dark-600 px-1.5 py-0.5 rounded text-slate-300">
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div class="flex items-center gap-2">
            <input type="text" value={icon} onInput={(e) => setIcon(e.currentTarget.value)} placeholder="/icons/gemini.svg atau https://..." class={`flex-1 ${monoInputCls}`} />
            <div class="w-8 h-8 rounded-lg bg-dark-900 border border-dark-700 flex items-center justify-center shrink-0 p-1">
              <img src={icon.trim() || "/icons/universal.svg"} class="w-full h-full object-contain" onError={(e) => ((e.currentTarget as HTMLImageElement).src = "/icons/universal.svg")} />
            </div>
          </div>
        </div>
        <div>
          <div class="flex items-center justify-between mb-1">
            <label class="text-slate-400">Client Secret</label>
            <button type="button" onClick={() => setSecret(randomHex(32))} class="text-blue-400 hover:underline text-[11px]">
              Acak Secret Baru
            </button>
          </div>
          <input type="text" required value={secret} onInput={(e) => setSecret(e.currentTarget.value)} class={monoInputCls} />
        </div>
        <Field label="Allowed Redirect URIs (dipisah koma, opsional atau '*' untuk semua)">
          <input type="text" value={redirects} onInput={(e) => setRedirects(e.currentTarget.value)} placeholder="https://google.com, https://chatgpt.com, http://localhost" class={monoInputCls} />
        </Field>
        <label class="flex items-center gap-2 pt-1 text-slate-300">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.currentTarget.checked)} class="w-4 h-4 rounded bg-dark-900 border-dark-700 text-blue-600 focus:ring-0" />
          Aktifkan klien ini
        </label>
        <ModalFooter onCancel={props.onClose} submitLabel="Simpan Klien" />
      </form>
    </Modal>
  );
}

function AiGuideModal(props: { client: OAuthClient; onClose: () => void }) {
  const { me, openGenToken } = useApp();
  const { client } = props;
  const credBox = (label: string, value: string) => (
    <div class="flex items-center justify-between bg-dark-800/80 p-2 rounded-lg border border-dark-700/60 gap-2">
      <div class="min-w-0">
        <span class="text-[10px] text-slate-500 block font-sans uppercase font-bold">{label}</span>
        <span class="text-blue-300 break-all">{value}</span>
      </div>
      <button type="button" onClick={() => copyText(value)} class="text-blue-400 hover:underline text-xs shrink-0">
        Salin
      </button>
    </div>
  );

  return (
    <Modal title={<><span>🤖</span> Panduan Integrasi AI (Universal)</>} onClose={props.onClose} size="xl">
      <div class="bg-dark-900/90 p-3 rounded-xl border border-dark-700 text-xs font-mono grid grid-cols-1 sm:grid-cols-2 gap-2">
        {credBox("Client ID", client.id)}
        {credBox("Client Secret", client.secret)}
      </div>
      <div class="text-xs">
        <PlatformGuide
          origin={me.origin}
          onCreateToken={() => {
            props.onClose();
            openGenToken(client.id);
          }}
        />
      </div>
      <div class="flex justify-end pt-2 border-t border-dark-700">
        <button type="button" onClick={props.onClose} class="bg-dark-700 hover:bg-dark-600 text-white font-medium px-4 py-2 rounded-xl text-xs transition">
          Tutup
        </button>
      </div>
    </Modal>
  );
}
