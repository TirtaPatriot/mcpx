import { useEffect, useState } from "preact/hooks";
import { api } from "../api";
import { PlatformGuide } from "../components/PlatformGuide";
import { useApp } from "../context";
import type { Stats } from "../types";
import { cardCls } from "../ui";

function StatCard(props: { label: string; value: number; total?: number; hint: string; dot: string; text: string; wide?: boolean }) {
  return (
    <div class={`${cardCls} p-4 shadow-sm ${props.wide ? "col-span-2 sm:col-span-1" : ""}`}>
      <div class="text-xs font-medium text-slate-400 mb-1">{props.label}</div>
      <div class="text-2xl font-bold text-white flex items-baseline gap-2">
        <span>{props.value}</span>
        {props.total !== undefined && <span class="text-xs font-normal text-slate-400">/ {props.total}</span>}
      </div>
      <div class={`mt-2 text-[11px] ${props.text} flex items-center gap-1`}>
        <span class={`inline-block w-1.5 h-1.5 rounded-full ${props.dot}`} /> {props.hint}
      </div>
    </div>
  );
}

function SysItem(props: { label: string; value: string; truncate?: boolean }) {
  return (
    <div class="bg-dark-900/60 p-3 rounded-xl border border-dark-700/80">
      <div class="text-slate-400">{props.label}</div>
      <div class={`font-mono text-slate-200 font-medium mt-1 ${props.truncate ? "truncate" : ""}`}>{props.value}</div>
    </div>
  );
}

export function Overview() {
  const { me, goTab, openGenToken } = useApp();
  const [data, setData] = useState<Stats | null>(null);

  useEffect(() => {
    api<Stats>("/stats", { silent: true }).then(setData, () => {});
  }, []);

  const s = data?.stats;
  const sys = data?.system;
  const runtimes = [`Bun v${sys?.bunVersion ?? "-"}`];
  if (sys?.runtimes?.uv) runtimes.push("uv");
  if (sys?.runtimes?.go) runtimes.push("go");
  if (sys?.runtimes?.python) runtimes.push("python");
  if (sys?.runtimes?.npx) runtimes.push("npx");

  return (
    <section class="space-y-6">
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard label="Active MCP servers" value={s?.servers.active ?? 0} total={s?.servers.total ?? 0} hint="HTTP & stdio" dot="bg-blue-400" text="text-blue-400" />
        <StatCard label="Active OAuth clients" value={s?.clients.active ?? 0} total={s?.clients.total ?? 0} hint="Multi-client" dot="bg-emerald-400" text="text-emerald-400" />
        <StatCard label="Active access tokens" value={s?.tokens.access ?? 0} hint="AI client sessions" dot="bg-purple-400" text="text-purple-400" />
        <StatCard label="Valid refresh tokens" value={s?.tokens.refresh ?? 0} hint="Grace rotation" dot="bg-amber-400" text="text-amber-400" />
        <StatCard label="Gateway users" value={s?.users?.active ?? 0} total={s?.users?.total ?? 0} hint="Admins & team" dot="bg-indigo-400" text="text-indigo-400" wide />
      </div>

      <div class="bg-gradient-to-r from-blue-900/30 via-indigo-900/20 to-purple-900/30 border border-blue-500/20 rounded-2xl p-5 space-y-4">
        <div class="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 class="text-base font-semibold text-white flex items-center gap-2">
              <span>🤖</span> AI client integration hub
            </h2>
            <p class="text-xs text-slate-300 mt-1">
              Connect upstream MCP servers to any model or assistant (Google Gemini, Claude, OpenAI/ChatGPT, Cursor, LibreChat, etc.)
            </p>
          </div>
          <div class="flex items-center gap-2">
            <button
              type="button"
              onClick={() => openGenToken()}
              class="text-xs bg-purple-600 hover:bg-purple-500 text-white font-medium px-3.5 py-1.5 rounded-lg transition shadow-md shadow-purple-600/30 flex items-center gap-1"
            >
              <span>🔑</span> Create access token
            </button>
            <button
              type="button"
              onClick={() => goTab("clients")}
              class="text-xs bg-blue-600 hover:bg-blue-500 text-white font-medium px-3.5 py-1.5 rounded-lg transition shadow-md shadow-blue-600/30"
            >
              Manage clients &rarr;
            </button>
          </div>
        </div>
        <PlatformGuide origin={me.origin} onCreateToken={() => openGenToken()} />
      </div>

      <div class={`${cardCls} p-5`}>
        <h2 class="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <span>⚙️</span> System status & SQLite database
        </h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <SysItem label="SQLite database" value={sys?.dbPath ?? "-"} truncate />
          <SysItem label="Gateway uptime" value={sys ? `${(sys.uptime / 3600).toFixed(1)} h (${sys.uptime}s)` : "-"} />
          <SysItem label="Memory (RSS / Heap)" value={sys ? `${sys.memory.rss}MB / ${sys.memory.heapUsed}MB` : "-"} />
          <SysItem label="Runtime & CLI" value={sys ? runtimes.join(" · ") : "-"} truncate />
        </div>
      </div>
    </section>
  );
}
