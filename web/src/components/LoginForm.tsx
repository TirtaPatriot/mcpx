import { useState } from "preact/hooks";
import { inputCls } from "../ui";

/**
 * Only internal paths are allowed as the post-login destination (prevents open redirects).
 * Control characters and backslashes are rejected because browsers normalise them into "//host".
 */
export function safeNext(): string {
  const raw = new URLSearchParams(location.search).get("next") ?? "";
  if (!raw.startsWith("/") || /[\u0000-\u0020\\]/.test(raw)) return "/admin";
  try {
    const u = new URL(raw, location.origin);
    const out = u.pathname + u.search + u.hash;
    // Parsing removes dot segments ("/.//evil.com" -> "//evil.com"), so check the final result.
    return u.origin === location.origin && !out.startsWith("//") ? out : "/admin";
  } catch {
    return "/admin";
  }
}

export function Login() {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);

  const submit = async (e: Event) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Wrong username or password");
      window.location.href = import.meta.env.DEV ? "/_app/index.html" : safeNext();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <main class="max-w-md w-full bg-dark-800 border border-dark-700 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
      <div class="text-center space-y-3">
        <div class="w-16 h-16 rounded-2xl bg-dark-700/80 border border-dark-600 flex items-center justify-center p-2.5 mx-auto shadow-xl shadow-blue-500/10">
          <img src="/logo.png" alt="MCP X" class="w-full h-full object-contain" />
        </div>
        <div>
          <h1 class="text-xl font-bold text-strong tracking-tight">MCP X</h1>
          <p class="text-xs text-slate-400 mt-1">Universal OAuth 2.1 and reverse proxy for every AI client</p>
        </div>
      </div>

      {error && <div role="alert" class="bg-red-500/10 border border-red-500/20 text-red-300 text-xs p-3 rounded-xl">{error}</div>}

      <form onSubmit={submit} class="space-y-4 text-xs">
        <div>
          <label for="username" class="block text-slate-300 font-medium mb-1.5">Username</label>
          <input
            id="username"
            type="text"
            required
            autofocus
            value={username}
            onInput={(e) => setUsername(e.currentTarget.value)}
            placeholder="Enter your username..."
            class={`${inputCls} px-4 py-3 text-sm placeholder-slate-500 transition font-mono`}
          />
        </div>
        <div>
          <label for="password" class="block text-slate-300 font-medium mb-1.5">Password</label>
          <div class="relative">
            <input
              id="password"
              type={(show ? "text" : "password") as "text"}
              required
              value={password}
              onInput={(e) => setPassword(e.currentTarget.value)}
              placeholder="Enter your password..."
              autocomplete="current-password"
              class={`${inputCls} px-4 py-3 pr-16 text-sm placeholder-slate-500 transition`}
            />
            <button
              type="button"
              aria-label={show ? "Hide password" : "Show password"}
              onClick={() => setShow((v) => !v)}
              class="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 hover:text-strong px-2 py-1 rounded-md"
            >
              {show ? "Hide" : "Show"}
            </button>
          </div>
          <p class="text-[11px] text-slate-500 mt-1.5">
            New install: username <code>admin</code>, password in the startup log or the <code>ADMIN_PASSWORD</code> variable.
          </p>
        </div>
        <button
          type="submit"
          disabled={busy}
          class="w-full min-h-12 bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-xl text-sm transition shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2"
        >
          {busy ? "Signing in..." : <><span>Sign in to the dashboard</span> &rarr;</>}
        </button>
      </form>
    </main>
  );
}
