// Shapes of the JSON responses from /api/admin/* (see src/admin-api.ts).

export interface McpServer {
  id: string;
  name: string;
  server_type: "http" | "command";
  url: string;
  headers: string;
  command: string;
  args: string;
  env_vars: string;
  /** JSON text of the variables a connection may override (see src/env-policy.ts). */
  overridable_env?: string;
  icon: string;
  description: string;
  enabled: boolean;
}

export interface OAuthClient {
  id: string;
  name: string;
  secret: string;
  redirect_uris: string;
  icon: string;
  enabled: boolean;
  active_tokens?: { access?: number; refresh?: number };
}

export interface User {
  id: string;
  username: string;
  name: string;
  role: "admin" | "user";
  enabled: boolean;
  created_at: number;
  isSelf?: boolean;
}

export interface TokenRow {
  token: string;
  client_id: string;
  created_at: number;
  expires_at: number;
  revoked_at?: number | null;
  user_name?: string | null;
  user_username?: string | null;
}

export interface LogRow {
  timestamp: number;
  method: string;
  path: string;
  status: number;
  duration_ms: number;
  info?: string | null;
}

export interface Me {
  user: { id: string; username: string; name: string; role: "admin" | "user" };
  isDefaultPassword: boolean;
  origin: string;
  dbPath: string;
}

export interface Stats {
  stats: {
    servers: { active: number; total: number };
    clients: { active: number; total: number };
    tokens: { access: number; refresh: number };
    users?: { active: number; total: number };
  };
  system: {
    uptime: number;
    memory: { rss: number; heapUsed: number };
    bunVersion: string;
    runtimes?: { uv?: boolean; go?: boolean; python?: boolean; npx?: boolean };
    dbPath: string;
  };
}

export interface TestResult {
  ok: boolean;
  status?: string;
  latencyMs: number;
  error?: string;
  serverInfo?: { name?: string };
}
