import type { McpServer, OAuthClient } from "./types";

/** Default icon for an MCP server, guessed from its id and command. */
export function serverIcon(s: McpServer): string {
  if (s.icon) return s.icon;
  const isCmd = s.server_type === "command";
  const cmd = (s.command || "").toLowerCase();
  const id = s.id;
  if (id.includes("dokploy")) return "/icons/dokploy.svg";
  if (id.includes("mssql")) return "/icons/mssql.svg";
  if (id.includes("mikrotik")) return "/icons/mikrotik.svg";
  if (id.includes("postgres")) return "/icons/postgres.svg";
  if (cmd.includes("python") || cmd.includes("uv") || id.includes("python") || id.includes("uv")) return "/icons/python.svg";
  if (cmd.includes("go") || id.includes("go")) return "/icons/golang.svg";
  return isCmd ? "/icons/terminal.svg" : "/icons/mcp.svg";
}

/** Default icon for an OAuth client, guessed from its id and redirect URIs. */
export function clientIcon(c: OAuthClient): string {
  if (c.icon) return c.icon;
  const id = c.id;
  if (id.includes("gemini") || c.redirect_uris?.includes("google")) return "/icons/gemini.svg";
  if (id.includes("claude")) return "/icons/claude.svg";
  if (id.includes("chatgpt") || id.includes("openai")) return "/icons/chatgpt.svg";
  if (id.includes("cursor") || id.includes("windsurf")) return "/icons/cursor.svg";
  return "/icons/universal.svg";
}

export const SERVER_ICON_PRESETS = [
  ["Dokploy", "/icons/dokploy.svg"],
  ["MSSQL", "/icons/mssql.svg"],
  ["MikroTik", "/icons/mikrotik.svg"],
  ["PostgreSQL", "/icons/postgres.svg"],
  ["Python", "/icons/python.svg"],
  ["Go", "/icons/golang.svg"],
  ["MCP", "/icons/mcp.svg"],
  ["CLI", "/icons/terminal.svg"],
] as const;

export const CLIENT_ICON_PRESETS = [
  ["Gemini", "/icons/gemini.svg"],
  ["Claude", "/icons/claude.svg"],
  ["ChatGPT", "/icons/chatgpt.svg"],
  ["Cursor", "/icons/cursor.svg"],
  ["Universal", "/icons/universal.svg"],
] as const;
