import { useEffect, useState } from "preact/hooks";
import { api } from "../api";
import { showToast } from "../toast";
import type { LogRow } from "../types";
import { DataTable, EmptyRow, SectionHeader, Td } from "../ui";

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

export function Logs() {
  const [logs, setLogs] = useState<LogRow[] | null>(null);
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  // The search is debounced by 300ms so the API is not called on every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ limit: "100" });
      if (filter) params.set("filter", filter);
      if (search) params.set("search", search);
      api<{ logs: LogRow[] }>(`/logs?${params}`).then((d) => setLogs(d.logs || []), () => {});
    }, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [filter, search, reloadKey]);

  const clear = async () => {
    if (!confirm("Delete the whole activity log?")) return;
    await api("/logs", { method: "DELETE" });
    showToast("Log cleared");
    setReloadKey((k) => k + 1);
  };

  return (
    <section class="space-y-4">
      <SectionHeader title="Gateway activity log" subtitle="History of requests to OAuth, the HTTP proxy, and stdio commands">
        <button type="button" onClick={() => setReloadKey((k) => k + 1)} class="bg-dark-700 hover:bg-dark-600 text-slate-200 text-xs px-3 py-1.5 rounded-xl border border-dark-600 transition flex items-center gap-1">
          <span>🔄</span> Refresh
        </button>
        <button type="button" onClick={clear} class="bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs px-3 py-1.5 rounded-xl border border-red-500/20 transition">
          Clear
        </button>
      </SectionHeader>

      <div class="flex items-center gap-2 flex-wrap">
        <div class="flex items-center gap-1 bg-dark-800 p-1 rounded-xl border border-dark-700 text-xs">
          {FILTERS.map(([value, label]) => (
            <button
              key={value}
              type="button"
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
          placeholder="Search path / request id..."
          class="bg-dark-800 border border-dark-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
        />
      </div>

      <DataTable head={["Time", "Method", "Path", "Status", "Duration", "Info"]} mono>
        {logs === null ? (
          <EmptyRow cols={6}>Loading log...</EmptyRow>
        ) : logs.length === 0 ? (
          <EmptyRow cols={6}>No activity yet.</EmptyRow>
        ) : (
          logs.map((l, i) => (
            <tr key={`${l.timestamp}-${i}`} class="hover:bg-dark-900/30 transition text-[11px]">
              <Td label="Time" class="!py-2 text-slate-400 whitespace-nowrap">{new Date(l.timestamp).toLocaleTimeString()}</Td>
              <Td label="Method" class={`!py-2 font-bold ${l.method === "POST" ? "text-indigo-400" : "text-blue-400"}`}>{l.method}</Td>
              <Td label="Path" class="!py-2 text-slate-200 truncate max-w-xs">{l.path}</Td>
              <Td label="Status" class="!py-2">
                <span class={`px-2 py-0.5 rounded border ${statusClass(l.status)}`}>{l.status}</span>
              </Td>
              <Td label="Duration" class="!py-2 text-slate-400">{l.duration_ms.toFixed(1)}ms</Td>
              <Td label="Info" class="!py-2 text-slate-400 truncate max-w-xs">{l.info || "-"}</Td>
            </tr>
          ))
        )}
      </DataTable>
    </section>
  );
}
