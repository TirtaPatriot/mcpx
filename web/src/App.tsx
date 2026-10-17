import { useEffect, useRef, useState } from "preact/hooks";
import { api, LOGIN_URL } from "./api";
import { ConfirmProvider } from "./components/Confirm";
import { GenerateTokenModal } from "./components/GenerateTokenModal";
import { AppContext, type TabId } from "./context";
import { Clients } from "./tabs/Clients";
import { Logs } from "./tabs/Logs";
import { Overview } from "./tabs/Overview";
import { Servers } from "./tabs/Servers";
import { Settings } from "./tabs/Settings";
import { Tokens } from "./tabs/Tokens";
import { Users } from "./tabs/Users";
import { useToast } from "./toast";
import type { Me } from "./types";

const TABS: { id: TabId; icon: string; label: string; Component: () => preact.JSX.Element }[] = [
  { id: "overview", icon: "📊", label: "Overview", Component: Overview },
  { id: "servers", icon: "🔌", label: "MCP Servers", Component: Servers },
  { id: "clients", icon: "🔑", label: "OAuth Clients", Component: Clients },
  { id: "users", icon: "👥", label: "Users", Component: Users },
  { id: "tokens", icon: "🎫", label: "Tokens & Sessions", Component: Tokens },
  { id: "logs", icon: "📜", label: "Activity Log", Component: Logs },
  { id: "settings", icon: "⚙️", label: "Settings", Component: Settings },
];

const tabFromHash = (): TabId => {
  const id = location.hash.slice(1);
  return TABS.some((t) => t.id === id) ? (id as TabId) : "overview";
};

function Toast() {
  const t = useToast();
  const color = t.isError
    ? "bg-red-900/95 text-red-200 border-red-700 shadow-red-950/60"
    : "bg-emerald-900/95 text-emerald-200 border-emerald-700 shadow-emerald-950/60";
  return (
    <div
      role={t.isError ? "alert" : "status"}
      aria-live={t.isError ? "assertive" : "polite"}
      class={`toast fixed bottom-5 right-5 z-[9999] transform transition-all duration-300 motion-reduce:transition-none pointer-events-none ${t.visible ? "" : "translate-y-20 opacity-0"}`}
    >
      <div class={`flex items-center gap-3 px-4 py-3 rounded-xl border shadow-2xl text-xs font-medium ${color}`}>
        <span>{t.isError ? "✗" : "✓"}</span>
        <span>{t.message}</span>
      </div>
    </div>
  );
}

export function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [tab, setTab] = useState<TabId>(tabFromHash);
  const [tempPassword, setTempPassword] = useState(false);
  const [gen, setGen] = useState<{ clientId: string } | null>(null);
  // Bumped whenever a token is created so the open tab reloads its data.
  const [refresh, setRefresh] = useState(0);
  const activeBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    api<Me>("/me").then((m) => {
      setMe(m);
      setTempPassword(m.isDefaultPassword);
    }, () => {});
  }, []);

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // scroll the tab strip so the active tab stays visible on narrow screens
  useEffect(() => activeBtn.current?.scrollIntoView?.({ inline: "center", block: "nearest" }), [tab, me]);

  const goTab = (id: TabId) => {
    location.hash = id;
    setTab(id);
  };
  const logout = async () => {
    await api("/logout", { method: "POST" });
    window.location.href = LOGIN_URL;
  };

  if (!me) return <Toast />;
  const Active = TABS.find((t) => t.id === tab)!.Component;

  return (
    <AppContext.Provider
      value={{ me, goTab, openGenToken: (clientId = "") => setGen({ clientId }), clearTempPasswordWarning: () => setTempPassword(false) }}
    >
      <ConfirmProvider>
      <Toast />
      <a href="#main" class="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:bg-blue-600 focus:text-white focus:px-3 focus:py-2 focus:rounded-lg">
        Skip to content
      </a>
      <header class="border-b border-dark-700 bg-dark-800/80 backdrop-blur sticky top-0 z-40">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2">
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-10 h-10 rounded-xl bg-dark-700/80 border border-dark-600 flex items-center justify-center p-1.5 shadow-lg shadow-blue-500/10 shrink-0">
              <img src="/logo.png" alt="MCP X" class="w-full h-full object-contain" />
            </div>
            <div class="min-w-0">
              <h1 class="text-sm sm:text-base font-bold tracking-tight text-white flex items-center gap-2 truncate">
                <span class="truncate">MCP X</span>
                <span class="hidden md:inline text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">SQLite WAL</span>
                <span class="hidden lg:inline text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">HTTP + CLI (bunx, uv, go, npx)</span>
              </h1>
              <p class="hidden md:block text-xs text-slate-400 truncate">
                Universal reverse proxy, process bridge and OAuth 2.1 manager for every AI client (Gemini, Claude, Cursor, ChatGPT, LibreChat, etc.)
              </p>
            </div>
          </div>
          <div class="flex items-center gap-2 sm:gap-3 shrink-0">
            <div class="hidden sm:flex items-center gap-2 bg-dark-700/80 border border-dark-600 px-3 py-1.5 rounded-xl text-xs">
              <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span class="font-medium text-slate-200">{me.user.name}</span>
              <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">{me.user.role}</span>
            </div>
            <a
              href="/.well-known/oauth-authorization-server"
              target="_blank"
              rel="noreferrer"
              class="hidden sm:flex text-xs text-slate-400 hover:text-white transition items-center gap-1 bg-dark-700/60 px-2.5 py-1.5 rounded-lg border border-dark-600"
            >
              RFC 8414 Discovery ↗
            </a>
            <button type="button" onClick={logout} class="text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 px-3 py-1.5 rounded-lg transition font-medium">
              Sign out
            </button>
          </div>
        </div>
      </header>

      {tempPassword && (
        <div class="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2.5 text-xs text-amber-300">
          <div class="max-w-7xl mx-auto flex items-center justify-between flex-wrap gap-2">
            <div class="flex items-center gap-2">
              <span class="text-base">⚠️</span>
              <span>
                You are still using a temporary password. Change it in the <strong>Settings</strong> tab to keep the gateway secure.
              </span>
            </div>
            <button type="button" onClick={() => goTab("settings")} class="underline hover:text-amber-200">
              Change now &rarr;
            </button>
          </div>
        </div>
      )}

      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 flex-1 w-full flex flex-col md:flex-row gap-4 md:gap-6">
        <aside class="nav-aside w-full md:w-56 shrink-0">
          <nav aria-label="Sections" class="nav-tabs flex md:flex-col gap-1 overflow-x-auto pb-2 md:pb-0">
            {TABS.map((t) => {
              const active = t.id === tab;
              return (
                <button
                  key={t.id}
                  ref={active ? activeBtn : undefined}
                  type="button"
                  aria-current={active ? "page" : undefined}
                  onClick={() => goTab(t.id)}
                  class={`nav-btn flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition text-left ${
                    active ? "bg-dark-800 text-white border border-dark-700" : "text-slate-400 hover:text-white"
                  }`}
                >
                  <span>{t.icon}</span> {t.label}
                </button>
              );
            })}
          </nav>
        </aside>
        <main id="main" tabIndex={-1} class="flex-1 min-w-0 outline-none">
          <Active key={`${tab}-${refresh}`} />
        </main>
      </div>

      {gen && (
        <GenerateTokenModal
          initialClientId={gen.clientId}
          onClose={() => setGen(null)}
          onCreated={() => setRefresh((n) => n + 1)}
        />
      )}
      </ConfirmProvider>
    </AppContext.Provider>
  );
}
