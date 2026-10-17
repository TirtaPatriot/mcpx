import { useEffect, useState } from "preact/hooks";
import { api } from "../api";
import { useConfirm } from "../components/Confirm";
import { RowActions } from "../components/RowActions";
import { showToast } from "../toast";
import type { User } from "../types";
import { DataTable, EmptyRow, Field, Modal, ModalFooter, SearchInput, SectionHeader, SkeletonRows, Td, btnPrimary, filterBy, inputCls, monoInputCls, Tr } from "../ui";

export function Users() {
  const [users, setUsers] = useState<User[] | null>(null);
  const [editing, setEditing] = useState<User | "new" | null>(null);
  const [query, setQuery] = useState("");
  const confirm = useConfirm();

  const load = () => api<{ users: User[] }>("/users").then((d) => setUsers(d.users || []), () => {});
  useEffect(() => void load(), []);

  const toggle = async (u: User) => {
    if (u.enabled) {
      const ok = await confirm({
        title: `Disable ${u.name}?`,
        message: <>@{u.username} can no longer sign in or use the gateway. Their data stays, and you can enable the account again.</>,
        confirmLabel: "Disable user",
        danger: true,
      });
      if (!ok) return;
    }
    const res = await api<{ enabled: boolean }>(`/users/${u.id}/toggle`, { method: "POST" });
    showToast(res.enabled ? "User enabled" : "User disabled");
    load();
  };
  const remove = async (u: User) => {
    const ok = await confirm({
      title: `Delete ${u.name}?`,
      message: <>The account @{u.username} is removed. This cannot be undone.</>,
      confirmLabel: "Delete user",
      danger: true,
    });
    if (!ok) return;
    await api(`/users/${u.id}`, { method: "DELETE" });
    showToast("User deleted");
    load();
  };
  const shown = filterBy(users ?? [], query, (u) => [u.username, u.name, u.role]);

  return (
    <section class="space-y-6">
      <SectionHeader
        title={<><span aria-hidden="true">👥</span> Users & team</>}
        subtitle="Manage user accounts, the admin/user role, and gateway access."
      >
        <button type="button" onClick={() => setEditing("new")} class={`${btnPrimary} text-xs flex items-center gap-1.5`}>
          <span>+</span> Add user
        </button>
      </SectionHeader>

      <SearchInput value={query} onInput={setQuery} label="Search users" placeholder="Search users..." />

      <DataTable busy={users === null} label="Users" head={["User", "Username", "Role", "Status", "Created", "Actions"]}>
        {users === null ? (
          <SkeletonRows cols={6} />
        ) : users.length === 0 ? (
          <EmptyRow cols={6} title="No users yet" hint="Add teammates so tokens and sessions are tied to the person who owns them." action={{ label: "Add user", onClick: () => setEditing("new") }} />
        ) : shown.length === 0 ? (
          <EmptyRow cols={6} title={`No user matches "${query}"`} hint="Check the spelling or clear the search." />
        ) : (
          shown.map((u) => (
            <Tr key={u.id} class="hover:bg-dark-900/30 transition">
              <Td label="User">
                <div class="font-medium text-strong">
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
                  <span class="px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 text-[11px] font-medium">Admin</span>
                ) : (
                  <span class="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[11px] font-medium">User</span>
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
                <RowActions
                  subject={u.name}
                  primary={[{ label: "Edit", onClick: () => setEditing(u) }]}
                  menu={[
                    { label: u.enabled ? "Disable user" : "Enable user", onClick: () => toggle(u), hidden: !!u.isSelf },
                    { label: "Delete user", onClick: () => remove(u), danger: true, hidden: !!u.isSelf },
                  ]}
                />
              </Td>
            </Tr>
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
        <Field label={u ? "New password (optional)" : "Password"} hint={u ? "Leave empty to keep the current password." : undefined}>
          <input type="password" required={!u} value={password} onInput={(e) => setPassword(e.currentTarget.value)} placeholder="At least 4 characters" class={inputCls} />
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
