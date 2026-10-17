import { useEffect, useState } from "preact/hooks";
import { api } from "../api";
import { PlatformGuide } from "../components/PlatformGuide";
import { useApp, type TabId } from "../context";
import type { McpServer, Stats } from "../types";
import { btnPrimary, cardCls, inputCls } from "../ui";

function StatusItem(props: { label: string; value: number; total?: number; tab: TabId; dot: string }) {
  const { goTab } = useApp();
  return (
    <button
      type="button"
      onClick={() => goTab(props.tab)}
      class="text-left px-4 py-3.5 hover:bg-dark-700/40 focus-visible:bg-dark-700/40 transition flex flex-col gap-1"
      aria-label={`${props.label}: ${props.value}${props.total !== undefined ? ` of ${props.total} active` : ""}. Open ${props.tab}.`}
    >
      <span class="text-xs text-slate-400 flex items-center gap-1.5">
        <span class={`inline-block w-1.5 h-1.5 rounded-full ${props.dot}`} aria-hidden="true" />
        {props.label}
      </span>
      <span class="text-2xl font-semibold text-strong tabular-nums">
        {props.value}
        {props.total !== undefined && <span class="text-xs font-normal text-slate-400"> of {props.total} active</span>}
      </span>
    </button>
  );
}

function Step(props: { done: boolean; title: string; hint: string; action: { label: string; onClick: () => void } }) {
  return (
    <li class="flex items-start gap-3">
      <span
        class={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
          props.done ? "bg-emerald-500/20 text-emerald-300" : "bg-dark-700 text-slate-300"
        }`}
        aria-hidden="true"
      >
        {props.done ? "✓" : ""}
      </span>
      <div class="flex-1 min-w-0">
        <p class={`text-sm font-medium ${props.done ? "text-slate-400 line-through" : "text-strong"}`}>
          {props.title}
          <span class="sr-only">{props.done ? " (done)" : " (to do)"}</span>
        </p>
        <p class="text-xs text-slate-400">{props.hint}</p>
      </div>
      {!props.done && (
        <button type="button" onClick={props.action.onClick} class={`${btnPrimary} text-xs shrink-0`}>
          {props.action.label}
        </button>
      )}
    </li>
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
  const [servers, setServers] = useState<McpServer[]>([]);
  const [serverId, setServerId] = useState("");

  useEffect(() => {
    api<Stats>("/stats", { silent: true }).then(setData, () => {});
    api<{ servers: McpServer[] }>("/servers", { silent: true }).then((d) => {
      const enabled = d.servers.filter((s) => s.enabled);
      setServers(enabled);
      setServerId(enabled[0]?.id ?? "");
    }, () => {});
  }, []);

  const s = data?.stats;
  const sys = data?.system;
  const hasServer = (s?.servers.total ?? 0) > 0;
  const hasAccess = (s?.tokens.access ?? 0) + (s?.tokens.refresh ?? 0) > 0;
  const runtimes = [`Bun v${sys?.bunVersion ?? "-"}`];
  if (sys?.runtimes?.uv) runtimes.push("uv");
  if (sys?.runtimes?.go) runtimes.push("go");
  if (sys?.runtimes?.python) runtimes.push("python");
  if (sys?.runtimes?.npx) runtimes.push("npx");

  return (
    <section class="space-y-6">
      <div class={`${cardCls} grid grid-cols-2 md:grid-cols-5 divide-dark-700 md:divide-x overflow-hidden`}>
        <StatusItem label="MCP servers" value={s?.servers.active ?? 0} total={s?.servers.total ?? 0} tab="servers" dot="bg-blue-400" />
        <StatusItem label="OAuth clients" value={s?.clients.active ?? 0} total={s?.clients.total ?? 0} tab="clients" dot="bg-emerald-400" />
        <StatusItem label="Access tokens" value={s?.tokens.access ?? 0} tab="tokens" dot="bg-purple-400" />
        <StatusItem label="Refresh tokens" value={s?.tokens.refresh ?? 0} tab="tokens" dot="bg-amber-400" />
        <StatusItem label="Users" value={s?.users?.active ?? 0} total={s?.users?.total ?? 0} tab="users" dot="bg-indigo-400" />
      </div>

      {data && (!hasServer || !hasAccess) && (
        <div class={`${cardCls} p-5`}>
          <h2 class="text-base font-semibold text-strong">Get started</h2>
          <p class="text-xs text-slate-400 mt-0.5 mb-4">Two steps and an AI app can use your MCP server.</p>
          <ol class="space-y-4">
            <Step
              done={hasServer}
              title="Add an MCP server"
              hint="An HTTP URL, or a command such as bunx, uvx or go run that the gateway runs for you."
              action={{ label: "Add server", onClick: () => goTab("servers") }}
            />
            <Step
              done={hasAccess}
              title="Give an AI app access"
              hint="Issue an access token for apps like Claude Desktop or Cursor, or register an OAuth client."
              action={{ label: "Create access token", onClick: () => openGenToken() }}
            />
          </ol>
        </div>
      )}

      <div class="bg-gradient-to-r from-blue-900/30 via-indigo-900/20 to-purple-900/30 border border-blue-500/20 rounded-2xl p-5 space-y-4">
        <div class="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 class="text-base font-semibold text-strong">Connect an AI app</h2>
            <p class="text-xs text-slate-300 mt-1">Copy the settings for your app. They already point at your gateway.</p>
          </div>
          <div class="flex items-center gap-2 flex-wrap">
            {servers.length > 1 && (
              <select aria-label="MCP server to connect" value={serverId} onChange={(e) => setServerId(e.currentTarget.value)} class={`${inputCls} !w-auto text-xs !py-1.5`}>
                {servers.map((sv) => (
                  <option key={sv.id} value={sv.id}>
                    {sv.name}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={() => openGenToken()}
              class="text-xs bg-purple-600 hover:bg-purple-500 text-white font-medium px-3.5 py-1.5 rounded-lg transition shadow-md shadow-purple-600/30"
            >
              Create access token
            </button>
            <button
              type="button"
              onClick={() => goTab("clients")}
              class="text-xs bg-blue-600 hover:bg-blue-500 text-white font-medium px-3.5 py-1.5 rounded-lg transition shadow-md shadow-blue-600/30"
            >
              Manage clients
            </button>
          </div>
        </div>
        <PlatformGuide origin={me.origin} serverId={serverId || undefined} onCreateToken={() => openGenToken()} />
      </div>

      <div class={`${cardCls} p-5`}>
        <h2 class="text-sm font-semibold text-strong mb-3">System</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <SysItem label="SQLite database" value={sys?.dbPath ?? "-"} truncate />
          <SysItem label="Uptime" value={sys ? `${(sys.uptime / 3600).toFixed(1)} h (${sys.uptime}s)` : "-"} />
          <SysItem label="Memory (RSS / heap)" value={sys ? `${sys.memory.rss}MB / ${sys.memory.heapUsed}MB` : "-"} />
          <SysItem label="Runtimes" value={sys ? runtimes.join(" · ") : "-"} truncate />
        </div>
      </div>
    </section>
  );
}
