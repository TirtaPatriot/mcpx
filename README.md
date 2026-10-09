# Universal OAuth 2.1 MCP Gateway + Dashboard Management (Untuk Semua AI)

Reverse proxy berbasis Bun + ElysiaJS dengan OAuth 2.1 & Bearer Token di depan server MCP lokal, dilengkapi **Web UI Dashboard** dan database **SQLite** (`bun:sqlite` WAL mode) untuk manajemen visual server MCP, klien OAuth, sesi token, dan audit log request.

**Didesain untuk SEMUA platform & asisten AI:**
- 🤖 **Google Gemini** (Web & Mobile via RFC 8414 OAuth 2.1 Discovery & RFC 9728)
- 🟣 **Anthropic Claude** (Claude Desktop & Claude Code via SSE + Bearer Header)
- 🟢 **OpenAI / ChatGPT** (Custom GPT Actions via OAuth 2.0 Authorization Code flow)
- ⚡ **Cursor & Windsurf** (AI IDEs via SSE MCP Server + Bearer Token)
- 🌐 **Generic AI & Frameworks** (Open WebUI, LibreChat, Dify, LangChain, LlamaIndex, script cURL)

```
Pengguna / Admin ──▶ /admin (Web Dashboard Management)
Semua AI Client ──OAuth──▶ /oauth/authorize, /oauth/token
Semua AI Client ──Bearer─▶ /mcp/:serverName/* ──▶ server MCP upstream (HTTP / bunx / npx)
```

---

## Fitur Utama

- 🖥️ **Web Dashboard Management (`/admin`)**:
  - **Hub Integrasi AI (Universal Overview)**: Metrik gateway, status sistem, uptime, memory, dan tab panduan integrasi langsung untuk Google Gemini, Claude Desktop, OpenAI/ChatGPT, Cursor, dan Generic SSE.
  - **Manajemen Server MCP (HTTP & NPM/CLI)**:
    - Mendukung server upstream **HTTP/SSE URL** maupun perintah **NPM/CLI** (seperti `bunx -y @dokploy/mcp` atau `npx -y @dokploy/mcp`) melalui built-in bridge stdio-ke-SSE.
    - Konfigurasi environment variables (misal `DOKPLOY_URL`, `DOKPLOY_API_KEY`) dan argumen paket langsung via UI.
    - Fitur **Test Handshake JSON-RPC** untuk menguji perintah CLI sebelum disimpan.
    - Fitur **Test Ping** untuk menguji server HTTP.
  - **Multi-Klien OAuth 2.1 & Pencabutan Cepat (Easy Revoke)**:
    - Buat kredensial khusus per aplikasi (misal: `claude-desktop`, `cursor-ide`, `gemini-mobile`, `chatgpt-action`).
    - Tombol **"Cabut Sesi"** satu-klik per klien untuk langsung me-logout semua token aktif klien tersebut.
    - Toggle **Aktif / Nonaktif** untuk memblokir akses klien seketika tanpa menghapus datanya.
  - **Penerbitan Token Akses / API Key Langsung**:
    - Terbitkan token Bearer statis (30 hari, 90 hari, 1 tahun, hingga permanen 10 tahun) langsung dari UI untuk klien yang tidak memiliki alur browser OAuth (seperti Claude Desktop & Cursor).
    - Menghasilkan snippet konfigurasi JSON siap tempel.
  - **Dukungan Loopback RFC 8252 untuk Desktop AI**:
    - Otomatis mengizinkan redirect `http://localhost` dan `http://127.0.0.1` pada port berapa pun untuk aplikasi AI native/desktop.
  - **Whitelist Domain AI Terintegrasi**:
    - Whitelist default langsung mendukung Google (`google.com`), ChatGPT (`chatgpt.com`, `openai.com`), Claude (`claude.ai`, `anthropic.com`), Cursor (`cursor.com`), serta loopback lokal.
  - **Multi-User & Manajemen Tim (Akun & Hak Akses)**:
    - Dukungan banyak akun pengguna dengan peran **Administrator** (akses penuh) dan **User Biasa** (akses server MCP & pembuatan token).
    - Tab **👥 Pengguna** di dashboard untuk membuat, mengedit nama/password, mengaktifkan/menonaktifkan, dan menghapus akun pengguna.
    - Proteksi keamanan: mencegah penghapusan atau penonaktifan admin aktif terakhir, serta proteksi penghapusan akun sendiri.
    - Setiap token akses manual dan sesi OAuth dicatat kepemilikannya ke akun pengguna (`user_id`).
  - **Manajemen Token & Sesi**: Pantau daftar Access Token dan Refresh Token aktif di database SQLite, kolom atribusi pengguna/pemilik token, filter berdasarkan klien, dan cabut token secara individual maupun massal.
  - **Audit Log Aktivitas**: Monitoring real-time seluruh request masuk ke proxy maupun OAuth dengan filter error, pencarian path, status HTTP, durasi (ms), dan IP.
  - **Keamanan & Autentikasi**: Login terproteksi cookie session (`admin_session`) dengan kredensial username & password, serta fitur ubah password akun.
- 💾 **Penyimpanan SQLite Persisten (`bun:sqlite`)**:
  - Menggunakan mode **WAL (Write-Ahead Logging)** untuk konkurensi tinggi dan performa cepat.
  - Menyimpan Server MCP, Klien OAuth, Auth Code, Access Token, Refresh Token, Sesi Admin, Pengaturan, dan Riwayat Log.
  - Cleanup otomatis berjalan di latar belakang untuk membersihkan token kedaluwarsa.
- 🔄 **Otomatis Seeding & Kompatibilitas Mundur**:
  - Jika environment variable `CLIENT_ID`, `CLIENT_SECRET`, atau `MCP_SERVERS` disediakan di `.env`, gateway akan otomatis mengimpornya ke database SQLite saat pertama kali dijalankan.
  - Jika tidak ada variabel env, gateway otomatis membuat default client (`universal-ai`) yang siap digunakan untuk semua platform AI.

---

## Panduan Hubungkan ke Berbagai Platform AI

### 1. Claude Desktop (`claude_desktop_config.json`)
Claude Desktop menggunakan koneksi SSE langsung dengan header Bearer Token:
1. Buka dashboard `/admin` -> tab **Klien OAuth** atau **Token & Sesi**.
2. Klik tombol **"🔑 Buat Token Akses / API Key"**, pilih klien dan durasi (misal: Permanen 10 Tahun).
3. Salin token yang dihasilkan dan tempel ke file konfigurasi Claude Desktop:
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
   - Linux: `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "dokploy": {
      "url": "https://gateway.example.com/mcp/dokploy",
      "headers": {
        "Authorization": "Bearer <TOKEN_AKSES_DARI_GATEWAY>"
      }
    }
  }
}
```

### 2. Google Gemini (Custom App / Gems)
1. Buka Google Gemini Custom Tools / MCP settings.
2. Masukkan URL endpoint: `https://gateway.example.com/mcp/<nama-server>`.
3. Gemini akan otomatis menemukan endpoint autentikasi melalui RFC 8414 & RFC 9728 discovery:
   - **Authorize URL**: `https://gateway.example.com/oauth/authorize`
   - **Token URL**: `https://gateway.example.com/oauth/token`
4. Masukkan **Client ID** dan **Client Secret** dari dashboard gateway Anda.

### 3. OpenAI / ChatGPT (Custom GPT Actions)
1. Buka GPT Editor -> **Create New Action**.
2. Di bagian **Authentication**, pilih tipe **OAuth**:
   - **Client ID**: Salin dari tab Klien OAuth di gateway
   - **Client Secret**: Salin dari tab Klien OAuth di gateway
   - **Authorization URL**: `https://gateway.example.com/oauth/authorize`
   - **Token URL**: `https://gateway.example.com/oauth/token`
   - **Token Exchange Method**: Default (Basic authorization header)
3. Callback redirect OpenAI (`chatgpt.com`) sudah otomatis diizinkan oleh gateway.

### 4. Cursor / Windsurf IDE
1. Buka Cursor -> **Settings** -> **Features** -> **MCP**, atau edit file `.cursor/mcp.json`:
```json
{
  "mcpServers": {
    "dokploy": {
      "url": "https://gateway.example.com/mcp/dokploy",
      "headers": {
        "Authorization": "Bearer <TOKEN_AKSES_DARI_GATEWAY>"
      }
    }
  }
}
```

### 5. Generic SSE Client / LibreChat / Open WebUI / cURL
Gunakan endpoint SSE server MCP dengan header `Authorization: Bearer <TOKEN>`:
```bash
curl -N -H "Authorization: Bearer <TOKEN_AKSES>" \
  -H "Accept: text/event-stream" \
  https://gateway.example.com/mcp/dokploy
```

---

## Cara Menjalankan

### Menggunakan Docker Compose (Direkomendasikan)

```bash
cp .env.example .env
docker compose up -d --build
docker compose logs -f
```

Buka browser ke: **`http://localhost:3000/admin`**  
Password awal: **`admin123`** *(dapat diubah di menu Pengaturan)*.

### Menjalankan Langsung dengan Bun (Lokal)

```bash
bun install
bun run src/index.ts
# atau mode development:
bun run dev
```

---

## Konfigurasi Environment (`.env`)

| Variabel | Wajib | Default | Keterangan |
|---|---|---|---|
| `ADMIN_PASSWORD` | tidak | `admin123` | Password untuk login ke dashboard manajemen `/admin`. |
| `PORT` | tidak | `3000` | Port listen server. |
| `DB_PATH` | tidak | `./data/tokens.db` | Path file database SQLite (atau `/app/data/tokens.db` di container). |
| `PUBLIC_URL` | disarankan | *otomatis* | Origin publik gateway (`https://gateway.example.com`) untuk discovery OAuth RFC 8414 & RFC 9728. |
| `CLIENT_ID`, `CLIENT_SECRET` | tidak | *auto-generate* | Kredensial awal jika ingin di-seed dari env. |
| `MCP_SERVERS` | tidak | `{}` | JSON sebaris server MCP awal jika ingin di-seed dari env. |
| `ALLOWED_REDIRECT_HOSTS` | tidak | `google.com,oauth-redirect.googleusercontent.com,chatgpt.com,openai.com,claude.ai,anthropic.com,cursor.com,localhost,127.0.0.1` | Host redirect yang diizinkan untuk OAuth. |
| `ACCESS_TOKEN_TTL` | tidak | `2592000` (30 hari) | Masa aktif access token (detik). |
| `REFRESH_TOKEN_TTL` | tidak | `31536000` (1 tahun) | Masa aktif refresh token (detik). |
| `REFRESH_GRACE_PERIOD` | tidak | `60` (detik) | Toleransi rotasi refresh token untuk mencegah race condition. |

---

## Endpoint API & Halaman

- **Web Dashboard & Admin API**:
  - `GET  /admin` — Dashboard manajemen (redirect ke `/admin/login` jika belum login).
  - `GET  /admin/login` — Halaman login pengguna & admin.
  - `POST /api/admin/login` — Login kredensial `{ username, password }`.
  - `GET  /api/admin/me` — Profil akun pengguna saat ini & status autentikasi.
  - `POST /api/admin/change-password` — Ganti password akun saat ini.
  - `GET  /api/admin/stats` — Metrik server, pengguna, token & database.
  - `GET / POST / PUT / DELETE /api/admin/users` — Kelola akun pengguna, peran (`admin`/`user`), dan status aktif.
  - `POST /api/admin/users/:id/toggle` — Aktifkan atau nonaktifkan akun pengguna.
  - `GET / POST / PUT / DELETE /api/admin/servers` — Kelola server MCP & uji koneksi.
  - `GET / POST / PUT / DELETE /api/admin/clients` — Kelola klien OAuth.
  - `POST /api/admin/tokens/generate` — Buat access token Bearer / API key langsung untuk Claude, Cursor, dll (bisa diatribusikan ke user).
  - `GET / DELETE /api/admin/tokens` — Lihat dan cabut access token / refresh token.
  - `GET / DELETE /api/admin/logs` — Riwayat log request gateway.

- **OAuth 2.1 Protocol**:
  - `GET  /oauth/authorize` — Halaman persetujuan izin (consent).
  - `POST /oauth/authorize` — Menerbitkan authorization code.
  - `POST /oauth/token` — Pertukaran code atau refresh token menjadi access token Bearer.
  - `GET  /.well-known/oauth-authorization-server` — Metadata OAuth 2.1 (RFC 8414).
  - `GET  /.well-known/oauth-protected-resource[/mcp/<server>/...]` — Metadata resource (RFC 9728).

- **Proxy Upstream**:
  - `ALL  /mcp/:serverName/*` — Reverse proxy dengan proteksi Bearer token ke server MCP upstream.
  - `GET  /health` — Health check status gateway dan daftar server MCP aktif.

---

## Lisensi & Keamanan

- Kredensial admin dan secret klien tersimpan aman di database SQLite lokal (WAL mode).
- Rotasi refresh token dilengkapi grace period untuk stabilitas koneksi mobile client.
- Pastikan untuk mengganti password bawaan (`admin123`) di menu Pengaturan setelah instalasi pertama kali.
