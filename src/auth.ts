import { ADMIN_SESSION_TTL_MS } from "./config";
import {
  createAdminSession,
  getAdminSession,
  deleteAdminSession,
  getSetting,
  setSetting,
  getUserByUsername,
  getUserById,
  type UserRow,
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

export function authenticateUser(username: string = "admin", password: string): UserRow | null {
  const cleanUsername = (username || "admin").trim().toLowerCase();
  const user = getUserByUsername(cleanUsername);

  if (user) {
    if (user.enabled !== 1) return null;
    if (verifyPassword(password, user.password_hash)) {
      return user;
    }
    return null;
  }

  // Backward-compatibility fallback for the main admin
  if (cleanUsername === "admin") {
    if (checkAdminPassword(password)) {
      const fallbackUser: UserRow = {
        id: "usr-admin",
        username: "admin",
        name: "Administrator",
        password_hash: getSetting("admin_password_hash") || hashPassword(password),
        role: "admin",
        enabled: 1,
        created_at: Date.now(),
        updated_at: Date.now(),
      };
      return fallbackUser;
    }
  }

  return null;
}

export function createAdminLoginSession(userId?: string | null): { sessionId: string; expiresAt: number } {
  const sessionId = newSecret();
  const expiresAt = Date.now() + ADMIN_SESSION_TTL_MS;
  createAdminSession(sessionId, expiresAt, userId ?? null);
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

export function getSessionUser(request: Request): UserRow | null {
  let sessionToken: string | undefined;

  // 1. Check the Authorization Bearer header
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    sessionToken = auth.slice(7).trim();
  }

  // 2. Check the cookie
  if (!sessionToken) {
    const cookies = parseCookie(request.headers.get("cookie"));
    sessionToken = cookies["admin_session"];
  }

  if (!sessionToken) return null;

  const session = getAdminSession(sessionToken);
  if (!session) return null;

  if (session.user_id) {
    const user = getUserById(session.user_id);
    if (user && user.enabled === 1) {
      return user;
    }
    return null;
  }

  // Legacy session (no user_id): default to admin
  const defaultAdmin = getUserByUsername("admin");
  if (defaultAdmin && defaultAdmin.enabled === 1) {
    return defaultAdmin;
  }

  return {
    id: "usr-admin",
    username: "admin",
    name: "Administrator",
    password_hash: "",
    role: "admin",
    enabled: 1,
    created_at: session.created_at,
    updated_at: session.created_at,
  };
}

export function validateAdminRequest(request: Request): boolean {
  return getSessionUser(request) !== null;
}

export function makeSessionCookie(sessionId: string, maxAgeSeconds: number): string {
  return `admin_session=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export function clearSessionCookie(): string {
  return `admin_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}
