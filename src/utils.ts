import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { PUBLIC_URL } from "./config";

export const fatal = (msg: string): never => {
  console.error(`[config] ${msg}`);
  process.exit(1);
};

export const log = (id: string, msg: string) =>
  console.log(`${new Date().toISOString()} [${id}] ${msg}`);

export const newSecret = () => randomBytes(32).toString("base64url");

export function safeEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function hashPassword(password: string, salt = "mcp_gateway_salt_"): string {
  return createHash("sha256").update(`${salt}:${password}`).digest("hex");
}

export function verifyPassword(password: string, hash: string, salt = "mcp_gateway_salt_"): boolean {
  const computed = hashPassword(password, salt);
  return safeEqual(computed, hash);
}

export const esc = (s: string) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const SENSITIVE_PARAMS = new Set(["code", "client_secret", "code_verifier", "access_token", "refresh_token"]);

export function safePath(url: URL): string {
  const params = new URLSearchParams(url.search);
  for (const key of [...params.keys()]) {
    if (SENSITIVE_PARAMS.has(key)) params.set(key, "REDACTED");
  }
  const qs = params.toString();
  return url.pathname + (qs ? `?${qs}` : "");
}

export const preview = (text: string, max = 200) => {
  const flat = text.replace(/\r?\n/g, "⏎");
  return flat.length > max ? `${flat.slice(0, max)}…(+${flat.length - max})` : flat;
};

export const reqMeta = new WeakMap<Request, { id: string; startedAt: number }>();
export const metaOf = (request: Request) => reqMeta.get(request) ?? { id: "-", startedAt: performance.now() };
export const elapsed = (startedAt: number) => `${(performance.now() - startedAt).toFixed(1)}ms`;

export function publicOrigin(request: Request): string {
  const first = (name: string) => request.headers.get(name)?.split(",")[0]?.trim() || undefined;
  const url = new URL(request.url);
  const proto = first("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host = first("x-forwarded-host") ?? first("host") ?? url.host;
  if (host && !host.includes("localhost") && !host.includes("127.0.0.1") && !host.startsWith("10.") && !host.startsWith("172.") && !host.startsWith("192.")) {
    return `${proto}://${host}`;
  }
  if (PUBLIC_URL) return PUBLIC_URL;
  return `${proto}://${host}`;
}

export const str = (v: unknown): string | undefined => (typeof v === "string" && v !== "" ? v : undefined);

export const asRecord = (body: unknown): Record<string, unknown> =>
  body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};

export const safeDecode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};
