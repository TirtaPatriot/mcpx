import { useState } from "preact/hooks";
import { CodeBlock, UrlRow, mcpConfigJson } from "../ui";

export type Platform = "gemini" | "claude" | "chatgpt" | "cursor" | "generic";

export const PLATFORMS: { id: Platform; label: string; icon: string }[] = [
  { id: "gemini", label: "Google Gemini", icon: "/icons/gemini.svg" },
  { id: "claude", label: "Claude Desktop / Code", icon: "/icons/claude.svg" },
  { id: "chatgpt", label: "OpenAI / ChatGPT", icon: "/icons/chatgpt.svg" },
  { id: "cursor", label: "Cursor / Windsurf", icon: "/icons/cursor.svg" },
  { id: "generic", label: "Generic / SSE REST", icon: "/icons/universal.svg" },
];

const PLACEHOLDER = "<TOKEN_AKSES>";

/** Pilihan platform + panduan koneksinya; dipakai di tab Ringkasan dan dialog Panduan AI. */
export function PlatformGuide(props: { origin: string; onCreateToken: () => void }) {
  const [platform, setPlatform] = useState<Platform>("gemini");
  const { origin } = props;
  const authUrl = `${origin}/oauth/authorize`;
  const tokenUrl = `${origin}/oauth/token`;
  const note = "text-[11px] text-slate-400";

  return (
    <div class="space-y-3">
      <div class="flex flex-wrap gap-2 text-xs pt-1 border-t border-dark-700/60">
        {PLATFORMS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPlatform(p.id)}
            class={`px-3 py-1.5 rounded-lg font-medium transition flex items-center gap-2 ${
              platform === p.id ? "bg-blue-600 text-white" : "bg-dark-800 text-slate-400 hover:text-white"
            }`}
          >
            <img src={p.icon} class="w-4 h-4 object-contain" /> {p.label}
          </button>
        ))}
      </div>

      {platform === "gemini" && (
        <div class="space-y-3">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
            <UrlRow label="Authorize URL" value={authUrl} />
            <UrlRow label="Token URL" value={tokenUrl} />
          </div>
          <p class={note}>
            💡 <em>Mendukung auto-discovery OAuth 2.1 (RFC 8414 & RFC 9728) untuk integrasi Custom Tools & Gems di Google Gemini Web & Mobile.</em>
          </p>
        </div>
      )}

      {platform === "claude" && (
        <div class="space-y-2">
          <CodeBlock title="Konfigurasi claude_desktop_config.json:" code={mcpConfigJson(origin, PLACEHOLDER)} />
          <div class={`flex items-center justify-between ${note}`}>
            <span>💡 Gunakan Bearer Token untuk koneksi langsung tanpa browser OAuth flow.</span>
            <button type="button" onClick={props.onCreateToken} class="text-purple-400 hover:underline font-medium">
              + Buat Token Akses untuk Claude
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
            💡 <em>Di Custom GPT Actions, pilih auth <strong>OAuth</strong>, masukkan Client ID & Secret dari tab Klien OAuth, dan pilih Basic Auth untuk Token Exchange. Redirect <code>chatgpt.com</code> & <code>openai.com</code> sudah otomatis diizinkan.</em>
          </p>
        </div>
      )}

      {platform === "cursor" && (
        <div class="space-y-2">
          <CodeBlock title="Konfigurasi Cursor (.cursor/mcp.json atau Settings > Features > MCP):" code={mcpConfigJson(origin, PLACEHOLDER)} />
          <div class={`flex items-center justify-between ${note}`}>
            <span>💡 Cursor mendukung remote MCP tipe SSE dengan header Authorization Bearer.</span>
            <button type="button" onClick={props.onCreateToken} class="text-purple-400 hover:underline font-medium">
              + Buat Token Akses untuk Cursor
            </button>
          </div>
        </div>
      )}

      {platform === "generic" && (
        <div class="space-y-2">
          <CodeBlock
            title="Contoh cURL / SSE Client:"
            copyLabel="Salin"
            code={`curl -N -H "Authorization: Bearer ${PLACEHOLDER}" \\\n  -H "Accept: text/event-stream" \\\n  ${origin}/mcp/<SERVER_NAME>`}
          />
          <p class={note}>
            💡 <em>Dapat digunakan langsung di LibreChat, Open WebUI, Dify, LangChain, atau agent framework kustom.</em>
          </p>
        </div>
      )}
    </div>
  );
}
