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
    showToast(res.enabled ? "User enabled" : "User disabled");
    load();
  };
  const remove = async (u: User) => {
    if (!confirm(`Delete user "${u.username}"? This cannot be undone.`)) return;
    await api(`/users/${u.id}`, { method: "DELETE" });
    showToast("User deleted");
    load();
  };

  return (
    <section class="space-y-6">
      <SectionHeader
        title={<><span>👥</span> Users & team</>}
        subtitle="Manage user accounts, the admin/user role, and gateway access."
      >
        <button type="button" onClick={() => setEditing("new")} class={`${btnPrimary} text-xs flex items-center gap-1.5`}>
          <span>+</span> Add user
        </button>
      </SectionHeader>

      <DataTable head={["User", "Username", "Role", "Status", "Created", "Actions"]}>
        {users === null ? (
          <EmptyRow cols={6}>Loading users...</EmptyRow>
        ) : users.length === 0 ? (
          <EmptyRow cols={6}>No users yet.</EmptyRow>
        ) : (
          users.map((u) => (
            <tr key={u.id} class="hover:bg-dark-900/30 transition">
              <Td label="User">
                <div class="font-medium text-white">
                  {u.name}{" "}
                  {u.isSelf && <span class="text-[10px] text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20 ml-1">(you)</span>}
                </div>
                <div class="text-[11px] text-slate-400 font-mono">ID: {u.id}</div>
              </Td>
              <Td label="Username" class="font-mono text-slate-300">
                @{u.username}
              </Td>
              <Td label="Role">
                {u.role === "admin" ? (
                  <span class="px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 text-[10px] font-mono font-semibold uppercase">ADMIN</span>
                ) : (
                  <span class="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px] font-mono font-medium uppercase">USER</span>
                )}
              </Td>
              <Td label="Status">
                {u.enabled ? (
                  <span class="text-emerald-400 flex items-center gap-1.5">
                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Active
                  </span>
                ) : (
                  <span class="text-slate-500 flex items-center gap-1.5">
                    <span class="w-1.5 h-1.5 rounded-full bg-slate-500" /> Disabled
                  </span>
                )}
              </Td>
              <Td label="Created" class="text-slate-400">
                {new Date(u.created_at).toLocaleDateString()}
              </Td>
              <Td label="Actions" actions>
                <button type="button" onClick={() => setEditing(u)} class="text-blue-400 hover:underline">
                  Edit
                </button>
                {!u.isSelf && (
                  <>
                    <button type="button" onClick={() => toggle(u.id)} class={`${u.enabled ? "text-amber-400" : "text-emerald-400"} hover:underline`}>
                      {u.enabled ? "Disable" : "Enable"}
                    </button>
                    <button type="button" onClick={() => remove(u)} class="text-red-400 hover:underline">
                      Delete
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
            showToast(created ? "User created" : "User updated");
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
    <Modal title={u ? `Edit user: @${u.username}` : "Add new user"} onClose={props.onClose} size="md">
      <form onSubmit={save} class="space-y-3 text-xs">
        <Field label="Username (used to sign in)">
          <input type="text" required disabled={!!u} value={username} onInput={(e) => setUsername(e.currentTarget.value)} placeholder="e.g. bobby or dev-team" class={monoInputCls} />
        </Field>
        <Field label="Full name">
          <input type="text" required value={name} onInput={(e) => setName(e.currentTarget.value)} placeholder="e.g. Bobby Pratama" class={inputCls} />
        </Field>
        <Field label="Role">
          <select value={role} onChange={(e) => setRole(e.currentTarget.value as "admin" | "user")} class={inputCls}>
            <option value="user">User (MCP and token access)</option>
            <option value="admin">Administrator (full access)</option>
          </select>
        </Field>
        <Field label={u ? "New password (optional)" : "Password"}>
          <input type="password" required={!u} value={password} onInput={(e) => setPassword(e.currentTarget.value)} placeholder="At least 4 characters" class={inputCls} />
          {u && <p class="text-[10px] text-slate-500 mt-1">Leave empty to keep the current password.</p>}
        </Field>
        <label class="flex items-center gap-2 pt-1 text-slate-300">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.currentTarget.checked)} class="rounded bg-dark-900 border-dark-700 text-blue-600 focus:ring-0" />
          Account enabled (can sign in and use the gateway)
        </label>
        <ModalFooter onCancel={props.onClose} submitLabel="Save user" />
      </form>
    </Modal>
  );
}
