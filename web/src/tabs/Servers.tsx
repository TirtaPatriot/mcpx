import { useEffect, useState } from "preact/hooks";
import { api } from "../api";
import { useConfirm } from "../components/Confirm";
import { PlatformGuide } from "../components/PlatformGuide";
import { RowActions } from "../components/RowActions";
import { useApp } from "../context";
import { SERVER_ICON_PRESETS, serverIcon } from "../icons";
import { copyText, showToast } from "../toast";
import type { McpServer, TestResult } from "../types";
import {
  DataTable,
  EmptyRow,
  EnabledPill,
  Field,
  IconBox,
  Modal,
  ModalFooter,
  SearchInput,
  SectionHeader,
  SkeletonRows,
  Td,
  btnPrimary,
  filterBy,
  inputCls,
  jsonObjectError,
  monoInputCls, Tr } from "../ui";

const DEFAULT_ARGS = ["", "-y @dokploy/mcp", "mcp-server-git", "server.py", "main.go"];
const COMMAND_PRESETS: Record<string, string> = {
  bunx: "-y @dokploy/mcp",
  npx: "-y @dokploy/mcp",
  uvx: "mcp-server-git",
  "uv run": "server.py",
  "go run": "main.go",
  python: "server.py",
};

type PingState = { loading: true } | { loading: false; result?: TestResult; failed?: boolean };

export function Servers() {
  const [servers, setServers] = useState<McpServer[] | null>(null);
  const [editing, setEditing] = useState<McpServer | "new" | null>(null);
  const [connecting, setConnecting] = useState<McpServer | null>(null);
  const [pings, setPings] = useState<Record<string, PingState>>({});
  const [query, setQuery] = useState("");
  const confirm = useConfirm();

  const shown = filterBy(servers ?? [], query, (s) => [s.id, s.name, s.description, s.url, s.command, s.args]);
  const load = () => api<{ servers: McpServer[] }>("/servers").then((d) => setServers(d.servers), () => {});
  useEffect(() => void load(), []);

  const toggle = async (id: string) => {
    await api(`/servers/${id}/toggle`, { method: "POST" });
    showToast("Server status changed");
    load();
  };

  const remove = async (s: McpServer) => {
    const ok = await confirm({
      title: `Delete ${s.name}?`,
      message: (
        <>
          AI clients will no longer reach <code class="font-mono text-slate-200">/mcp/{s.id}</code>. Their access tokens stay valid for your other servers. This cannot be undone.
        </>
      ),
      confirmLabel: "Delete server",
      danger: true,
    });
    if (!ok) return;
    await api(`/servers/${s.id}`, { method: "DELETE" });
    showToast("Server deleted");
    load();
  };

  const ping = async (id: string) => {
    setPings((p) => ({ ...p, [id]: { loading: true } }));
    try {
      const res = await api<{ result: TestResult }>(`/servers/${id}/test`, { method: "POST" });
      setPings((p) => ({ ...p, [id]: { loading: false, result: res.result } }));
    } catch {
      setPings((p) => ({ ...p, [id]: { loading: false, failed: true } }));
    }
  };

  return (
    <section class="space-y-4">
      <SectionHeader
        title="MCP servers"
        subtitle={
          <>
            Supports URL servers (HTTP/SSE) and CLI/stdio servers via <code>bunx</code>, <code>uv / uvx</code>, <code>go run</code>, <code>python</code>, <code>npx</code>
          </>
        }
      >
        <button type="button" onClick={() => setEditing("new")} class={`${btnPrimary} text-xs px-4 flex items-center gap-1.5`}>
          <span>+</span> Add MCP server
        </button>
      </SectionHeader>

      <SearchInput value={query} onInput={setQuery} label="Search MCP servers" placeholder="Search servers..." />

      <DataTable busy={servers === null} label="MCP servers" head={["Status", "Type", "ID & name", "Target / command", "Connection", "Actions"]}>
        {servers === null ? (
          <SkeletonRows cols={6} />
        ) : servers.length === 0 ? (
          <EmptyRow
            cols={6}
            title="No MCP servers yet"
            hint="Add the MCP server your AI clients should reach, either an HTTP URL or a command to run."
            action={{ label: "Add MCP server", onClick: () => setEditing("new") }}
          />
        ) : shown.length === 0 ? (
          <EmptyRow cols={6} title={`No server matches "${query}"`} hint="Check the spelling or clear the search." />
        ) : (
          shown.map((s) => (
            <ServerRow
              key={s.id}
              s={s}
              ping={pings[s.id]}
              onToggle={() => toggle(s.id)}
              onPing={() => ping(s.id)}
              onEdit={() => setEditing(s)}
              onConnect={() => setConnecting(s)}
              onDelete={() => remove(s)}
            />
          ))
        )}
      </DataTable>

      {connecting && <ConnectServerModal server={connecting} onClose={() => setConnecting(null)} />}
      {editing && (
        <ServerModal
          server={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            showToast("MCP server saved");
            load();
          }}
        />
      )}
    </section>
  );
}

function ServerRow(props: {
  s: McpServer;
  ping?: PingState;
  onToggle: () => void;
  onPing: () => void;
  onEdit: () => void;
  onConnect: () => void;
  onDelete: () => void;
}) {
  const { s, ping } = props;
  const isCmd = s.server_type === "command";
  return (
    <Tr class="hover:bg-dark-900/30 transition">
      <Td label="Status">
        <EnabledPill enabled={s.enabled} offLabel="Off" subject={s.name} onClick={props.onToggle} />
      </Td>
      <Td label="Type">
        {isCmd ? (
          <span class="px-2 py-0.5 rounded-full text-[10px] font-mono bg-purple-500/10 text-purple-400 border border-purple-500/20">CLI/STDIO</span>
        ) : (
          <span class="px-2 py-0.5 rounded-full text-[10px] font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20">HTTP</span>
        )}
      </Td>
      <Td label="Server">
        <div class="flex items-center gap-3">
          <IconBox src={serverIcon(s)} fallback="/icons/mcp.svg" />
          <div>
            <div class="font-medium text-strong">{s.name}</div>
            <div class="text-[11px] font-mono text-blue-400">/mcp/{s.id}/*</div>
            {s.description && <div class="text-[11px] text-slate-400 mt-0.5">{s.description}</div>}
          </div>
        </div>
      </Td>
      <Td label="Target">
        {isCmd ? (
          <span class="text-purple-300 font-mono">
            {s.command || "bunx"} {s.args || ""}
          </span>
        ) : (
          <span class="text-slate-300 font-mono truncate block max-w-xs">{s.url}</span>
        )}
      </Td>
      <Td label="Connection">
        <div aria-live="polite">
        {!ping ? (
          <button type="button" aria-label={`Test ping (${s.name})`} onClick={props.onPing} class="text-[11px] bg-dark-700 hover:bg-dark-600 border border-dark-600 px-2.5 py-1 rounded-lg text-slate-200 transition">
            Test ping
          </button>
        ) : ping.loading ? (
          <span class="text-[11px] text-slate-400">Testing...</span>
        ) : ping.failed ? (
          <span class="text-[11px] text-red-400"><span aria-hidden="true">✗</span> Error</span>
        ) : ping.result?.ok ? (
          <span class="text-[11px] text-emerald-400 font-mono">
            <span aria-hidden="true">✓</span> {ping.result.status || "OK"}
            {ping.result.serverInfo?.name ? ` (${ping.result.serverInfo.name})` : ""} ({ping.result.latencyMs}ms)
          </span>
        ) : (
          <span class="text-[11px] text-red-400 font-mono" title={ping.result?.error || ""}>
            <span aria-hidden="true">✗</span> Failed ({ping.result?.latencyMs}ms)
          </span>
        )}
        </div>
      </Td>
      <Td label="Actions" actions>
        <RowActions
          subject={s.name}
          primary={[
            { label: "Connect", onClick: props.onConnect },
            { label: "Edit", onClick: props.onEdit },
          ]}
          menu={[{ label: "Delete server", onClick: props.onDelete, danger: true }]}
        />
      </Td>
    </Tr>
  );
}

function ServerModal(props: { server: McpServer | null; onClose: () => void; onSaved: () => void }) {
  const s = props.server;
  const [id, setId] = useState(s?.id ?? "");
  const [name, setName] = useState(s?.name ?? "");
  const [icon, setIcon] = useState(s?.icon ?? "");
  const [type, setType] = useState<"http" | "command">(s?.server_type ?? "http");
  const [url, setUrl] = useState(s?.url ?? "");
  const [headers, setHeaders] = useState(s?.headers ?? "");
  const [command, setCommand] = useState(s ? s.command || "bunx" : "bunx");
  const [args, setArgs] = useState(s?.args ?? "");
  const [envVars, setEnvVars] = useState(s?.env_vars ?? "");
  const [description, setDescription] = useState(s?.description ?? "");
  const [enabled, setEnabled] = useState(s?.enabled ?? true);
  const [testing, setTesting] = useState(false);
  // Only the fields of the chosen type are validated, since the other ones are hidden.
  const headersError = type === "http" ? jsonObjectError(headers) : "";
  const envError = type === "command" ? jsonObjectError(envVars) : "";

  const applyCommandPreset = (cmd: string) => {
    setCommand(cmd);
    if (DEFAULT_ARGS.includes(args.trim()) && COMMAND_PRESETS[cmd]) setArgs(COMMAND_PRESETS[cmd]);
    const curIcon = icon.trim();
    if (!curIcon || curIcon === "/icons/mcp.svg" || curIcon === "/icons/terminal.svg") {
      if (cmd.includes("python") || cmd.includes("uv")) setIcon("/icons/python.svg");
      else if (cmd.includes("go")) setIcon("/icons/golang.svg");
    }
  };

  const testCommand = async () => {
    setTesting(true);
    try {
      const res = await api<{ result: TestResult }>("/test-connection", {
        method: "POST",
        body: { command, args, env_vars: envVars },
        silent: true,
      });
      if (res.result.ok) showToast(`Handshake succeeded! Latency: ${res.result.latencyMs}ms`);
      else showToast(`Failed: ${res.result.error}`, true);
    } catch (err) {
      showToast((err as Error).message, true);
    } finally {
      setTesting(false);
    }
  };

  const save = async (e: Event) => {
    e.preventDefault();
    const payload = { id, name, server_type: type, url, headers, command, args, env_vars: envVars, icon: icon.trim(), description, enabled };
    if (s) await api(`/servers/${id}`, { method: "PUT", body: payload });
    else await api("/servers", { method: "POST", body: payload });
    props.onSaved();
  };

  const typeBtn = (active: boolean, color: string) =>
    `py-2 px-3 rounded-xl border font-medium flex items-center justify-center gap-1.5 ${
      active ? `${color} text-strong` : "border-dark-700 bg-dark-900 text-slate-400 hover:text-strong"
    }`;
  const chip = "text-[10px] bg-dark-700 hover:bg-dark-600 px-1.5 py-0.5 rounded text-slate-300";

  return (
    <Modal title={s ? "Edit MCP server" : "Add MCP server"} onClose={props.onClose}>
      <form onSubmit={save} class="space-y-3 text-xs">
        <Field label={<>ID slug (letters, digits, dashes, e.g. <code>dokploy</code> or <code>filesystem</code>)</>}>
          <input type="text" required disabled={!!s} value={id} onInput={(e) => setId(e.currentTarget.value)} placeholder="dokploy" class={monoInputCls} />
        </Field>
        <Field label="Display name">
          <input type="text" required value={name} onInput={(e) => setName(e.currentTarget.value)} placeholder="Dokploy MCP Server" class={inputCls} />
        </Field>

        <div>
          <div class="flex items-center justify-between mb-1">
            <label for="srv-icon" class="text-slate-400">Logo / icon (preset or image URL)</label>
            <div class="flex flex-wrap items-center gap-1">
              {SERVER_ICON_PRESETS.map(([label, path]) => (
                <button key={path} type="button" onClick={() => setIcon(path)} class={chip}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div class="flex items-center gap-2">
            <input id="srv-icon" type="text" value={icon} onInput={(e) => setIcon(e.currentTarget.value)} placeholder="/icons/dokploy.svg or https://..." class={`flex-1 ${monoInputCls}`} />
            <div class="w-8 h-8 rounded-lg bg-dark-900 border border-dark-700 flex items-center justify-center shrink-0 p-1">
              <img src={icon.trim() || "/icons/mcp.svg"} alt="" class="w-full h-full object-contain" onError={(e) => ((e.currentTarget as HTMLImageElement).src = "/icons/mcp.svg")} />
            </div>
          </div>
        </div>

        <Field label="Execution type" group>
          <div class="grid grid-cols-2 gap-2">
            <button type="button" aria-pressed={type === "http"} onClick={() => setType("http")} class={typeBtn(type === "http", "border-blue-500 bg-blue-600/20")}>
              <span aria-hidden="true">🌐</span> Upstream URL (HTTP)
            </button>
            <button type="button" aria-pressed={type === "command"} onClick={() => setType("command")} class={typeBtn(type === "command", "border-purple-500 bg-purple-600/20")}>
              <span aria-hidden="true">⚡</span> CLI / Stdio (bunx, uv, go run, npx)
            </button>
          </div>
        </Field>

        {type === "http" ? (
          <div class="space-y-3">
            <Field label={<>Upstream URL (e.g. <code>http://host.docker.internal:3001</code>)</>}>
              <input type="url" value={url} onInput={(e) => setUrl(e.currentTarget.value)} placeholder="http://host.docker.internal:3001" class={monoInputCls} />
            </Field>
            <Field label="Injected headers (JSON, optional)" error={headersError}>
              <textarea rows={2} value={headers} onInput={(e) => setHeaders(e.currentTarget.value)} placeholder='{"Authorization": "Bearer token-mcp-upstream"}' class={`${monoInputCls} ${headersError ? "!border-red-500" : ""}`} />
            </Field>
          </div>
        ) : (
          <div class="space-y-3">
            <div>
              <div class="flex items-center justify-between mb-1">
                <label for="srv-command" class="text-slate-400">Command</label>
                <div class="flex flex-wrap gap-1">
                  {Object.keys(COMMAND_PRESETS).map((cmd) => (
                    <button key={cmd} type="button" onClick={() => applyCommandPreset(cmd)} class={`${chip} px-2 hover:text-strong`}>
                      {cmd}
                    </button>
                  ))}
                </div>
              </div>
              <input id="srv-command" type="text" value={command} onInput={(e) => setCommand(e.currentTarget.value)} placeholder="bunx / uvx / go run / python" class={monoInputCls} />
            </div>
            <Field label={<>Arguments / file / package name (e.g. <code>-y @dokploy/mcp</code>, <code>mcp-server-git</code>, or <code>main.go</code>)</>}>
              <input type="text" value={args} onInput={(e) => setArgs(e.currentTarget.value)} placeholder="-y @dokploy/mcp" class={monoInputCls} />
            </Field>
            <Field label="Environment variables (JSON, e.g. Dokploy URL and token)" error={envError}>
              <textarea rows={3} value={envVars} onInput={(e) => setEnvVars(e.currentTarget.value)} placeholder='{"DOKPLOY_URL": "https://dokploy.example.com", "DOKPLOY_API_KEY": "xxx"}' class={`${monoInputCls} ${envError ? "!border-red-500" : ""}`} />
            </Field>
            <div class="flex items-center justify-between bg-dark-900/60 p-2.5 rounded-xl border border-dark-700">
              <span class="text-[11px] text-slate-400">Test the handshake before saving:</span>
              <button type="button" disabled={testing} onClick={testCommand} class="text-xs bg-dark-700 hover:bg-dark-600 px-3 py-1 rounded-lg text-slate-200">
                {testing ? "Testing handshake..." : "Test command now"}
              </button>
            </div>
          </div>
        )}

        <Field label="Description">
          <input type="text" value={description} onInput={(e) => setDescription(e.currentTarget.value)} placeholder="Dokploy MCP server for deployments" class={inputCls} />
        </Field>
        <label class="flex items-center gap-2 pt-1 text-slate-300">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.currentTarget.checked)} class="w-4 h-4 rounded bg-dark-900 border-dark-700 text-blue-600 focus:ring-0" />
          Enable this server
        </label>

        <ModalFooter onCancel={props.onClose} submitLabel="Save server" disabled={!!(headersError || envError)} />
      </form>
    </Modal>
  );
}

/** Connection details for one server: the exact URL and a ready-to-paste config per AI client. */
function ConnectServerModal(props: { server: McpServer; onClose: () => void }) {
  const { me, openGenToken } = useApp();
  const { server } = props;
  return (
    <Modal title={`Connect to ${server.name}`} onClose={props.onClose} size="xl" closeOnOverlay>
      <div class="bg-dark-900/90 p-3 rounded-xl border border-dark-700 text-xs font-mono flex items-center justify-between gap-2">
        <div class="min-w-0">
          <span class="text-[11px] text-slate-500 block font-sans">MCP endpoint</span>
          <span class="text-blue-300 break-all">
            {me.origin}/mcp/{server.id}
          </span>
        </div>
        <button type="button" onClick={() => copyText(`${me.origin}/mcp/${server.id}`)} class="text-blue-400 hover:underline text-xs shrink-0">
          Copy
        </button>
      </div>
      <div class="text-xs">
        <PlatformGuide
          origin={me.origin}
          serverId={server.id}
          onCreateToken={() => {
            props.onClose();
            openGenToken();
          }}
        />
      </div>
    </Modal>
  );
}
