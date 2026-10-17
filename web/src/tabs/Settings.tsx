import { useState } from "preact/hooks";
import { api } from "../api";
import { useApp } from "../context";
import { showToast } from "../toast";
import { Field, btnPrimary, cardCls, inputCls } from "../ui";

export function Settings() {
  const { me, clearTempPasswordWarning } = useApp();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const submit = async (e: Event) => {
    e.preventDefault();
    await api("/change-password", { method: "POST", body: { oldPassword, newPassword } });
    showToast("Password admin berhasil diubah!");
    setOldPassword("");
    setNewPassword("");
    clearTempPasswordWarning();
  };

  const links: [string, string][] = [
    ["OAuth Server Metadata (RFC 8414):", `${me.origin}/.well-known/oauth-authorization-server`],
    ["OAuth Protected Resource (RFC 9728):", `${me.origin}/.well-known/oauth-protected-resource`],
    ["Health Check:", `${me.origin}/health`],
  ];

  return (
    <section class="space-y-6">
      <div>
        <h2 class="text-base font-semibold text-white">Pengaturan Keamanan & Gateway</h2>
        <p class="text-xs text-slate-400">Ubah kredensial admin dan pantau informasi URL gateway</p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class={`${cardCls} p-5 space-y-4`}>
          <h3 class="text-sm font-semibold text-white flex items-center gap-2">
            <span>🔐</span> Ganti Password Admin
          </h3>
          <form onSubmit={submit} class="space-y-3 text-xs">
            <Field label="Password Lama">
              <input type="password" required value={oldPassword} onInput={(e) => setOldPassword(e.currentTarget.value)} class={inputCls} />
            </Field>
            <Field label="Password Baru (minimal 4 karakter)">
              <input type="password" required value={newPassword} onInput={(e) => setNewPassword(e.currentTarget.value)} class={inputCls} />
            </Field>
            <button type="submit" class={btnPrimary}>
              Simpan Password Baru
            </button>
          </form>
        </div>

        <div class={`${cardCls} p-5 space-y-3 text-xs`}>
          <h3 class="text-sm font-semibold text-white flex items-center gap-2">
            <span>🌐</span> Discovery & Endpoint Standar
          </h3>
          <div class="space-y-2">
            {links.map(([label, href]) => (
              <div key={href}>
                <div class="text-slate-400">{label}</div>
                <a href={href} target="_blank" rel="noreferrer" class="text-blue-400 hover:underline font-mono break-all">
                  {href}
                </a>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
