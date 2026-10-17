import { useId, useRef, useState } from "preact/hooks";
import { CodeBlock, UrlRow, mcpConfigJson } from "../ui";

export type Platform = "gemini" | "claude" | "chatgpt" | "cursor" | "generic";

export const PLATFORMS: { id: Platform; label: string; icon: string }[] = [
  { id: "gemini", label: "Google Gemini", icon: "/icons/gemini.svg" },
  { id: "claude", label: "Claude Desktop / Code", icon: "/icons/claude.svg" },
  { id: "chatgpt", label: "OpenAI / ChatGPT", icon: "/icons/chatgpt.svg" },
  { id: "cursor", label: "Cursor / Windsurf", icon: "/icons/cursor.svg" },
  { id: "generic", label: "Generic / SSE REST", icon: "/icons/universal.svg" },
];

const PLACEHOLDER = "<ACCESS_TOKEN>";

/** Platform picker plus its connection guide; used on the Overview tab and in the AI guide dialog. */
export function PlatformGuide(props: { origin: string; serverId?: string; onCreateToken: () => void }) {
  const [platform, setPlatform] = useState<Platform>("gemini");
  const uid = useId();
  const strip = useRef<HTMLDivElement>(null);
  const { origin } = props;
  const serverId = props.serverId ?? "<server-name>";
  const authUrl = `${origin}/oauth/authorize`;
  const tokenUrl = `${origin}/oauth/token`;
  const note = "text-[11px] text-slate-400";

  return (
    <div class="space-y-3">
      <div
        ref={strip}
        role="tablist"
        aria-label="AI app"
        onKeyDown={(e) => {
          // Arrow keys, Home and End move between the tabs, as in the ARIA tabs pattern.
          const i = PLATFORMS.findIndex((p) => p.id === platform);
          const to = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? PLATFORMS.length - 1 : null;
          if (to === null) return;
          e.preventDefault();
          const next = PLATFORMS[(to + PLATFORMS.length) % PLATFORMS.length];
          setPlatform(next.id);
          strip.current?.querySelector<HTMLElement>(`[data-platform="${next.id}"]`)?.focus();
        }}
        class="flex flex-wrap gap-2 text-xs pt-1 border-t border-dark-700/60"
      >
        {PLATFORMS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            id={`${uid}-tab-${p.id}`}
            data-platform={p.id}
            aria-selected={platform === p.id}
            aria-controls={`${uid}-panel`}
            tabIndex={platform === p.id ? 0 : -1}
            onClick={() => setPlatform(p.id)}
            class={`px-3 py-1.5 rounded-lg font-medium transition flex items-center gap-2 ${
              platform === p.id ? "bg-blue-600 text-white" : "bg-dark-800 text-slate-400 hover:text-strong"
            }`}
          >
            <img src={p.icon} alt="" class="w-4 h-4 object-contain" /> {p.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`${uid}-panel`} aria-labelledby={`${uid}-tab-${platform}`} tabIndex={0} class="space-y-3 outline-offset-4 rounded-lg">
      {platform === "gemini" && (
        <div class="space-y-3">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
            <UrlRow label="Authorization URL" value={authUrl} />
            <UrlRow label="Token URL" value={tokenUrl} />
          </div>
          <p class={note}>
            <span aria-hidden="true">💡</span> <em>Supports OAuth 2.1 auto-discovery (RFC 8414 &amp; RFC 9728) for Custom Tools and Gems in Google Gemini on web and mobile.</em>
          </p>
        </div>
      )}

      {platform === "claude" && (
        <div class="space-y-2">
          <CodeBlock title="claude_desktop_config.json:" code={mcpConfigJson(origin, PLACEHOLDER, serverId)} />
          <div class={`flex items-center justify-between ${note}`}>
            <span><span aria-hidden="true">💡</span> Use a Bearer token for a direct connection, without the browser OAuth flow.</span>
            <button type="button" onClick={props.onCreateToken} class="text-purple-400 hover:underline font-medium">
              + Create access token for Claude
            </button>
          </div>
        </div>
      )}

      {platform === "chatgpt" && (
        <div class="space-y-2">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
            <UrlRow label="Auth URL" value={authUrl} />
            <UrlRow label="Token URL" value={tokenUrl} />
          </div>
          <p class={note}>
            <span aria-hidden="true">💡</span> <em>In Custom GPT Actions choose <strong>OAuth</strong> authentication, enter the Client ID and Secret from the OAuth Clients tab, and pick Basic Auth for the token exchange. Redirects from <code>chatgpt.com</code> and <code>openai.com</code> are allowed automatically.</em>
          </p>
        </div>
      )}

      {platform === "cursor" && (
        <div class="space-y-2">
          <CodeBlock title="Cursor config (.cursor/mcp.json or Settings > Features > MCP):" code={mcpConfigJson(origin, PLACEHOLDER, serverId)} />
          <div class={`flex items-center justify-between ${note}`}>
            <span><span aria-hidden="true">💡</span> Cursor supports remote SSE MCP servers with an Authorization Bearer header.</span>
            <button type="button" onClick={props.onCreateToken} class="text-purple-400 hover:underline font-medium">
              + Create access token for Cursor
            </button>
          </div>
        </div>
      )}

      {platform === "generic" && (
        <div class="space-y-2">
          <CodeBlock
            title="cURL / SSE client example:"
            copyLabel="Copy"
            code={`curl -N -H "Authorization: Bearer ${PLACEHOLDER}" \\\n  -H "Accept: text/event-stream" \\\n  ${origin}/mcp/${serverId}`}
          />
          <p class={note}>
            <span aria-hidden="true">💡</span> <em>Works as-is with LibreChat, Open WebUI, Dify, LangChain, or any custom agent framework.</em>
          </p>
        </div>
      )}
      </div>
    </div>
  );
}
