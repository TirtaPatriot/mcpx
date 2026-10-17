import type { Brand, ConsentPageData } from "../../../src/consent-data";
import { btnGhost } from "../ui";

function Avatar(props: { src: string; alt: string }) {
  return (
    <div class="w-16 h-16 rounded-2xl bg-dark-900 border border-dark-700 flex items-center justify-center p-2.5 shadow-lg shrink-0">
      <img
        src={props.src}
        alt={props.alt}
        class="w-full h-full object-contain"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).src = "/icons/universal.svg";
        }}
      />
    </div>
  );
}

function Badge(props: { brand: Brand; tone: "blue" | "purple" }) {
  const tone = props.tone === "blue" ? "bg-blue-500/15 text-blue-400 border-blue-500/30" : "bg-purple-500/15 text-purple-400 border-purple-500/30";
  return (
    <span class={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${tone}`}>
      <img src={props.brand.iconUrl} alt="" class="w-3.5 h-3.5 object-contain" onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")} />
      {props.brand.name}
    </span>
  );
}

function Row(props: { label: string; children: preact.ComponentChildren }) {
  return (
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-3">
      <dt class="text-slate-500 text-[13px] shrink-0">{props.label}</dt>
      <dd class="text-slate-200 text-[13px] sm:text-right break-all flex flex-wrap gap-1.5 sm:justify-end">{props.children}</dd>
    </div>
  );
}

const card = "max-w-md w-full bg-dark-800 border border-dark-700 rounded-3xl p-6 sm:p-8 shadow-2xl";

/** The OAuth consent page, and the plain message pages (invalid request, sign-in required). */
export function ConsentView({ data }: { data: ConsentPageData }) {
  if (data.kind === "message") {
    return (
      <main class={`${card} space-y-3`}>
        <h1 class="text-xl font-bold text-strong tracking-tight">{data.title}</h1>
        <p class="text-sm text-slate-400" role="alert">
          {data.message}
        </p>
      </main>
    );
  }

  const { client, servers } = data;
  return (
    <main class={`${card} space-y-6`}>
      <div class="flex items-center justify-center gap-4" aria-hidden="false">
        <Avatar src={client.iconUrl} alt={client.name} />
        <span class="flex items-center gap-1.5 text-slate-500" aria-hidden="true">
          <span class="w-6 h-0.5 rounded bg-gradient-to-r from-blue-500 to-violet-500" />
          <span class="w-7 h-7 rounded-full bg-dark-900 border border-dark-600 flex items-center justify-center text-[13px] text-purple-400">⚡</span>
          <span class="w-6 h-0.5 rounded bg-gradient-to-r from-blue-500 to-violet-500" />
        </span>
        <Avatar src="/logo.png" alt="MCP X" />
      </div>

      <div class="text-center">
        <h1 class="text-xl font-bold text-strong tracking-tight">Connect to your MCP servers?</h1>
        <p class="text-sm text-slate-400 mt-1.5">
          <strong class="text-slate-200">{client.name}</strong> is asking for permission to access your Model Context Protocol (MCP) servers.
        </p>
      </div>

      <dl class="bg-dark-900 border border-dark-700 rounded-2xl p-4 space-y-3">
        <Row label="AI app">
          <Badge brand={{ name: data.clientName, iconUrl: client.iconUrl }} tone="blue" />
        </Row>
        {servers.items.length > 0 && (
          <Row label={servers.requested ? "Target server" : "Servers"}>
            {servers.items.map((s) => (
              <Badge key={s.name} brand={s} tone="purple" />
            ))}
            {servers.more > 0 && <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-dark-700 text-slate-300">+{servers.more} more</span>}
          </Row>
        )}
        <Row label="Client ID">
          <span class="font-mono">{data.clientId}</span>
        </Row>
        {data.user && (
          <Row label="Authorising account">
            <span>
              <strong>{data.user.name}</strong> (@{data.user.username})
            </span>
          </Row>
        )}
        <Row label="Redirects to">
          <span class="font-mono">{data.redirectOrigin}</span>
        </Row>
        {data.scope && <Row label="Scope">{data.scope}</Row>}
      </dl>

      <section aria-label="What this allows" class="bg-blue-500/5 border border-blue-500/15 rounded-xl p-3.5">
        <ul class="space-y-1.5 text-[13px] text-blue-300 list-none p-0">
          <li class="flex items-center gap-2">
            <span class="text-emerald-400" aria-hidden="true">✓</span>
            Read MCP tool, resource and schema descriptions
          </li>
          <li class="flex items-center gap-2">
            <span class="text-emerald-400" aria-hidden="true">✓</span>
            Run MCP tools on behalf of your account
          </li>
        </ul>
      </section>

      <form method="post" action="/oauth/authorize">
        {Object.entries(data.fields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <div class="flex flex-col-reverse sm:flex-row gap-3">
          <button type="submit" name="decision" value="deny" class={`${btnGhost} flex-1 border border-dark-600 font-semibold min-h-12`}>
            Deny
          </button>
          <button
            type="submit"
            name="decision"
            value="allow"
            class="flex-[1.4] min-h-12 rounded-xl font-semibold text-white bg-gradient-to-br from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-600/30 transition"
          >
            Allow access
          </button>
        </div>
      </form>
    </main>
  );
}
