import { useEffect, useState } from "preact/hooks";
import { api } from "../api";
import { showToast } from "../toast";
import type { User } from "../types";
import { DataTable, EmptyRow, Field, Modal, ModalFooter, SectionHeader, Td, btnPrimary, inputCls, monoInputCls } from "../ui";

export function Users() {
  const [users, setUsers] = useState<User[] | null>(null);
  const [editing, setEditing] = useState<User | "new" | null>(null);

  const load = () => api<{ users: User[] }>("/users").then((d) => setUsers(d.users || []), () => {});
  useEffect(() => void load(), []);

  const toggle = async (id: string) => {
    const res = await api<{ enabled: boolean }>(`/users/${id}/toggle`, { method: "POST" });
    showToast(res.enabled ? "Pengguna diaktifkan" : "Pengguna dinonaktifkan");
    load();
  };
  const remove = async (u: User) => {
    if (!confirm(`Hapus pengguna "${u.username}"? Tindakan ini tidak dapat dibatalkan.`)) return;
    await api(`/users/${u.id}`, { method: "DELETE" });
    showToast("Pengguna dihapus");
    load();
  };

  return (
    <section class="space-y-6">
      <SectionHeader
        title={<><span>👥</span> Manajemen Pengguna & Tim</>}
        subtitle="Kelola akun pengguna, peran administrator/user, dan hak akses gateway."
      >
        <button type="button" onClick={() => setEditing("new")} class={`${btnPrimary} text-xs flex items-center gap-1.5`}>
          <span>+</span> Tambah Pengguna
        </button>
      </SectionHeader>

      <DataTable head={["Pengguna", "Username", "Peran", "Status", "Dibuat", "Aksi"]}>
        {users === null ? (
          <EmptyRow cols={6}>Memuat data pengguna...</EmptyRow>
        ) : users.length === 0 ? (
          <EmptyRow cols={6}>Belum ada data pengguna.</EmptyRow>
        ) : (
          users.map((u) => (
            <tr key={u.id} class="hover:bg-dark-900/30 transition">
              <Td label="Pengguna">
                <div class="font-medium text-white">
                  {u.name}{" "}
                  {u.isSelf && <span class="text-[10px] text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20 ml-1">(Anda)</span>}
                </div>
                <div class="text-[11px] text-slate-400 font-mono">ID: {u.id}</div>
              </Td>
              <Td label="Username" class="font-mono text-slate-300">
                @{u.username}
              </Td>
              <Td label="Peran">
                {u.role === "admin" ? (
                  <span class="px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 text-[10px] font-mono font-semibold uppercase">ADMIN</span>
                ) : (
                  <span class="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px] font-mono font-medium uppercase">USER</span>
                )}
              </Td>
              <Td label="Status">
                {u.enabled ? (
                  <span class="text-emerald-400 flex items-center gap-1.5">
                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Aktif
                  </span>
                ) : (
                  <span class="text-slate-500 flex items-center gap-1.5">
                    <span class="w-1.5 h-1.5 rounded-full bg-slate-500" /> Nonaktif
                  </span>
                )}
              </Td>
              <Td label="Dibuat" class="text-slate-400">
                {new Date(u.created_at).toLocaleDateString()}
              </Td>
              <Td label="Aksi" actions>
                <button type="button" onClick={() => setEditing(u)} class="text-blue-400 hover:underline">
                  Edit
                </button>
                {!u.isSelf && (
                  <>
                    <button type="button" onClick={() => toggle(u.id)} class={`${u.enabled ? "text-amber-400" : "text-emerald-400"} hover:underline`}>
                      {u.enabled ? "Nonaktifkan" : "Aktifkan"}
                    </button>
                    <button type="button" onClick={() => remove(u)} class="text-red-400 hover:underline">
                      Hapus
                    </button>
                  </>
                )}
              </Td>
            </tr>
          ))
        )}
      </DataTable>

      {editing && (
        <UserModal
          user={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(created) => {
            setEditing(null);
            showToast(created ? "Pengguna baru berhasil dibuat" : "Pengguna berhasil diperbarui");
            load();
          }}
        />
      )}
    </section>
  );
}

function UserModal(props: { user: User | null; onClose: () => void; onSaved: (created: boolean) => void }) {
  const u = props.user;
  const [username, setUsername] = useState(u?.username ?? "");
  const [name, setName] = useState(u?.name ?? "");
  const [role, setRole] = useState<"admin" | "user">(u?.role ?? "user");
  const [password, setPassword] = useState("");
  const [enabled, setEnabled] = useState(u ? !!u.enabled : true);

  const save = async (e: Event) => {
    e.preventDefault();
    const payload: Record<string, unknown> = { name: name.trim(), role, enabled };
    if (password) payload.password = password;
    if (u) {
      await api(`/users/${u.id}`, { method: "PUT", body: payload });
    } else {
      payload.username = username.trim();
      await api("/users", { method: "POST", body: payload });
    }
    props.onSaved(!u);
  };

  return (
    <Modal title={u ? `Edit Pengguna: @${u.username}` : "Tambah Pengguna Baru"} onClose={props.onClose} size="md">
      <form onSubmit={save} class="space-y-3 text-xs">
        <Field label="Username (login)">
          <input type="text" required disabled={!!u} value={username} onInput={(e) => setUsername(e.currentTarget.value)} placeholder="misal: bobby atau dev-team" class={monoInputCls} />
        </Field>
        <Field label="Nama Lengkap">
          <input type="text" required value={name} onInput={(e) => setName(e.currentTarget.value)} placeholder="misal: Bobby Pratama" class={inputCls} />
        </Field>
        <Field label="Peran (Role)">
          <select value={role} onChange={(e) => setRole(e.currentTarget.value as "admin" | "user")} class={inputCls}>
            <option value="user">User Biasa (Akses MCP & Token)</option>
            <option value="admin">Administrator (Akses Penuh)</option>
          </select>
        </Field>
        <Field label={u ? "Password Baru (Opsional)" : "Password"}>
          <input type="password" required={!u} value={password} onInput={(e) => setPassword(e.currentTarget.value)} placeholder="Minimal 4 karakter" class={inputCls} />
          {u && <p class="text-[10px] text-slate-500 mt-1">Kosongkan jika tidak ingin mengubah password.</p>}
        </Field>
        <label class="flex items-center gap-2 pt-1 text-slate-300">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.currentTarget.checked)} class="rounded bg-dark-900 border-dark-700 text-blue-600 focus:ring-0" />
          Akun Aktif (Dapat Login & Akses Gateway)
        </label>
        <ModalFooter onCancel={props.onClose} submitLabel="Simpan Pengguna" />
      </form>
    </Modal>
  );
}
