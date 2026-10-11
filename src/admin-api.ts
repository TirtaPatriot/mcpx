import { Elysia } from "elysia";
import {
  getAllMcpServers,
  getMcpServer,
  saveMcpServer,
  deleteMcpServer,
  toggleMcpServer,
  getAllOAuthClients,
  getOAuthClient,
  saveOAuthClient,
  deleteOAuthClient,
  toggleOAuthClient,
  getClientTokenStats,
  getAllAccessTokens,
  createManualAccessToken,
  getAllRefreshTokens,
  revokeToken,
  revokeAllTokensForClient,
  getActivityLogs,
  clearActivityLogs,
  getStats,
  getSetting,
  getAllUsers,
  getUserById,
  getUserByUsername,
  saveUser,
  deleteUser,
  toggleUser,
  countActiveAdmins,
  type UserRow,
} from "./db";
import {
  checkAdminPassword,
  updateAdminPassword,
  authenticateUser,
  createAdminLoginSession,
  deleteAdminSession,
  getSessionUser,
  makeSessionCookie,
  clearSessionCookie,
  parseCookie,
} from "./auth";
import { reloadMcpCache, testMcpServerConnection } from "./proxy";
import { testStdioCommand } from "./stdio-manager";
import { newSecret, hashPassword, verifyPassword } from "./utils";
import { ADMIN_SESSION_TTL_MS, DB_PATH } from "./config";

const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });

export const adminApi = new Elysia({ prefix: "/api/admin" })
  // ── Auth Endpoints (Publik untuk Admin) ──────────────────────────────────
  .post("/login", async ({ body }) => {
    const data = body as { username?: string; password?: string };
    const username = data?.username?.trim() || "admin";
    const password = data?.password ?? "";

    const user = authenticateUser(username, password);
    if (!user) {
      const existingUser = getUserByUsername(username);
      if (existingUser && existingUser.enabled !== 1) {
        return json({ ok: false, error: "Akun ini telah dinonaktifkan oleh administrator" }, 403);
      }
      return json({ ok: false, error: "Username atau password salah" }, 401);
    }

    const { sessionId } = createAdminLoginSession(user.id);
    const cookieHeader = makeSessionCookie(sessionId, ADMIN_SESSION_TTL_MS / 1000);

    return json(
      {
        ok: true,
        message: "Login berhasil",
        token: sessionId,
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
          role: user.role,
        },
      },
      200,
      { "Set-Cookie": cookieHeader },
    );
  })

  .post("/logout", ({ request }) => {
    const cookies = parseCookie(request.headers.get("cookie"));
    const sessionId = cookies["admin_session"];
    if (sessionId) {
      deleteAdminSession(sessionId);
    }
    return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie() });
  })

  // ── Protected Admin Middleware ──────────────────────────────────────────
  .derive(({ request, set }) => {
    const path = new URL(request.url).pathname;
    if (path === "/api/admin/login") return { currentUser: null as UserRow | null, isAdmin: false };

    const currentUser = getSessionUser(request);
    if (!currentUser) {
      set.status = 401;
      throw new Error("UNAUTHORIZED_ADMIN");
    }
    return {
      currentUser,
      isAdmin: currentUser.role === "admin",
    };
  })

  .onError(({ error, set }) => {
    if (error && "message" in error && error.message === "UNAUTHORIZED_ADMIN") {
      set.status = 401;
      return json({ ok: false, error: "Sesi tidak valid atau telah kedaluwarsa" }, 401);
    }
  })

  // ── Profil & Keamanan ────────────────────────────────────────────────────
  .get("/me", ({ currentUser }) => {
    if (!currentUser) return json({ ok: false }, 401);
    const defaultHash = hashPassword("admin123");
    const currentHash = getSetting("admin_password_hash");
    return json({
      ok: true,
      authenticated: true,
      user: {
        id: currentUser.id,
        username: currentUser.username,
        name: currentUser.name,
        role: currentUser.role,
      },
      isDefaultPassword: currentHash === defaultHash,
      dbPath: DB_PATH,
    });
  })

  .post("/change-password", ({ currentUser, body }) => {
    if (!currentUser) return json({ ok: false }, 401);
    const data = body as { oldPassword?: string; newPassword?: string };
    if (!data?.oldPassword || !data?.newPassword) {
      return json({ ok: false, error: "Password lama dan baru wajib diisi" }, 400);
    }

    const userFromDb = getUserById(currentUser.id);
    const validOld = userFromDb
      ? verifyPassword(data.oldPassword, userFromDb.password_hash)
      : checkAdminPassword(data.oldPassword);

    if (!validOld) {
      return json({ ok: false, error: "Password lama salah" }, 400);
    }
    if (data.newPassword.length < 4) {
      return json({ ok: false, error: "Password baru minimal 4 karakter" }, 400);
    }

    if (userFromDb) {
      saveUser({
        ...userFromDb,
        password: data.newPassword,
      });
    }
    if (currentUser.role === "admin" && currentUser.username === "admin") {
      updateAdminPassword(data.newPassword);
    }
    return json({ ok: true, message: "Password berhasil diperbarui" });
  })

  // ── Dashboard Metrics ───────────────────────────────────────────────────
  .get("/stats", () => {
    const stats = getStats();
    const mem = process.memoryUsage();
    return json({
      ok: true,
      stats,
      system: {
        uptime: Math.round(process.uptime()),
        memory: {
          rss: Math.round(mem.rss / 1024 / 1024),
          heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
        },
        bunVersion: Bun.version,
        dbPath: DB_PATH,
      },
    });
  })

  // ── MCP Servers Management ──────────────────────────────────────────────
  .get("/servers", () => {
    const servers = getAllMcpServers().map((s) => ({
      ...s,
      enabled: s.enabled === 1,
    }));
    return json({ ok: true, servers });
  })

  .post("/servers", ({ body }) => {
    const data = body as {
      id?: string;
      name?: string;
      server_type?: "http" | "command";
      url?: string;
      headers?: string;
      command?: string;
      args?: string;
      env_vars?: string;
      enabled?: boolean;
      description?: string;
      icon?: string;
    };

    if (!data.id || !data.name) {
      return json({ ok: false, error: "ID dan Nama server wajib diisi" }, 400);
    }

    const cleanId = data.id.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
    if (!cleanId) return json({ ok: false, error: "ID server tidak valid" }, 400);

    const serverType = data.server_type ?? (data.command ? "command" : "http");

    if (serverType === "http") {
      if (!data.url) return json({ ok: false, error: "URL wajib diisi untuk server HTTP" }, 400);
      try {
        const parsedUrl = new URL(data.url);
        if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
          return json({ ok: false, error: "URL harus berprotokol http:// atau https://" }, 400);
        }
      } catch {
        return json({ ok: false, error: "URL tidak valid" }, 400);
      }
    } else {
      if (!data.command || !data.command.trim()) {
        return json({ ok: false, error: "Perintah (command) wajib diisi untuk server command/NPM" }, 400);
      }
    }

    if (data.headers) {
      try {
        JSON.parse(data.headers);
      } catch {
        return json({ ok: false, error: "Headers harus berupa JSON valid" }, 400);
      }
    }

    if (data.env_vars) {
      try {
        JSON.parse(data.env_vars);
      } catch {
        return json({ ok: false, error: "Environment variables harus berupa JSON valid" }, 400);
      }
    }

    saveMcpServer({
      id: cleanId,
      name: data.name.trim(),
      server_type: serverType,
      url: data.url?.trim() ?? "",
      headers: data.headers ?? "{}",
      command: data.command?.trim() ?? "",
      args: data.args?.trim() ?? "",
      env_vars: data.env_vars ?? "{}",
      enabled: data.enabled ?? true,
      description: data.description?.trim(),
      icon: data.icon?.trim(),
    });

    reloadMcpCache();
    return json({ ok: true, message: `Server MCP "${cleanId}" berhasil disimpan` });
  })

  .put("/servers/:id", ({ params, body }) => {
    const { id } = params;
    const existing = getMcpServer(id);
    if (!existing) return json({ ok: false, error: "Server tidak ditemukan" }, 404);

    const data = body as {
      name?: string;
      server_type?: "http" | "command";
      url?: string;
      headers?: string;
      command?: string;
      args?: string;
      env_vars?: string;
      enabled?: boolean;
      description?: string;
      icon?: string;
    };

    const serverType = data.server_type ?? existing.server_type ?? "http";

    if (serverType === "http" && data.url) {
      try {
        const parsedUrl = new URL(data.url);
        if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
          return json({ ok: false, error: "URL harus http/https" }, 400);
        }
      } catch {
        return json({ ok: false, error: "URL tidak valid" }, 400);
      }
    }

    saveMcpServer({
      id,
      name: data.name?.trim() ?? existing.name,
      server_type: serverType,
      url: data.url !== undefined ? data.url.trim() : existing.url,
      headers: data.headers ?? existing.headers,
      command: data.command !== undefined ? data.command.trim() : existing.command,
      args: data.args !== undefined ? data.args.trim() : existing.args,
      env_vars: data.env_vars ?? existing.env_vars,
      enabled: data.enabled !== undefined ? data.enabled : existing.enabled === 1,
      description: data.description !== undefined ? data.description.trim() : existing.description,
      icon: data.icon !== undefined ? data.icon.trim() : existing.icon,
    });

    reloadMcpCache();
    return json({ ok: true, message: `Server "${id}" diperbarui` });
  })

  .delete("/servers/:id", ({ params }) => {
    deleteMcpServer(params.id);
    reloadMcpCache();
    return json({ ok: true, message: `Server "${params.id}" berhasil dihapus` });
  })

  .post("/servers/:id/toggle", ({ params }) => {
    const newStatus = toggleMcpServer(params.id);
    reloadMcpCache();
    return json({ ok: true, enabled: newStatus });
  })

  .post("/servers/:id/test", async ({ params }) => {
    const server = getMcpServer(params.id);
    if (!server) return json({ ok: false, error: "Server tidak ditemukan" }, 404);

    if (server.server_type === "command") {
      const result = await testStdioCommand(server.command || "bunx", server.args || "", server.env_vars || "{}");
      return json({ ok: true, result });
    } else {
      const result = await testMcpServerConnection(server.url, server.headers);
      return json({ ok: true, result });
    }
  })

  .post("/test-connection", async ({ body }) => {
    const data = body as {
      server_type?: "http" | "command";
      url?: string;
      headers?: string;
      command?: string;
      args?: string;
      env_vars?: string;
    };

    if (data.server_type === "command" || data.command) {
      const cmd = data.command?.trim() || "bunx";
      const result = await testStdioCommand(cmd, data.args ?? "", data.env_vars ?? "{}");
      return json({ ok: true, result });
    }

    if (!data?.url) return json({ ok: false, error: "URL wajib diisi" }, 400);
    const result = await testMcpServerConnection(data.url, data.headers ?? "{}");
    return json({ ok: true, result });
  })

  // ── OAuth Clients Management ────────────────────────────────────────────
  .get("/clients", () => {
    const clients = getAllOAuthClients();
    const tokenStats = getClientTokenStats();

    const clientsWithStats = clients.map((c) => ({
      ...c,
      enabled: c.enabled === 1,
      active_tokens: tokenStats[c.id] ?? { access: 0, refresh: 0 },
    }));

    return json({ ok: true, clients: clientsWithStats });
  })

  .post("/clients", ({ body }) => {
    const data = body as {
      id?: string;
      name?: string;
      secret?: string;
      redirect_uris?: string;
      enabled?: boolean;
      icon?: string;
    };

    if (!data.name) return json({ ok: false, error: "Nama klien wajib diisi" }, 400);

    const id = data.id?.trim() || `client-${newSecret().slice(0, 8)}`;
    const secret = data.secret?.trim() || newSecret();

    saveOAuthClient({
      id,
      name: data.name.trim(),
      secret,
      redirect_uris: data.redirect_uris?.trim() ?? "",
      enabled: data.enabled ?? true,
      icon: data.icon?.trim(),
    });

    return json({
      ok: true,
      message: `Klien OAuth "${id}" berhasil dibuat`,
      client: { id, secret },
    });
  })

  .put("/clients/:id", ({ params, body }) => {
    const existing = getOAuthClient(params.id);
    if (!existing) return json({ ok: false, error: "Klien tidak ditemukan" }, 404);

    const data = body as {
      name?: string;
      secret?: string;
      redirect_uris?: string;
      enabled?: boolean;
      icon?: string;
    };

    saveOAuthClient({
      id: params.id,
      name: data.name?.trim() ?? existing.name,
      secret: data.secret?.trim() ?? existing.secret,
      redirect_uris: data.redirect_uris !== undefined ? data.redirect_uris.trim() : existing.redirect_uris,
      enabled: data.enabled !== undefined ? data.enabled : existing.enabled === 1,
      icon: data.icon !== undefined ? data.icon.trim() : existing.icon,
    });

    return json({ ok: true, message: `Klien "${params.id}" diperbarui` });
  })

  .post("/clients/:id/toggle", ({ params }) => {
    const newStatus = toggleOAuthClient(params.id);
    return json({ ok: true, enabled: newStatus });
  })

  .delete("/clients/:id", ({ params }) => {
    deleteOAuthClient(params.id);
    revokeAllTokensForClient(params.id);
    return json({ ok: true, message: `Klien "${params.id}" dan seluruh tokennya dihapus` });
  })

  .delete("/clients/:id/tokens", ({ params }) => {
    revokeAllTokensForClient(params.id);
    return json({ ok: true, message: `Seluruh token sesi untuk klien "${params.id}" berhasil dicabut` });
  })

  .post("/clients/:id/regenerate-secret", ({ params }) => {
    const existing = getOAuthClient(params.id);
    if (!existing) return json({ ok: false, error: "Klien tidak ditemukan" }, 404);

    const newSec = newSecret();
    saveOAuthClient({
      ...existing,
      secret: newSec,
    });

    return json({ ok: true, secret: newSec });
  })

  // ── User Management ─────────────────────────────────────────────────────
  .get("/users", ({ currentUser }) => {
    const users = getAllUsers().map((u) => ({
      id: u.id,
      username: u.username,
      name: u.name,
      role: u.role,
      enabled: u.enabled === 1,
      created_at: u.created_at,
      updated_at: u.updated_at,
      isSelf: u.id === currentUser?.id,
    }));
    return json({ ok: true, users });
  })

  .post("/users", ({ currentUser, body }) => {
    if (currentUser?.role !== "admin") {
      return json({ ok: false, error: "Hanya administrator yang dapat menambah pengguna" }, 403);
    }

    const data = body as {
      username?: string;
      name?: string;
      password?: string;
      role?: "admin" | "user";
      enabled?: boolean;
    };

    if (!data.username || !data.name || !data.password) {
      return json({ ok: false, error: "Username, nama lengkap, dan password wajib diisi" }, 400);
    }

    const cleanUsername = data.username.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, "");
    if (!cleanUsername || cleanUsername.length < 3) {
      return json({ ok: false, error: "Username minimal 3 karakter (huruf, angka, _, -, .)" }, 400);
    }

    if (data.password.length < 4) {
      return json({ ok: false, error: "Password minimal 4 karakter" }, 400);
    }

    const existing = getUserByUsername(cleanUsername);
    if (existing) {
      return json({ ok: false, error: `Username "${cleanUsername}" sudah digunakan` }, 400);
    }

    const role = data.role === "admin" ? "admin" : "user";
    const res = saveUser({
      username: cleanUsername,
      name: data.name.trim(),
      password: data.password,
      role,
      enabled: data.enabled ?? true,
    });

    return json({
      ok: true,
      message: `Pengguna "${cleanUsername}" berhasil dibuat`,
      userId: res.id,
    });
  })

  .put("/users/:id", ({ currentUser, params, body }) => {
    if (currentUser?.role !== "admin" && currentUser?.id !== params.id) {
      return json({ ok: false, error: "Tidak memiliki hak akses untuk mengubah pengguna ini" }, 403);
    }

    const targetUser = getUserById(params.id);
    if (!targetUser) return json({ ok: false, error: "Pengguna tidak ditemukan" }, 404);

    const data = body as {
      name?: string;
      password?: string;
      role?: "admin" | "user";
      enabled?: boolean;
    };

    let role = targetUser.role;
    let enabled = targetUser.enabled === 1;

    if (currentUser?.role === "admin") {
      if (data.role !== undefined) {
        if (targetUser.role === "admin" && data.role !== "admin" && countActiveAdmins() <= 1 && targetUser.enabled === 1) {
          return json({ ok: false, error: "Tidak dapat mengubah peran admin aktif terakhir" }, 400);
        }
        role = data.role === "admin" ? "admin" : "user";
      }
      if (data.enabled !== undefined) {
        if (targetUser.role === "admin" && !data.enabled && countActiveAdmins() <= 1 && targetUser.enabled === 1) {
          return json({ ok: false, error: "Tidak dapat menonaktifkan admin aktif terakhir" }, 400);
        }
        enabled = !!data.enabled;
      }
    }

    if (data.password && data.password.length < 4) {
      return json({ ok: false, error: "Password baru minimal 4 karakter" }, 400);
    }

    saveUser({
      id: targetUser.id,
      username: targetUser.username,
      name: data.name ? data.name.trim() : targetUser.name,
      password: data.password ? data.password : undefined,
      role,
      enabled,
    });

    return json({ ok: true, message: `Data pengguna "${targetUser.username}" berhasil diperbarui` });
  })

  .post("/users/:id/toggle", ({ currentUser, params }) => {
    if (currentUser?.role !== "admin") {
      return json({ ok: false, error: "Hanya administrator yang dapat mengubah status pengguna" }, 403);
    }
    if (currentUser.id === params.id) {
      return json({ ok: false, error: "Tidak dapat menonaktifkan akun sendiri" }, 400);
    }

    const result = toggleUser(params.id);
    if (!result.success) {
      return json({ ok: false, error: result.error }, 400);
    }
    return json({ ok: true, enabled: result.enabled });
  })

  .delete("/users/:id", ({ currentUser, params }) => {
    if (currentUser?.role !== "admin") {
      return json({ ok: false, error: "Hanya administrator yang dapat menghapus pengguna" }, 403);
    }
    if (currentUser.id === params.id) {
      return json({ ok: false, error: "Tidak dapat menghapus akun sendiri yang sedang aktif" }, 400);
    }

    const result = deleteUser(params.id);
    if (!result.success) {
      return json({ ok: false, error: result.error }, 400);
    }
    return json({ ok: true, message: "Pengguna berhasil dihapus" });
  })

  // ── Token Management ────────────────────────────────────────────────────
  .get("/tokens", ({ query }) => {
    const clientId = query.clientId ? String(query.clientId) : undefined;
    const accessTokens = getAllAccessTokens(clientId);
    const refreshTokens = getAllRefreshTokens(clientId);
    return json({
      ok: true,
      accessTokens,
      refreshTokens,
    });
  })

  .post("/tokens/generate", ({ currentUser, body }) => {
    const data = body as { clientId?: string; ttlDays?: number; userId?: string };
    const clientId = data.clientId?.trim();
    if (!clientId) return json({ ok: false, error: "Client ID wajib dipilih" }, 400);

    const client = getOAuthClient(clientId);
    if (!client) return json({ ok: false, error: "Client tidak ditemukan" }, 404);
    if (client.enabled !== 1) return json({ ok: false, error: "Client sedang dinonaktifkan" }, 400);

    const targetUserId = currentUser?.role === "admin" && data.userId ? data.userId.trim() : (currentUser?.id ?? null);

    const days = Number(data.ttlDays ?? 30);
    const ttlMs = days > 0 ? days * 24 * 3600 * 1000 : 3650 * 24 * 3600 * 1000;
    const { token, expiresAt, userId } = createManualAccessToken(clientId, ttlMs, targetUserId);

    return json({
      ok: true,
      message: `Token akses berhasil dibuat untuk klien "${client.name}"`,
      token,
      expiresAt,
      clientId,
      userId,
    });
  })

  .delete("/tokens/:token", ({ params }) => {
    const success = revokeToken(params.token);
    return json({ ok: success });
  })

  .delete("/tokens/client/:clientId", ({ params }) => {
    revokeAllTokensForClient(params.clientId);
    return json({ ok: true, message: `Semua token untuk klien "${params.clientId}" dicabut` });
  })

  // ── Activity Logs ───────────────────────────────────────────────────────
  .get("/logs", ({ query }) => {
    const limit = query.limit ? Number(query.limit) : 100;
    const search = query.search ? String(query.search) : undefined;
    const filter = query.filter ? String(query.filter) : undefined;

    const logs = getActivityLogs(limit, search, filter);
    return json({ ok: true, logs });
  })

  .delete("/logs", () => {
    clearActivityLogs();
    return json({ ok: true, message: "Log aktivitas berhasil dibersihkan" });
  });
