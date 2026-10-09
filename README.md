# OAuth 2.1 MCP Gateway + Dashboard Management

Reverse proxy berbasis Bun + ElysiaJS dengan OAuth 2.1 di depan server MCP lokal, dilengkapi **Web UI Dashboard** dan database **SQLite** (`bun:sqlite` WAL mode) untuk manajemen visual server MCP, klien OAuth, sesi token, dan audit log request.

```
Pengguna / Admin ──▶ /admin (Web Dashboard Management)
Gemini / Client  ──OAuth──▶ /oauth/authorize, /oauth/token
Gemini / Client  ──Bearer─▶ /mcp/:serverName/* ──▶ server MCP upstream
```

---

## Fitur Utama

- 🖥️ **Web Dashboard Management (`/admin`)**:
  - **Ringkasan (Overview)**: Metrik gateway, status sistem, uptime, memory, dan panduan integrasi ke Google Gemini.
  - **Manajemen Server MCP (HTTP & NPM/CLI)**:
    - Mendukung server upstream **HTTP/SSE URL** maupun perintah **NPM/CLI** (seperti `bunx -y @dokploy/mcp` atau `npx -y @dokploy/mcp`) melalui built-in bridge stdio-ke-SSE.
    - Konfigurasi environment variables (misal `DOKPLOY_URL`, `DOKPLOY_API_KEY`) dan argumen paket langsung via UI.
    - Fitur **Test Handshake JSON-RPC** untuk menguji perintah CLI sebelum disimpan.
    - Fitur **Test Ping** untuk menguji server HTTP.
  - **Multi-Klien OAuth 2.1 & Pencabutan Cepat (Easy Revoke)**:
    - Buat banyak kredensial klien (misal: Gemini Laptop, Gemini HP, Claude, Cursor).
    - Tombol **"Cabut Sesi"** satu-klik per klien untuk langsung me-logout semua token aktif klien tersebut.
    - Toggle **Aktif / Nonaktif** untuk memblokir akses klien seketika.
    - Generator acak ulang secret dan panduan integrasi Gemini.
  - **Manajemen Token & Sesi**: Pantau daftar Access Token dan Refresh Token aktif di database SQLite, filter berdasarkan klien, dan cabut token secara individual maupun massal.
  - **Audit Log Aktivitas**: Monitoring real-time seluruh request masuk ke proxy maupun OAuth dengan filter error, pencarian path, status HTTP, durasi (ms), dan IP.
  - **Keamanan Admin**: Login terproteksi cookie session (`admin_session`) dan fitur ubah password admin.
- 💾 **Penyimpanan SQLite Persisten (`bun:sqlite`)**:
  - Menggunakan mode **WAL (Write-Ahead Logging)** untuk konkurensi tinggi dan performa cepat.
  - Menyimpan Server MCP, Klien OAuth, Auth Code, Access Token, Refresh Token, Sesi Admin, Pengaturan, dan Riwayat Log.
  - Cleanup otomatis berjalan di latar belakang untuk membersihkan token kedaluwarsa.
- 🔄 **Otomatis Seeding & Kompatibilitas Mundur**:
  - Jika environment variable `CLIENT_ID`, `CLIENT_SECRET`, atau `MCP_SERVERS` disediakan di `.env`, gateway akan otomatis mengimpornya ke database SQLite saat pertama kali dijalankan.
  - Jika tidak ada variabel env, gateway otomatis membuat default client (`gemini-mcp`) dan siap dikonfigurasi melalui Web UI.

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
| `PUBLIC_URL` | disarankan | *otomatis* | Origin publik gateway (`https://gateway.example.com`) untuk metadata discovery RFC 8414 & RFC 9728. |
| `CLIENT_ID`, `CLIENT_SECRET` | tidak | *auto-generate* | Kredensial awal jika ingin di-seed dari env. |
| `MCP_SERVERS` | tidak | `{}` | JSON sebaris server MCP awal jika ingin di-seed dari env. |
| `ALLOWED_REDIRECT_HOSTS` | tidak | `google.com,oauth-redirect.googleusercontent.com` | Host redirect yang diizinkan untuk OAuth. |
| `ACCESS_TOKEN_TTL` | tidak | `2592000` (30 hari) | Masa aktif access token (detik). |
| `REFRESH_TOKEN_TTL` | tidak | `31536000` (1 tahun) | Masa aktif refresh token (detik). |
| `REFRESH_GRACE_PERIOD` | tidak | `60` (detik) | Toleransi rotasi refresh token untuk mencegah race condition. |

---

## Endpoint API & Halaman

- **Web Dashboard**:
  - `GET  /admin` — Dashboard manajemen (redirect ke `/admin/login` jika belum login).
  - `GET  /admin/login` — Halaman login admin.
  - `POST /api/admin/login` — Login admin.
  - `GET  /api/admin/stats` — Metrik server & database.
  - `GET / POST / PUT / DELETE /api/admin/servers` — Kelola server MCP & uji koneksi.
  - `GET / POST / PUT / DELETE /api/admin/clients` — Kelola klien OAuth.
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

- Kredensial admin dan secret klien tersimpan aman di database SQLite lokal.
- Rotasi refresh token dilengkapi grace period untuk stabilitas koneksi mobile Gemini.
- Pastikan untuk mengganti password bawaan (`admin123`) di menu Pengaturan setelah instalasi pertama kali.
