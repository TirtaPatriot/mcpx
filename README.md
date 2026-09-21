# OAuth 2.1 MCP Gateway

Reverse proxy berbasis Bun + ElysiaJS yang menaruh OAuth 2.1 di depan beberapa server MCP lokal, agar bisa dipakai sebagai custom app Google Gemini.

```
Gemini ──OAuth──▶ /oauth/authorize, /oauth/token
Gemini ──Bearer─▶ /mcp/:serverName/*  ──▶  server MCP (MCP_SERVERS[serverName])
```

## Menjalankan

```bash
cp .env.example .env      # isi CLIENT_ID, CLIENT_SECRET, MCP_SERVERS
docker compose up -d --build
docker compose logs -f
```

Tanpa Docker: `bun install && bun run dev` (env di-load otomatis dari `.env`).

### Deploy hanya dengan Dockerfile

Gateway hanya membaca environment variable (`process.env`), tidak memerlukan file `.env`, dan `.env` tidak ikut masuk image (`.dockerignore`). Cukup build `Dockerfile` lalu set variabel di platform deploy (Coolify, Portainer, Dokploy, `docker run -e`, dan sebagainya):

```bash
docker build -t oauth-gateway .
docker run -d -p 3000:3000 \
  --add-host host.docker.internal:host-gateway \
  -e CLIENT_ID=gemini-mcp \
  -e CLIENT_SECRET=$(openssl rand -hex 32) \
  -e 'MCP_SERVERS={"filesystem":"http://host.docker.internal:3001"}' \
  oauth-gateway
```

- `MCP_SERVERS` diisi JSON mentah; kutip tunggal hanya diperlukan oleh shell, bukan oleh platform yang punya kolom env.
- `PORT` mengikuti variabel platform bila di-set (default `3000`), dan healthcheck ikut menyesuaikan.
- Variabel wajib yang kosong membuat container berhenti saat start dengan pesan jelas (`[config] CLIENT_ID belum di-set`), bukan jalan setengah-setengah.
- `docker-compose.yml` juga membaca variabel dari shell host, jadi `CLIENT_ID=... CLIENT_SECRET=... MCP_SERVERS=... docker compose up -d` bekerja tanpa `.env`.

## Konfigurasi

| Env | Wajib | Keterangan |
|---|---|---|
| `CLIENT_ID`, `CLIENT_SECRET` | ya | Kredensial yang dimasukkan ke konfigurasi custom app Gemini. |
| `MCP_SERVERS` | ya | JSON sebaris `{"nama":"http://host:port[/base]"}`. Untuk server yang butuh header auth: `{"nama":{"url":"http://host:port","headers":{"Authorization":"Bearer ..."}}}`. |
| `ALLOWED_REDIRECT_HOSTS` | tidak | Host `redirect_uri` yang diizinkan (subdomain ikut), default `google.com`. Wajib https. |
| `ACCESS_TOKEN_TTL` | tidak | Detik, default `3600`. |
| `LOG_SSE_CHUNKS` | tidak | `true` (default) mencatat isi tiap chunk SSE, dipotong 200 karakter. |
| `PORT` | tidak | Default `3000`. |

## Endpoint

- `GET  /oauth/authorize` — halaman persetujuan; tombol "Izinkan Akses" mengirim `POST /oauth/authorize` yang me-redirect ke `redirect_uri` dengan `code` dan `state`. PKCE (`S256`) divalidasi bila `code_challenge` dikirim.
- `POST /oauth/token` — `authorization_code` dan `refresh_token`; kredensial klien dari body (form/JSON) atau HTTP Basic.
- `ALL  /mcp/:serverName/*` — proxy streaming (SSE) dengan `Authorization: Bearer <access_token>`. `401` tanpa token valid, `404` server tidak dikenal, `502` upstream mati.
- `GET  /health` — untuk healthcheck.

## Catatan

- Code dan token disimpan di memori; restart gateway berarti Gemini harus otorisasi ulang.
- Header `Authorization` dari Gemini (token gateway) tidak diteruskan ke server MCP. Header milik server MCP sendiri diset lewat `headers` di `MCP_SERVERS`, menimpa header bernama sama dari klien, dan nilainya tidak pernah dicatat di log (hanya namanya).
- Endpoint authorize tidak meminta login: siapa pun yang bisa membuka halamannya dan tahu `CLIENT_ID` bisa menyetujui, tetapi menukar `code` tetap membutuhkan `CLIENT_SECRET`. Jangan ekspos gateway ini ke internet tanpa `CLIENT_SECRET` yang kuat.
