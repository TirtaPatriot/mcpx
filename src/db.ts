import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  DB_PATH,
  ENV_CLIENT_ID,
  ENV_CLIENT_SECRET,
  ENV_MCP_SERVERS,
  ADMIN_PASSWORD,
  REFRESH_GRACE_PERIOD_MS,
  ACCESS_TOKEN_TTL_MS,
} from "./config";
import { hashPassword, newSecret } from "./utils";

mkdirSync(dirname(DB_PATH), { recursive: true });
try {
  mkdirSync(dirname(DB_PATH) + "/cache", { recursive: true });
} catch {}

export const db = new Database(DB_PATH);
db.run("PRAGMA journal_mode = WAL;");
db.run("PRAGMA foreign_keys = ON;");

// Inisialisasi tabel
db.run(`
  CREATE TABLE IF NOT EXISTS mcp_servers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL DEFAULT '',
    headers TEXT NOT NULL DEFAULT '{}',
    server_type TEXT NOT NULL DEFAULT 'http',
    command TEXT DEFAULT '',
    args TEXT DEFAULT '',
    env_vars TEXT DEFAULT '{}',
    enabled INTEGER NOT NULL DEFAULT 1,
    description TEXT DEFAULT '',
    icon TEXT DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);

db.run(`
  CREATE TABLE IF NOT EXISTS oauth_clients (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    secret TEXT NOT NULL,
    redirect_uris TEXT NOT NULL DEFAULT '',
    enabled INTEGER NOT NULL DEFAULT 1,
    icon TEXT DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);

db.run(`
  CREATE TABLE IF NOT EXISTS auth_codes (
    code TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    redirect_uri TEXT,
    code_challenge TEXT,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
`);

db.run(`
  CREATE TABLE IF NOT EXISTS access_tokens (
    token TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
`);

db.run(`
  CREATE TABLE IF NOT EXISTS refresh_tokens (
    token TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    revoked_at INTEGER,
    created_at INTEGER NOT NULL
  );
`);

db.run(`
  CREATE TABLE IF NOT EXISTS admin_sessions (
    session_id TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
`);

db.run(`
  CREATE TABLE IF NOT EXISTS gateway_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

db.run(`
  CREATE TABLE IF NOT EXISTS activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    req_id TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    method TEXT NOT NULL,
    path TEXT NOT NULL,
    status INTEGER NOT NULL,
    duration_ms REAL NOT NULL,
    client_ip TEXT,
    info TEXT
  );
`);

db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);

db.run(`CREATE INDEX IF NOT EXISTS idx_activity_logs_ts ON activity_logs (timestamp DESC);`);
db.run(`CREATE INDEX IF NOT EXISTS idx_access_tokens_exp ON access_tokens (expires_at);`);
db.run(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_exp ON refresh_tokens (expires_at);`);
db.run(`CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);`);

// ─────────────────────────────────────────────────────────────────────────────
// Migrasi Kolom Otomatis (Idempotent)
// ─────────────────────────────────────────────────────────────────────────────
try { db.run("ALTER TABLE mcp_servers ADD COLUMN server_type TEXT NOT NULL DEFAULT 'http';"); } catch {}
try { db.run("ALTER TABLE mcp_servers ADD COLUMN command TEXT DEFAULT '';"); } catch {}
try { db.run("ALTER TABLE mcp_servers ADD COLUMN args TEXT DEFAULT '';"); } catch {}
try { db.run("ALTER TABLE mcp_servers ADD COLUMN env_vars TEXT DEFAULT '{}';"); } catch {}
try { db.run("ALTER TABLE mcp_servers ADD COLUMN icon TEXT DEFAULT '';"); } catch {}
try { db.run("ALTER TABLE oauth_clients ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;"); } catch {}
try { db.run("ALTER TABLE oauth_clients ADD COLUMN icon TEXT DEFAULT '';"); } catch {}
try { db.run("ALTER TABLE admin_sessions ADD COLUMN user_id TEXT;"); } catch {}
try { db.run("ALTER TABLE access_tokens ADD COLUMN user_id TEXT;"); } catch {}
try { db.run("ALTER TABLE refresh_tokens ADD COLUMN user_id TEXT;"); } catch {}
try { db.run("ALTER TABLE auth_codes ADD COLUMN user_id TEXT;"); } catch {}

// Auto-fix mislabeled dynamic clients from previous releases
try {
  db.run(`
    UPDATE oauth_clients 
    SET name = 'OpenAI / ChatGPT', icon = '/icons/chatgpt.png' 
    WHERE (name = 'Google Gemini' OR id LIKE 'gemini-%') 
      AND (redirect_uris LIKE '%chatgpt%' OR redirect_uris LIKE '%openai%');
  `);
  db.run(`
    UPDATE oauth_clients 
    SET name = 'Anthropic Claude', icon = '/icons/claude.png' 
    WHERE (name = 'Google Gemini' OR id LIKE 'gemini-%') 
      AND (redirect_uris LIKE '%claude%' OR redirect_uris LIKE '%anthropic%');
  `);
} catch {}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface McpServerRow {
  id: string;
  name: string;
  url: string;
  headers: string;
  server_type: "http" | "command";
  command: string;
  args: string;
  env_vars: string;
  enabled: number;
  description: string;
  icon?: string;
  created_at: number;
  updated_at: number;
}

export interface OAuthClientRow {
  id: string;
  name: string;
  secret: string;
  redirect_uris: string;
  enabled: number;
  icon?: string;
  created_at: number;
  updated_at: number;
}

export interface UserRow {
  id: string;
  username: string;
  name: string;
  password_hash: string;
  role: "admin" | "user";
  enabled: number;
  created_at: number;
  updated_at: number;
}

export interface AuthCodeRecord {
  code: string;
  client_id: string;
  user_id: string | null;
  redirect_uri: string | null;
  code_challenge: string | null;
  expires_at: number;
  created_at: number;
}

export interface AccessTokenRecord {
  token: string;
  client_id: string;
  user_id: string | null;
  user_name?: string | null;
  user_username?: string | null;
  expires_at: number;
  created_at: number;
}

export interface RefreshTokenRecord {
  token: string;
  client_id: string;
  user_id: string | null;
  user_name?: string | null;
  user_username?: string | null;
  expires_at: number;
  revoked_at: number | null;
  created_at: number;
}

export interface AdminSessionRecord {
  session_id: string;
  user_id: string | null;
  created_at: number;
  expires_at: number;
}

export interface ActivityLogRow {
  id: number;
  req_id: string;
  timestamp: number;
  method: string;
  path: string;
  status: number;
  duration_ms: number;
  client_ip: string | null;
  info: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Prepared Statements
// ─────────────────────────────────────────────────────────────────────────────

// Settings
const stmtGetSetting = db.query<{ value: string }, [string]>(
  "SELECT value FROM gateway_settings WHERE key = ?",
);
const stmtSetSetting = db.query<void, [string, string]>(
  "INSERT OR REPLACE INTO gateway_settings (key, value) VALUES (?, ?)",
);

export function getSetting(key: string): string | null {
  const row = stmtGetSetting.get(key);
  return row ? row.value : null;
}

export function setSetting(key: string, value: string): void {
  stmtSetSetting.run(key, value);
}

// Admin Sessions
const stmtInsertSession = db.query<void, [string, string | null, number, number]>(
  "INSERT OR REPLACE INTO admin_sessions (session_id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
);
const stmtGetSession = db.query<AdminSessionRecord, [string]>(
  "SELECT session_id, user_id, created_at, expires_at FROM admin_sessions WHERE session_id = ?",
);
const stmtDeleteSession = db.query<void, [string]>(
  "DELETE FROM admin_sessions WHERE session_id = ?",
);
const stmtCleanSessions = db.query<void, [number]>(
  "DELETE FROM admin_sessions WHERE expires_at <= ?",
);

export function createAdminSession(sessionId: string, expiresAt: number, userId?: string | null): void {
  stmtInsertSession.run(sessionId, userId ?? null, Date.now(), expiresAt);
}

export function getAdminSession(sessionId: string): AdminSessionRecord | null {
  const s = stmtGetSession.get(sessionId);
  if (!s) return null;
  if (s.expires_at <= Date.now()) {
    stmtDeleteSession.run(sessionId);
    return null;
  }
  return s;
}

export function deleteAdminSession(sessionId: string): void {
  stmtDeleteSession.run(sessionId);
}

// Users
const stmtGetAllUsers = db.query<UserRow, []>(
  "SELECT * FROM users ORDER BY created_at ASC",
);
const stmtGetUserById = db.query<UserRow, [string]>(
  "SELECT * FROM users WHERE id = ?",
);
const stmtGetUserByUsername = db.query<UserRow, [string]>(
  "SELECT * FROM users WHERE LOWER(username) = LOWER(?)",
);
const stmtInsertUser = db.query<void, [string, string, string, string, string, number, number, number]>(
  "INSERT INTO users (id, username, name, password_hash, role, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
);
const stmtUpdateUser = db.query<void, [string, string, string, string, number, number, string]>(
  "UPDATE users SET username = ?, name = ?, password_hash = ?, role = ?, enabled = ?, updated_at = ? WHERE id = ?",
);
const stmtDeleteUser = db.query<void, [string]>(
  "DELETE FROM users WHERE id = ?",
);
const stmtToggleUser = db.query<void, [number, number, string]>(
  "UPDATE users SET enabled = ?, updated_at = ? WHERE id = ?",
);

export function getAllUsers(): UserRow[] {
  return stmtGetAllUsers.all();
}

export function getUserById(id: string): UserRow | null {
  return stmtGetUserById.get(id) ?? null;
}

export function getUserByUsername(username: string): UserRow | null {
  return stmtGetUserByUsername.get(username.trim()) ?? null;
}

export function countActiveAdmins(): number {
  return (
    db
      .query<{ count: number }, []>(
        "SELECT COUNT(*) as count FROM users WHERE role = 'admin' AND enabled = 1",
      )
      .get()?.count ?? 0
  );
}

export function saveUser(user: {
  id?: string;
  username: string;
  name: string;
  password?: string;
  role?: "admin" | "user";
  enabled?: boolean | number;
}): { id: string } {
  const existing = user.id ? getUserById(user.id) : getUserByUsername(user.username);
  const now = Date.now();
  const id = existing?.id ?? user.id ?? `usr-${newSecret().slice(0, 8)}`;
  const username = user.username.trim().toLowerCase();
  const name = user.name.trim();
  const role = user.role ?? existing?.role ?? "user";
  const enabledNum = user.enabled === false || user.enabled === 0 ? 0 : 1;
  const passwordHash = user.password
    ? hashPassword(user.password)
    : (existing?.password_hash ?? hashPassword("password123"));

  if (existing) {
    stmtUpdateUser.run(
      username,
      name,
      passwordHash,
      role,
      enabledNum,
      now,
      existing.id,
    );
    return { id: existing.id };
  } else {
    stmtInsertUser.run(
      id,
      username,
      name,
      passwordHash,
      role,
      enabledNum,
      now,
      now,
    );
    return { id };
  }
}

export function deleteUser(id: string): { success: boolean; error?: string } {
  const target = getUserById(id);
  if (!target) return { success: false, error: "Pengguna tidak ditemukan" };
  if (target.role === "admin" && target.enabled === 1) {
    if (countActiveAdmins() <= 1) {
      return { success: false, error: "Tidak dapat menghapus admin aktif terakhir" };
    }
  }
  stmtDeleteUser.run(id);
  return { success: true };
}

export function toggleUser(id: string): { success: boolean; enabled?: boolean; error?: string } {
  const target = getUserById(id);
  if (!target) return { success: false, error: "Pengguna tidak ditemukan" };
  if (target.role === "admin" && target.enabled === 1) {
    if (countActiveAdmins() <= 1) {
      return { success: false, error: "Tidak dapat menonaktifkan admin aktif terakhir" };
    }
  }
  const newStatus = target.enabled === 1 ? 0 : 1;
  stmtToggleUser.run(newStatus, Date.now(), id);
  return { success: true, enabled: newStatus === 1 };
}

// MCP Servers
const stmtGetAllMcpServers = db.query<McpServerRow, []>(
  "SELECT * FROM mcp_servers ORDER BY created_at ASC",
);
const stmtGetMcpServer = db.query<McpServerRow, [string]>(
  "SELECT * FROM mcp_servers WHERE id = ?",
);
const stmtInsertMcpServer = db.query<void, [string, string, string, string, string, string, string, string, number, string, string, number, number]>(
  "INSERT INTO mcp_servers (id, name, url, headers, server_type, command, args, env_vars, enabled, description, icon, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
);
const stmtUpdateMcpServer = db.query<void, [string, string, string, string, string, string, string, number, string, string, number, string]>(
  "UPDATE mcp_servers SET name = ?, url = ?, headers = ?, server_type = ?, command = ?, args = ?, env_vars = ?, enabled = ?, description = ?, icon = ?, updated_at = ? WHERE id = ?",
);
const stmtDeleteMcpServer = db.query<void, [string]>(
  "DELETE FROM mcp_servers WHERE id = ?",
);
const stmtToggleMcpServer = db.query<void, [number, number, string]>(
  "UPDATE mcp_servers SET enabled = ?, updated_at = ? WHERE id = ?",
);

export function getAllMcpServers(): McpServerRow[] {
  return stmtGetAllMcpServers.all();
}

export function getMcpServer(id: string): McpServerRow | null {
  return stmtGetMcpServer.get(id) ?? null;
}

export function saveMcpServer(server: {
  id: string;
  name: string;
  url?: string;
  headers?: string;
  server_type?: "http" | "command";
  command?: string;
  args?: string;
  env_vars?: string;
  enabled?: boolean | number;
  description?: string;
  icon?: string;
}): void {
  const existing = getMcpServer(server.id);
  const now = Date.now();
  const enabledNum = server.enabled === false || server.enabled === 0 ? 0 : 1;
  const srvType = server.server_type ?? (server.command ? "command" : "http");
  const urlStr = server.url ?? "";
  const headersStr = server.headers ?? "{}";
  const cmdStr = server.command ?? "";
  const argsStr = server.args ?? "";
  const envStr = server.env_vars ?? "{}";
  const desc = server.description ?? "";
  const iconStr = server.icon !== undefined ? server.icon.trim() : (existing?.icon || "");

  if (existing) {
    stmtUpdateMcpServer.run(
      server.name,
      urlStr,
      headersStr,
      srvType,
      cmdStr,
      argsStr,
      envStr,
      enabledNum,
      desc,
      iconStr,
      now,
      server.id,
    );
  } else {
    stmtInsertMcpServer.run(
      server.id,
      server.name,
      urlStr,
      headersStr,
      srvType,
      cmdStr,
      argsStr,
      envStr,
      enabledNum,
      desc,
      iconStr,
      now,
      now,
    );
  }
}

export function deleteMcpServer(id: string): void {
  stmtDeleteMcpServer.run(id);
}

export function toggleMcpServer(id: string): boolean {
  const s = getMcpServer(id);
  if (!s) return false;
  const newStatus = s.enabled === 1 ? 0 : 1;
  stmtToggleMcpServer.run(newStatus, Date.now(), id);
  return newStatus === 1;
}

// OAuth Clients
const stmtGetAllOAuthClients = db.query<OAuthClientRow, []>(
  "SELECT * FROM oauth_clients ORDER BY created_at ASC",
);
const stmtGetOAuthClient = db.query<OAuthClientRow, [string]>(
  "SELECT * FROM oauth_clients WHERE id = ?",
);
const stmtInsertOAuthClient = db.query<void, [string, string, string, string, number, string, number, number]>(
  "INSERT INTO oauth_clients (id, name, secret, redirect_uris, enabled, icon, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
);
const stmtUpdateOAuthClient = db.query<void, [string, string, string, number, string, number, string]>(
  "UPDATE oauth_clients SET name = ?, secret = ?, redirect_uris = ?, enabled = ?, icon = ?, updated_at = ? WHERE id = ?",
);
const stmtDeleteOAuthClient = db.query<void, [string]>(
  "DELETE FROM oauth_clients WHERE id = ?",
);

export function getAllOAuthClients(): OAuthClientRow[] {
  return stmtGetAllOAuthClients.all();
}

export function getOAuthClient(id: string): OAuthClientRow | null {
  return stmtGetOAuthClient.get(id) ?? null;
}

export function saveOAuthClient(client: {
  id: string;
  name: string;
  secret: string;
  redirect_uris?: string;
  enabled?: boolean | number;
  icon?: string;
}): void {
  const existing = getOAuthClient(client.id);
  const now = Date.now();
  const redirectUris = client.redirect_uris ?? "";
  const enabledNum = client.enabled === false || client.enabled === 0 ? 0 : 1;
  const iconStr = client.icon !== undefined ? client.icon.trim() : (existing?.icon || "");

  if (existing) {
    stmtUpdateOAuthClient.run(client.name, client.secret, redirectUris, enabledNum, iconStr, now, client.id);
  } else {
    stmtInsertOAuthClient.run(client.id, client.name, client.secret, redirectUris, enabledNum, iconStr, now, now);
  }
}

export function deleteOAuthClient(id: string): void {
  stmtDeleteOAuthClient.run(id);
}

export function toggleOAuthClient(id: string): boolean {
  const client = getOAuthClient(id);
  if (!client) return false;
  const newStatus = client.enabled === 1 ? 0 : 1;
  db.run("UPDATE oauth_clients SET enabled = ?, updated_at = ? WHERE id = ?", [newStatus, Date.now(), id]);
  return newStatus === 1;
}

export function getClientTokenStats(): Record<string, { access: number; refresh: number }> {
  const now = Date.now();
  const accessRows = db.query<{ client_id: string; count: number }, [number]>(
    "SELECT client_id, COUNT(*) as count FROM access_tokens WHERE expires_at > ? GROUP BY client_id",
  ).all(now);
  const refreshRows = db.query<{ client_id: string; count: number }, [number]>(
    "SELECT client_id, COUNT(*) as count FROM refresh_tokens WHERE expires_at > ? AND revoked_at IS NULL GROUP BY client_id",
  ).all(now);

  const stats: Record<string, { access: number; refresh: number }> = {};
  for (const r of accessRows) {
    stats[r.client_id] = { access: r.count, refresh: 0 };
  }
  for (const r of refreshRows) {
    if (!stats[r.client_id]) stats[r.client_id] = { access: 0, refresh: 0 };
    stats[r.client_id].refresh = r.count;
  }
  return stats;
}

// OAuth Codes & Tokens
export const stmtInsertAuthCode = db.query<void, [string, string, string | null, string | null, string | null, number, number]>(
  "INSERT OR REPLACE INTO auth_codes (code, client_id, user_id, redirect_uri, code_challenge, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
);
export const stmtGetAuthCode = db.query<AuthCodeRecord, [string]>(
  "SELECT code, client_id, user_id, redirect_uri, code_challenge, expires_at, created_at FROM auth_codes WHERE code = ?",
);
export const stmtDeleteAuthCode = db.query<void, [string]>(
  "DELETE FROM auth_codes WHERE code = ?",
);

export const stmtInsertAccessToken = db.query<void, [string, string, string | null, number, number]>(
  "INSERT OR REPLACE INTO access_tokens (token, client_id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
);
export const stmtGetAccessToken = db.query<AccessTokenRecord, [string]>(
  "SELECT token, client_id, user_id, expires_at, created_at FROM access_tokens WHERE token = ?",
);
export const stmtDeleteAccessToken = db.query<void, [string]>(
  "DELETE FROM access_tokens WHERE token = ?",
);

export const stmtInsertRefreshToken = db.query<void, [string, string, string | null, number, number]>(
  "INSERT OR REPLACE INTO refresh_tokens (token, client_id, user_id, expires_at, revoked_at, created_at) VALUES (?, ?, ?, ?, NULL, ?)",
);
export const stmtGetRefreshToken = db.query<RefreshTokenRecord, [string]>(
  "SELECT token, client_id, user_id, expires_at, revoked_at, created_at FROM refresh_tokens WHERE token = ?",
);
export const stmtRevokeRefreshToken = db.query<void, [number, string]>(
  "UPDATE refresh_tokens SET revoked_at = ? WHERE token = ?",
);
export const stmtDeleteRefreshToken = db.query<void, [string]>(
  "DELETE FROM refresh_tokens WHERE token = ?",
);

export function getAllAccessTokens(clientId?: string): AccessTokenRecord[] {
  const query = clientId
    ? `SELECT a.token, a.client_id, a.user_id, a.expires_at, a.created_at, u.username as user_username, u.name as user_name
       FROM access_tokens a
       LEFT JOIN users u ON a.user_id = u.id
       WHERE a.client_id = ?
       ORDER BY a.expires_at DESC LIMIT 100`
    : `SELECT a.token, a.client_id, a.user_id, a.expires_at, a.created_at, u.username as user_username, u.name as user_name
       FROM access_tokens a
       LEFT JOIN users u ON a.user_id = u.id
       ORDER BY a.expires_at DESC LIMIT 100`;
  return clientId
    ? db.query<AccessTokenRecord, [string]>(query).all(clientId)
    : db.query<AccessTokenRecord, []>(query).all();
}

export function createManualAccessToken(
  clientId: string,
  ttlMs: number = ACCESS_TOKEN_TTL_MS,
  userId?: string | null,
): { token: string; expiresAt: number; userId: string | null } {
  const token = newSecret();
  const now = Date.now();
  const expiresAt = now + ttlMs;
  stmtInsertAccessToken.run(token, clientId, userId ?? null, expiresAt, now);
  return { token, expiresAt, userId: userId ?? null };
}

export function getAllRefreshTokens(clientId?: string): RefreshTokenRecord[] {
  const query = clientId
    ? `SELECT r.token, r.client_id, r.user_id, r.expires_at, r.revoked_at, r.created_at, u.username as user_username, u.name as user_name
       FROM refresh_tokens r
       LEFT JOIN users u ON r.user_id = u.id
       WHERE r.client_id = ?
       ORDER BY r.expires_at DESC LIMIT 100`
    : `SELECT r.token, r.client_id, r.user_id, r.expires_at, r.revoked_at, r.created_at, u.username as user_username, u.name as user_name
       FROM refresh_tokens r
       LEFT JOIN users u ON r.user_id = u.id
       ORDER BY r.expires_at DESC LIMIT 100`;
  return clientId
    ? db.query<RefreshTokenRecord, [string]>(query).all(clientId)
    : db.query<RefreshTokenRecord, []>(query).all();
}

export function revokeToken(tokenStr: string): boolean {
  const at = stmtGetAccessToken.get(tokenStr);
  if (at) {
    stmtDeleteAccessToken.run(tokenStr);
    return true;
  }
  const rt = stmtGetRefreshToken.get(tokenStr);
  if (rt) {
    stmtRevokeRefreshToken.run(Date.now(), tokenStr);
    return true;
  }
  return false;
}

export function revokeAllTokensForClient(clientId: string): void {
  db.run("DELETE FROM access_tokens WHERE client_id = ?", [clientId]);
  db.run("UPDATE refresh_tokens SET revoked_at = ? WHERE client_id = ?", [Date.now(), clientId]);
}

// Activity Logs
const stmtInsertActivityLog = db.query<void, [string, number, string, string, number, number, string | null, string | null]>(
  "INSERT INTO activity_logs (req_id, timestamp, method, path, status, duration_ms, client_ip, info) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
);
const stmtClearActivityLogs = db.query<void, []>("DELETE FROM activity_logs;");

export function addActivityLog(
  reqId: string,
  method: string,
  path: string,
  status: number,
  durationMs: number,
  clientIp?: string | null,
  info?: string | null,
): void {
  try {
    stmtInsertActivityLog.run(
      reqId,
      Date.now(),
      method,
      path,
      status,
      durationMs,
      clientIp ?? null,
      info ?? null,
    );
  } catch (err) {
    console.error("[db] error saat mencatat log:", (err as Error).message);
  }
}

export function getActivityLogs(limit = 100, search?: string, statusFilter?: string): ActivityLogRow[] {
  let query = "SELECT * FROM activity_logs";
  const params: (string | number)[] = [];
  const conditions: string[] = [];

  if (search) {
    conditions.push("(path LIKE ? OR req_id LIKE ? OR info LIKE ?)");
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  if (statusFilter === "error") {
    conditions.push("status >= 400");
  } else if (statusFilter === "mcp") {
    conditions.push("path LIKE '/mcp/%'");
  } else if (statusFilter === "oauth") {
    conditions.push("path LIKE '/oauth/%'");
  }

  if (conditions.length > 0) {
    query += " WHERE " + conditions.join(" AND ");
  }

  query += " ORDER BY id DESC LIMIT ?";
  params.push(limit);

  return db.query<ActivityLogRow, (string | number)[]>(query).all(...params);
}

export function clearActivityLogs(): void {
  stmtClearActivityLogs.run();
}

// Stats
export function getStats() {
  const now = Date.now();
  const totalServers = db.query<{ count: number }, []>("SELECT COUNT(*) as count FROM mcp_servers").get()?.count ?? 0;
  const activeServers = db.query<{ count: number }, []>("SELECT COUNT(*) as count FROM mcp_servers WHERE enabled = 1").get()?.count ?? 0;
  const totalClients = db.query<{ count: number }, []>("SELECT COUNT(*) as count FROM oauth_clients").get()?.count ?? 0;
  const activeClients = db.query<{ count: number }, []>("SELECT COUNT(*) as count FROM oauth_clients WHERE enabled = 1").get()?.count ?? 0;
  const activeTokens = db.query<{ count: number }, [number]>("SELECT COUNT(*) as count FROM access_tokens WHERE expires_at > ?").get(now)?.count ?? 0;
  const activeRefresh = db.query<{ count: number }, [number]>("SELECT COUNT(*) as count FROM refresh_tokens WHERE expires_at > ? AND revoked_at IS NULL").get(now)?.count ?? 0;
  const totalUsers = db.query<{ count: number }, []>("SELECT COUNT(*) as count FROM users").get()?.count ?? 0;
  const activeUsers = db.query<{ count: number }, []>("SELECT COUNT(*) as count FROM users WHERE enabled = 1").get()?.count ?? 0;
  const totalLogs = db.query<{ count: number }, []>("SELECT COUNT(*) as count FROM activity_logs").get()?.count ?? 0;

  return {
    servers: { total: totalServers, active: activeServers },
    clients: { total: totalClients, active: activeClients },
    tokens: { access: activeTokens, refresh: activeRefresh },
    users: { total: totalUsers, active: activeUsers },
    logs: totalLogs,
  };
}

// Cleanup interval
setInterval(() => {
  const now = Date.now();
  const graceCutoff = now - REFRESH_GRACE_PERIOD_MS;
  try {
    db.run("DELETE FROM auth_codes WHERE expires_at <= ?", [now]);
    db.run("DELETE FROM access_tokens WHERE expires_at <= ?", [now]);
    db.run(
      "DELETE FROM refresh_tokens WHERE expires_at <= ? OR (revoked_at IS NOT NULL AND revoked_at <= ?)",
      [now, graceCutoff],
    );
    stmtCleanSessions.run(now);

    db.run(`
      DELETE FROM activity_logs WHERE id NOT IN (
        SELECT id FROM activity_logs ORDER BY id DESC LIMIT 2000
      );
    `);
  } catch (err) {
    console.error("[db] error saat cleanup token kedaluwarsa:", (err as Error).message);
  }
}, 60_000).unref();

// ─────────────────────────────────────────────────────────────────────────────
// Seeding & Inisialisasi Otomatis
// ─────────────────────────────────────────────────────────────────────────────

export function seedInitialData(): { defaultAdminCreated: boolean; initialPassword?: string } {
  let defaultAdminCreated = false;
  let initialPassword: string | undefined = undefined;

  // 1. Admin Password & Default Admin User
  const pass = ADMIN_PASSWORD || "admin123";
  const passHash = hashPassword(pass);
  const existingPassHash = getSetting("admin_password_hash");

  if (!existingPassHash) {
    setSetting("admin_password_hash", passHash);
    if (!ADMIN_PASSWORD) {
      defaultAdminCreated = true;
      initialPassword = pass;
    }
  } else if (ADMIN_PASSWORD) {
    setSetting("admin_password_hash", passHash);
  }

  // Seed user table if empty
  const users = getAllUsers();
  if (users.length === 0) {
    saveUser({
      id: "usr-admin",
      username: "admin",
      name: "Administrator",
      password: ADMIN_PASSWORD || (existingPassHash ? undefined : "admin123"),
      role: "admin",
      enabled: 1,
    });
    if (existingPassHash && !ADMIN_PASSWORD) {
      db.run("UPDATE users SET password_hash = ? WHERE id = 'usr-admin'", [existingPassHash]);
    }
    console.log(`[db] Pengguna admin default berhasil diinisialisasi (username: admin)`);
  } else if (ADMIN_PASSWORD) {
    const adminUser = getUserByUsername("admin");
    if (adminUser) {
      db.run("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?", [passHash, Date.now(), adminUser.id]);
    }
  }

  // 2. OAuth Clients
  const clients = getAllOAuthClients();
  if (clients.length === 0) {
    if (ENV_CLIENT_ID && ENV_CLIENT_SECRET) {
      saveOAuthClient({
        id: ENV_CLIENT_ID,
        name: "Universal AI Client",
        secret: ENV_CLIENT_SECRET,
        redirect_uris: "https://google.com,https://oauth-redirect.googleusercontent.com,https://chatgpt.com,http://localhost",
        enabled: 1,
      });
      console.log(`[db] Memasukkan OAuth client dari env: ${ENV_CLIENT_ID}`);
    } else {
      const generatedSecret = newSecret();
      saveOAuthClient({
        id: "universal-ai",
        name: "Universal AI Client (Default)",
        secret: generatedSecret,
        redirect_uris: "https://google.com,https://oauth-redirect.googleusercontent.com,https://chatgpt.com,http://localhost",
        enabled: 1,
      });
      console.log(`[db] Membuat default client: universal-ai (secret: ${generatedSecret})`);
    }
  } else if (ENV_CLIENT_ID && ENV_CLIENT_SECRET) {
    const existing = getOAuthClient(ENV_CLIENT_ID);
    if (!existing) {
      saveOAuthClient({
        id: ENV_CLIENT_ID,
        name: "Universal AI Client (Env)",
        secret: ENV_CLIENT_SECRET,
        redirect_uris: "https://google.com,https://oauth-redirect.googleusercontent.com,https://chatgpt.com,http://localhost",
        enabled: 1,
      });
      console.log(`[db] Memasukkan OAuth client tambahan dari env: ${ENV_CLIENT_ID}`);
    }
  }

  // 3. MCP Servers
  const servers = getAllMcpServers();
  if (servers.length === 0 && ENV_MCP_SERVERS) {
    try {
      const parsed = JSON.parse(ENV_MCP_SERVERS);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        for (const [name, entry] of Object.entries(parsed)) {
          const spec: { url?: unknown; headers?: unknown } =
            entry && typeof entry === "object" ? entry : { url: entry };
          const urlStr = String(spec.url ?? "");
          const headersStr = spec.headers ? JSON.stringify(spec.headers) : "{}";
          saveMcpServer({
            id: name,
            name: `${name.toUpperCase()} Server`,
            server_type: "http",
            url: urlStr,
            headers: headersStr,
            enabled: 1,
            description: "Diimpor dari MCP_SERVERS",
          });
        }
        console.log(`[db] Diimpor ${Object.keys(parsed).length} MCP server dari env`);
      }
    } catch (err) {
      console.error("[db] Gagal memparsing MCP_SERVERS dari env:", (err as Error).message);
    }
  }

  return { defaultAdminCreated, initialPassword };
}
