import { useEffect, useState } from "preact/hooks";
import { api } from "../api";
import { useApp } from "../context";
import { showToast } from "../toast";
import type { OAuthClient, TokenRow } from "../types";
import { DataTable, EmptyRow, SectionHeader, Td, cardCls } from "../ui";

function Owner({ t }: { t: TokenRow }) {
  return t.user_username ? (
    <>
      <span class="font-medium text-slate-200">{t.user_name || t.user_username}</span>{" "}
      <span class="text-[11px] text-slate-400 font-mono">(@{t.user_username})</span>
    </>
  ) : (
    <span class="text-slate-500 italic">Sistem / Default</span>
  );
}

export function Tokens() {
  const { openGenToken } = useApp();
  const [clients, setClients] = useState<OAuthClient[]>([]);
  const [clientId, setClientId] = useState("");
  const [data, setData] = useState<{ accessTokens: TokenRow[]; refreshTokens: TokenRow[] } | null>(null);

  const load = (filter = clientId) =>
    api<{ accessTokens: TokenRow[]; refreshTokens: TokenRow[] }>(filter ? `/tokens?clientId=${encodeURIComponent(filter)}` : "/tokens").then(setData, () => {});

  useEffect(() => {
    api<{ clients: OAuthClient[] }>("/clients").then((d) => setClients(d.clients || []), () => {});
    load();
  }, []);

  const revokeToken = async (token: string) => {
    if (!confirm("Cabut token ini?")) return;
    await api(`/tokens/${token}`, { method: "DELETE" });
    showToast("Token dicabut");
    load();
  };
  const revokeClient = async () => {
    if (!confirm(`Cabut semua sesi untuk klien "${clientId}"?`)) return;
    await api(`/tokens/client/${clientId}`, { method: "DELETE" });
    showToast(`Semua sesi "${clientId}" dicabut`);
    load();
  };

  const access = data?.accessTokens ?? [];
  const refresh = data?.refreshTokens ?? [];
  const mono = "py-2.5 px-4 font-mono text-slate-300";

  return (
    <section class="space-y-6">
      <SectionHeader title="Manajemen Token & Sesi" subtitle="Pantau dan cabut token akses atau refresh token aktif per-klien yang tersimpan di SQLite">
        <button type="button" onClick={() => openGenToken()} class="bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium px-3 py-1.5 rounded-xl transition shadow-md shadow-purple-600/20 flex items-center gap-1">
          <span>🔑</span> + Buat Token Akses
        </button>
        <select
          value={clientId}
          onChange={(e) => {
            setClientId(e.currentTarget.value);
            load(e.currentTarget.value);
          }}
          class="bg-dark-800 border border-dark-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
        >
          <option value="">Semua Klien</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.id})
            </option>
          ))}
        </select>
        {clientId && (
          <button type="button" onClick={revokeClient} class="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs px-3 py-1.5 rounded-xl transition font-medium">
            Cabut Semua Sesi "{clientId}"
          </button>
        )}
      </SectionHeader>

      <div class="space-y-2">
        <TableTitle title="Access Tokens Aktif (Bearer)" count={access.length} color="bg-blue-500/10 text-blue-400" />
        <DataTable head={["Token", "Client ID", "Pengguna", "Dibuat", "Kedaluwarsa", "Aksi"]}>
          {access.length === 0 ? (
            <EmptyRow cols={6}>Belum ada access token aktif.</EmptyRow>
          ) : (
            access.map((t) => (
              <tr key={t.token} class="hover:bg-dark-900/30 transition">
                <td data-label="Token" class={mono}>{t.token.slice(0, 12)}...</td>
                <Td label="Client ID" class="font-medium text-white">{t.client_id}</Td>
                <Td label="Pengguna"><Owner t={t} /></Td>
                <Td label="Dibuat" class="text-slate-400">{new Date(t.created_at).toLocaleString()}</Td>
                <Td label="Kedaluwarsa" class="text-slate-400">{new Date(t.expires_at).toLocaleString()}</Td>
                <Td label="Aksi" actions>
                  <button type="button" onClick={() => revokeToken(t.token)} class="text-red-400 hover:underline">Cabut</button>
                </Td>
              </tr>
            ))
          )}
        </DataTable>
      </div>

      <div class="space-y-2">
        <TableTitle title="Refresh Tokens" count={refresh.length} color="bg-purple-500/10 text-purple-400" />
        <DataTable head={["Token", "Client ID", "Pengguna", "Status", "Kedaluwarsa", "Aksi"]}>
          {refresh.length === 0 ? (
            <EmptyRow cols={6}>Belum ada refresh token.</EmptyRow>
          ) : (
            refresh.map((t) => (
              <tr key={t.token} class="hover:bg-dark-900/30 transition">
                <td data-label="Token" class={mono}>{t.token.slice(0, 12)}...</td>
                <Td label="Client ID" class="font-medium text-white">{t.client_id}</Td>
                <Td label="Pengguna"><Owner t={t} /></Td>
                <Td label="Status">
                  {t.revoked_at ? <span class="text-amber-400">Rotated / Revoked</span> : <span class="text-emerald-400">● Valid</span>}
                </Td>
                <Td label="Kedaluwarsa" class="text-slate-400">{new Date(t.expires_at).toLocaleString()}</Td>
                <Td label="Aksi" actions>
                  <button type="button" onClick={() => revokeToken(t.token)} class="text-red-400 hover:underline">Cabut</button>
                </Td>
              </tr>
            ))
          )}
        </DataTable>
      </div>
    </section>
  );
}

function TableTitle(props: { title: string; count: number; color: string }) {
  return (
    <div class={`${cardCls} px-4 py-3 bg-dark-900/50 flex items-center justify-between`}>
      <h3 class="text-xs font-semibold text-slate-200 uppercase tracking-wider">{props.title}</h3>
      <span class={`text-xs px-2 py-0.5 rounded-full font-mono ${props.color}`}>{props.count} token</span>
    </div>
  );
}
