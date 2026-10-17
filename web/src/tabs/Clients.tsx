import { useEffect, useState } from "preact/hooks";
import { api } from "../api";
import { useConfirm } from "../components/Confirm";
import { PlatformGuide } from "../components/PlatformGuide";
import { RowActions } from "../components/RowActions";
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
  SearchInput,
  SectionHeader,
  SkeletonRows,
  Td,
  btnPrimary,
  filterBy,
  btnPurple,
  inputCls,
  monoInputCls, Tr } from "../ui";

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
  const [query, setQuery] = useState("");
  const confirm = useConfirm();

  const shown = filterBy(clients ?? [], query, (c) => [c.id, c.name]);
  const load = () => api<{ clients: OAuthClient[] }>("/clients").then((d) => setClients(d.clients || []), () => {});
  useEffect(() => void load(), []);

  const toggle = async (id: string) => {
    await api(`/clients/${id}/toggle`, { method: "POST" });
    showToast("Client status changed");
    load();
  };
  const revokeSessions = async (c: OAuthClient) => {
    const ok = await confirm({
      title: `Revoke all sessions of ${c.name}?`,
      message: <>Every access and refresh token issued to <code class="font-mono text-slate-200">{c.id}</code> stops working now. Connected AI sessions are cut off until they sign in again.</>,
      confirmLabel: "Revoke sessions",
      danger: true,
    });
    if (!ok) return;
    await api(`/clients/${c.id}/tokens`, { method: "DELETE" });
    showToast(`Sessions of "${c.id}" revoked`);
    load();
  };
  const regenerate = async (c: OAuthClient) => {
    const ok = await confirm({
      title: `Generate a new secret for ${c.name}?`,
      message: "The old secret stops working immediately. Update every AI client that uses it with the new secret.",
      confirmLabel: "Generate new secret",
      danger: true,
    });
    if (!ok) return;
    await api(`/clients/${c.id}/regenerate-secret`, { method: "POST" });
    showToast("New secret generated");
    load();
  };
  const remove = async (c: OAuthClient) => {
    const ok = await confirm({
      title: `Delete ${c.name}?`,
      message: <>The client <code class="font-mono text-slate-200">{c.id}</code> and all of its access tokens are removed. This cannot be undone.</>,
      confirmLabel: "Delete client",
      danger: true,
    });
    if (!ok) return;
    await api(`/clients/${c.id}`, { method: "DELETE" });
    showToast("Client deleted");
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
        title="OAuth 2.1 clients & access tokens"
        subtitle="Manage OAuth credentials and Bearer tokens for your AI clients (Claude, Cursor, Gemini, ChatGPT, LibreChat, etc.)"
      >
        <button type="button" onClick={() => openGenToken()} class={`${btnPurple} text-xs px-3.5 flex items-center gap-1.5`}>
          <span aria-hidden="true">🔑</span> Create access token / API key
        </button>
        <button type="button" onClick={() => setEditing("new")} class={`${btnPrimary} text-xs px-3.5 flex items-center gap-1.5`}>
          <span>+</span> Add OAuth client
        </button>
      </SectionHeader>

      <SearchInput value={query} onInput={setQuery} label="Search OAuth clients" placeholder="Search clients..." />

      <DataTable busy={clients === null} label="OAuth clients" head={["Status", "Client ID", "Application name", "Client secret", "Active sessions", "Actions"]}>
        {clients === null ? (
          <SkeletonRows cols={6} />
        ) : clients.length === 0 ? (
          <EmptyRow
            cols={6}
            title="No OAuth clients yet"
            hint="Each AI app gets its own client, so you can revoke one without touching the others."
            action={{ label: "Add OAuth client", onClick: () => setEditing("new") }}
          />
        ) : shown.length === 0 ? (
          <EmptyRow cols={6} title={`No client matches "${query}"`} hint="Check the spelling or clear the search." />
        ) : (
          shown.map((c) => {
            const sessions = (c.active_tokens?.access || 0) + (c.active_tokens?.refresh || 0);
            return (
              <Tr key={c.id} class="hover:bg-dark-900/30 transition">
                <Td label="Status">
                  <EnabledPill enabled={c.enabled} offLabel="Disabled" subject={c.name} onClick={() => toggle(c.id)} />
                </Td>
                <Td label="Client ID" class="font-mono font-medium text-blue-400">
                  <div class="flex items-center gap-2.5">
                    <IconBox src={clientIcon(c)} fallback="/icons/universal.svg" size="sm" />
                    <span>{c.id}</span>
                  </div>
                </Td>
                <Td label="Application" class="font-medium text-strong">
                  {c.name}
                </Td>
                <Td label="Secret" class="font-mono">
                  <div class="flex items-center gap-1.5">
                    <span class="text-slate-400 truncate max-w-[130px]">{revealed.has(c.id) ? c.secret : MASK}</span>
                    <button type="button" aria-label={`${revealed.has(c.id) ? "Hide" : "Show"} secret of ${c.name}`} onClick={() => toggleSecret(c.id)} class="text-slate-400 hover:text-strong text-[11px] px-1.5 py-0.5 rounded bg-dark-700">
                      {revealed.has(c.id) ? "Hide" : "Show"}
                    </button>
                    <button type="button" aria-label={`Copy secret of ${c.name}`} onClick={() => copyText(c.secret)} class="text-slate-400 hover:text-strong text-[11px] px-1.5 py-0.5 rounded bg-dark-700">
                      Copy
                    </button>
                  </div>
                </Td>
                <Td label="Sessions" class="font-mono">
                  <span class={`px-2 py-0.5 rounded-full text-[11px] whitespace-nowrap ${sessions > 0 ? "bg-blue-500/10 text-blue-400 font-bold border border-blue-500/20" : "text-slate-500"}`}>
                    {sessions} active {sessions === 1 ? "session" : "sessions"}
                  </span>
                </Td>
                <Td label="Actions" actions>
                  <RowActions
                    subject={c.name}
                    primary={[
                      { label: "+ Token", onClick: () => openGenToken(c.id) },
                      { label: "AI guide", onClick: () => setGuide(c) },
                      { label: "Edit", onClick: () => setEditing(c) },
                    ]}
                    menu={[
                      { label: "Revoke sessions", onClick: () => revokeSessions(c) },
                      { label: "Generate new secret", onClick: () => regenerate(c) },
                      { label: "Delete client", onClick: () => remove(c), danger: true },
                    ]}
                  />
                </Td>
              </Tr>
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
            showToast("OAuth client saved");
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
  // A new client shows its generated secret so it can be copied; an existing one stays hidden until asked for.
  const [showSecret, setShowSecret] = useState(!c);

  const save = async (e: Event) => {
    e.preventDefault();
    const payload = { id, name, secret, redirect_uris: redirects, icon: icon.trim(), enabled };
    if (c) await api(`/clients/${id}`, { method: "PUT", body: payload });
    else await api("/clients", { method: "POST", body: payload });
    props.onSaved();
  };

  return (
    <Modal title={c ? "Edit OAuth client" : "Add OAuth client"} onClose={props.onClose}>
      <form onSubmit={save} class="space-y-3 text-xs">
        <Field label="Client ID">
          <input type="text" required disabled={!!c} value={id} onInput={(e) => setId(e.currentTarget.value)} placeholder="claude-desktop" class={monoInputCls} />
        </Field>
        <Field label="Application name / description">
          <input type="text" required value={name} onInput={(e) => setName(e.currentTarget.value)} placeholder="Claude Desktop (MacBook) or Google Gemini" class={inputCls} />
        </Field>
        <div>
          <div class="flex items-center justify-between mb-1">
            <label for="cli-icon" class="text-slate-400">Client logo / icon (preset or image URL)</label>
            <div class="flex items-center gap-1">
              {CLIENT_ICON_PRESETS.map(([label, path]) => (
                <button key={path} type="button" onClick={() => setIcon(path)} class="text-[10px] bg-dark-700 hover:bg-dark-600 px-1.5 py-0.5 rounded text-slate-300">
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div class="flex items-center gap-2">
            <input id="cli-icon" type="text" value={icon} onInput={(e) => setIcon(e.currentTarget.value)} placeholder="/icons/gemini.svg or https://..." class={`flex-1 ${monoInputCls}`} />
            <div class="w-8 h-8 rounded-lg bg-dark-900 border border-dark-700 flex items-center justify-center shrink-0 p-1">
              <img src={icon.trim() || "/icons/universal.svg"} alt="" class="w-full h-full object-contain" onError={(e) => ((e.currentTarget as HTMLImageElement).src = "/icons/universal.svg")} />
            </div>
          </div>
        </div>
        <div>
          <div class="flex items-center justify-between mb-1">
            <label for="cli-secret" class="text-slate-400">Client secret</label>
            <button type="button" onClick={() => setSecret(randomHex(32))} class="text-blue-400 hover:underline text-[11px]">
              Generate new secret
            </button>
          </div>
          <div class="flex items-center gap-2">
            <input id="cli-secret" type={(showSecret ? "text" : "password") as "text"} required value={secret} onInput={(e) => setSecret(e.currentTarget.value)} class={monoInputCls} />
            <button type="button" aria-label={showSecret ? "Hide client secret" : "Show client secret"} onClick={() => setShowSecret((v) => !v)} class="shrink-0 text-slate-300 hover:text-strong text-[11px] px-2 py-2 rounded-lg bg-dark-700">
              {showSecret ? "Hide" : "Show"}
            </button>
          </div>
        </div>
        <Field label="Allowed redirect URIs (comma-separated, optional, or '*' for any)">
          <input type="text" value={redirects} onInput={(e) => setRedirects(e.currentTarget.value)} placeholder="https://google.com, https://chatgpt.com, http://localhost" class={monoInputCls} />
        </Field>
        <label class="flex items-center gap-2 pt-1 text-slate-300">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.currentTarget.checked)} class="w-4 h-4 rounded bg-dark-900 border-dark-700 text-blue-600 focus:ring-0" />
          Enable this client
        </label>
        <ModalFooter onCancel={props.onClose} submitLabel="Save client" />
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
        <span class="text-[11px] text-slate-500 block font-sans">{label}</span>
        <span class="text-blue-300 break-all">{value}</span>
      </div>
      <button type="button" aria-label={`Copy ${label}`} onClick={() => copyText(value)} class="text-blue-400 hover:underline text-xs shrink-0">
        Copy
      </button>
    </div>
  );

  return (
    <Modal title={<><span aria-hidden="true">🤖</span> AI integration guide</>} onClose={props.onClose} size="xl" closeOnOverlay>
      <div class="bg-dark-900/90 p-3 rounded-xl border border-dark-700 text-xs font-mono grid grid-cols-1 sm:grid-cols-2 gap-2">
        {credBox("Client ID", client.id)}
        {credBox("Client secret", client.secret)}
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
        <button type="button" onClick={props.onClose} class="bg-dark-700 hover:bg-dark-600 text-strong font-medium px-4 py-2 rounded-xl text-xs transition">
          Close
        </button>
      </div>
    </Modal>
  );
}
