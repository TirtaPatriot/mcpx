import { fatal } from "./utils";

export const PORT = Number(process.env.PORT ?? 3000);
export const DB_PATH = process.env.DB_PATH ?? "./data/tokens.db";

// OAuth TTLs
export const ACCESS_TOKEN_TTL_MS = Number(process.env.ACCESS_TOKEN_TTL ?? 30 * 24 * 3600) * 1000;
export const REFRESH_TOKEN_TTL_MS = Number(process.env.REFRESH_TOKEN_TTL ?? 365 * 24 * 3600) * 1000;
export const REFRESH_GRACE_PERIOD_MS = Number(process.env.REFRESH_GRACE_PERIOD ?? 60) * 1000;
export const AUTH_CODE_TTL_MS = 5 * 60 * 1000;
export const ADMIN_SESSION_TTL_MS = 7 * 24 * 3600 * 1000; // 7 hari

export const LOG_SSE_CHUNKS = (process.env.LOG_SSE_CHUNKS ?? "true") !== "false";

export const DEFAULT_ALLOWED_REDIRECT_HOSTS =
  "google.com,oauth-redirect.googleusercontent.com,chatgpt.com,openai.com,claude.ai,anthropic.com,cursor.com,localhost,127.0.0.1";

export const ALLOWED_REDIRECT_HOSTS = (process.env.ALLOWED_REDIRECT_HOSTS ?? DEFAULT_ALLOWED_REDIRECT_HOSTS)
  .split(",")
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

export const DEFAULT_REDIRECT_URI = "https://google.com";

export const PUBLIC_URL = (() => {
  const raw = process.env.PUBLIC_URL?.trim();
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (url.pathname !== "/" || url.search || url.hash) throw new Error("hanya origin, tanpa path");
    return url.origin;
  } catch (err) {
    return fatal(`PUBLIC_URL tidak valid (contoh: https://gateway.example.com): ${(err as Error).message}`);
  }
})();

export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || undefined;
export const ENV_CLIENT_ID = process.env.CLIENT_ID?.trim() || undefined;
export const ENV_CLIENT_SECRET = process.env.CLIENT_SECRET?.trim() || undefined;
export const ENV_MCP_SERVERS = process.env.MCP_SERVERS?.trim() || undefined;
