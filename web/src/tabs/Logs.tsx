import { useEffect, useRef, useState } from "preact/hooks";
import { api } from "../api";
import { useConfirm } from "../components/Confirm";
import { showToast } from "../toast";
import type { LogRow } from "../types";
import { DataTable, EmptyRow, SectionHeader, SkeletonRows, Td, btnGhost, Tr } from "../ui";

const FILTERS = [
  ["", "All"],
  ["mcp", "MCP"],
  ["oauth", "OAuth"],
  ["error", "Error (≥400)"],
] as const;

function statusClass(status: number) {
  if (status >= 500) return "text-red-400 bg-red-500/10 border-red-500/20";
  if (status >= 400) return "text-amber-400 bg-amber-500/10 border-amber-500/20";
  return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
}

const PAGE = 100;
const MAX = 500;
const LIVE_MS = 5000;

export function Logs() {
  const [logs, setLogs] = useState<LogRow[] | null>(null);
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [live, setLive] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const confirm = useConfirm();
  const first = useRef(true);

  const fetchLogs = () => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (filter) params.set("filter", filter);
    if (search) params.set("search", search);
    return api<{ logs: LogRow[] }>(`/logs?${params}`, { silent: true }).then((d) => setLogs(d.logs || []), () => {});
  };

  // Typing in the search box waits 300ms so the API is not called on every keystroke.
  useEffect(() => {
    const delay = search && !first.current ? 300 : 0;
    first.current = false;
    const timer = setTimeout(fetchLogs, delay);
    return () => clearTimeout(timer);
  }, [filter, search, limit, reloadKey]);

  // Live mode refreshes every few seconds, but only while the tab is visible.
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") fetchLogs();
    }, LIVE_MS);
    return () => clearInterval(timer);
  }, [live, filter, search, limit]);

  const clear = async () => {
    const ok = await confirm({
      title: "Clear the activity log?",
      message: "Every logged request is deleted. This cannot be undone.",
      confirmLabel: "Clear log",
      danger: true,
    });
    if (!ok) return;
    await api("/logs", { method: "DELETE" });
    showToast("Log cleared");
    setReloadKey((k) => k + 1);
  };

  const reachedEnd = logs !== null && logs.length < limit;

  return (
    <section class="space-y-4">
      <SectionHeader title="Gateway activity log" subtitle="History of requests to OAuth, the HTTP proxy, and stdio commands">
        <label class="flex items-center gap-2 text-xs text-slate-300 px-1">
          <input type="checkbox" checked={live} onChange={(e) => setLive(e.currentTarget.checked)} class="w-4 h-4 rounded bg-dark-900 border-dark-700 text-blue-600 focus:ring-0" />
          Live
          {live && <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse motion-reduce:animate-none" aria-hidden="true" />}
        </label>
        <button type="button" onClick={() => setReloadKey((k) => k + 1)} class="bg-dark-700 hover:bg-dark-600 text-slate-200 text-xs px-3 py-1.5 rounded-xl border border-dark-600 transition flex items-center gap-1">
          <span>🔄</span> Refresh
        </button>
        <button type="button" onClick={clear} class="bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs px-3 py-1.5 rounded-xl border border-red-500/20 transition">
          Clear
        </button>
      </SectionHeader>

      <div class="flex items-center gap-2 flex-wrap">
        <div role="group" aria-label="Filter by type" class="flex items-center gap-1 bg-dark-800 p-1 rounded-xl border border-dark-700 text-xs">
          {FILTERS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              class={`px-2.5 py-1 rounded-lg ${filter === value ? "bg-blue-600 text-white font-medium" : "text-slate-400 hover:text-white"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={search}
          onInput={(e) => setSearch(e.currentTarget.value)}
          aria-label="Search the log"
          placeholder="Search path / request id..."
          class="bg-dark-800 border border-dark-700 rounded-xl px-3 py-1.5 text-xs text-strong placeholder-slate-500 focus:outline-none focus:border-blue-500"
        />
      </div>

      <DataTable label="Gateway activity log" head={["Time", "Method", "Path", "Status", "Duration", "Info"]} mono>
        {logs === null ? (
          <SkeletonRows cols={6} rows={5} />
        ) : logs.length === 0 ? (
          <EmptyRow
            cols={6}
            title={filter || search ? "No requests match these filters" : "No activity yet"}
            hint={filter || search ? "Try another filter or clear the search." : "Requests to OAuth and to your MCP servers show up here as they happen."}
          />
        ) : (
          logs.map((l, i) => (
            <Tr key={`${l.timestamp}-${i}`} class="hover:bg-dark-900/30 transition text-[11px]">
              <Td label="Time" class="!py-2 text-slate-400 whitespace-nowrap">{new Date(l.timestamp).toLocaleTimeString()}</Td>
              <Td label="Method" class={`!py-2 font-bold ${l.method === "POST" ? "text-indigo-400" : "text-blue-400"}`}>{l.method}</Td>
              <Td label="Path" class="!py-2 text-slate-200 truncate max-w-xs">{l.path}</Td>
              <Td label="Status" class="!py-2">
                <span class={`px-2 py-0.5 rounded border ${statusClass(l.status)}`}>{l.status}</span>
              </Td>
              <Td label="Duration" class="!py-2 text-slate-400">{l.duration_ms.toFixed(1)}ms</Td>
              <Td label="Info" class="!py-2 text-slate-400 truncate max-w-xs">{l.info || "-"}</Td>
            </Tr>
          ))
        )}
      </DataTable>

      {logs !== null && logs.length > 0 && (
        <div class="flex items-center justify-between text-xs text-slate-400">
          <span>
            Showing {logs.length} {logs.length === 1 ? "entry" : "entries"}
          </span>
          {!reachedEnd && limit < MAX && (
            <button type="button" onClick={() => setLimit((n) => Math.min(n + PAGE, MAX))} class={`${btnGhost} text-xs !py-1.5 border border-dark-700`}>
              Load more
            </button>
          )}
          {!reachedEnd && limit >= MAX && <span>Showing the latest {MAX}; search to narrow it down.</span>}
        </div>
      )}
    </section>
  );
}
