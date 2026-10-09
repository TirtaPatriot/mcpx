import { ADMIN_SESSION_TTL_MS } from "./config";
import {
  createAdminSession,
  getAdminSession,
  deleteAdminSession,
  getSetting,
  setSetting,
} from "./db";

export { deleteAdminSession };
import { hashPassword, verifyPassword, newSecret } from "./utils";

export function checkAdminPassword(password: string): boolean {
  const hash = getSetting("admin_password_hash");
  if (!hash) return false;
  return verifyPassword(password, hash);
}

export function updateAdminPassword(newPassword: string): void {
  setSetting("admin_password_hash", hashPassword(newPassword));
}

export function createAdminLoginSession(): { sessionId: string; expiresAt: number } {
  const sessionId = newSecret();
  const expiresAt = Date.now() + ADMIN_SESSION_TTL_MS;
  createAdminSession(sessionId, expiresAt);
  return { sessionId, expiresAt };
}

export function parseCookie(header: string | null): Record<string, string> {
  if (!header) return {};
  const cookies: Record<string, string> = {};
  for (const pair of header.split(";")) {
    const [key, ...vals] = pair.trim().split("=");
    if (key) {
      cookies[key] = decodeURIComponent(vals.join("="));
    }
  }
  return cookies;
}

export function validateAdminRequest(request: Request): boolean {
  // 1. Cek Authorization Bearer
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice(7).trim();
    if (getAdminSession(token)) return true;
  }

  // 2. Cek Cookie
  const cookies = parseCookie(request.headers.get("cookie"));
  const sessionToken = cookies["admin_session"];
  if (sessionToken && getAdminSession(sessionToken)) {
    return true;
  }

  return false;
}

export function makeSessionCookie(sessionId: string, maxAgeSeconds: number): string {
  return `admin_session=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export function clearSessionCookie(): string {
  return `admin_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}
