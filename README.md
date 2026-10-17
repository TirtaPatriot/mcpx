🇬🇧 English · 🇮🇩 [Bahasa Indonesia](README.id.md)

<p align="center"><img src="public/logo.png" alt="MCP X logo" width="96"></p>

# MCP X — OAuth 2.1 gateway for MCP servers

MCP X puts OAuth 2.1 and Bearer-token authentication in front of your [MCP](https://modelcontextprotocol.io) servers, so Claude, Gemini, ChatGPT, Cursor and other AI clients can reach them safely over the internet. It comes with a web dashboard and a SQLite database (Bun + ElysiaJS).

```
You / admin ──────▶ /admin                    (web dashboard)
AI client ──OAuth─▶ /oauth/authorize, /oauth/token
AI client ─Bearer─▶ /mcp/:serverName/*  ──▶  upstream MCP server
                                              (HTTP/SSE URL, or a stdio process: bunx, npx, uvx, go run, python)
```

## Features

- **Upstream servers**: proxy an HTTP/SSE MCP server, or run a stdio one (`bunx`, `npx`, `uvx`, `uv run`, `go run`, `python`) and bridge it to Streamable HTTP and legacy SSE. Includes a JSON-RPC handshake test before you save.
- **OAuth 2.1**: authorization code + PKCE (S256), refresh-token rotation with a grace period, RFC 8414 / RFC 9728 discovery, RFC 7591 dynamic client registration, RFC 8252 loopback redirects.
- **Many clients, easy revoke**: one credential per app, one-click session revoke, enable/disable toggle.
- **Static API keys**: issue long-lived Bearer tokens for clients without a browser flow (Claude Desktop, Cursor) and copy a ready-made config snippet.
- **Users and roles**: `admin` and `user` accounts; tokens and sessions are tied to their owner.
- **Audit log**: every proxy and OAuth request, with status, duration and IP.
- **Responsive, accessible dashboard** for desktop and mobile: light, dark and system themes, keyboard shortcuts, WCAG 2.2 AA checks in CI. Installable as an app ("MCP X") through a web manifest.

## Quick start

### Docker (recommended)

```bash
git clone https://github.com/ekoeryanto/mcpx.git
cd mcpx
cp .env.example .env
docker compose up -d --build
docker compose logs -f      # first start prints the admin password
```

### Bun

Requires [Bun](https://bun.sh) 1.1+.

```bash
bun install
bun run build               # builds the dashboard (web/dist)
bun run start
```

Open <http://localhost:3000/admin> and sign in as `admin`. Unless you set `ADMIN_PASSWORD`, a random password is generated on first start and printed **once** in the log. Change it under **Settings**.

Then, in the dashboard:

1. **Servers** → add your MCP server (URL, or a command such as `bunx -y @modelcontextprotocol/server-everything`).
2. **OAuth clients** or **Tokens** → create a client or issue an API key.
3. Point your AI client at `https://<your-gateway>/mcp/<server-name>` (see below).

Set `PUBLIC_URL` when the gateway runs behind a reverse proxy, so OAuth discovery returns the public address.

## Connect an AI client

**Claude Desktop / Cursor / Windsurf** — issue an API key (Tokens → Create), then:

```json
{
  "mcpServers": {
    "my-server": {
      "url": "https://gateway.example.com/mcp/my-server",
      "headers": { "Authorization": "Bearer <TOKEN_FROM_GATEWAY>" }
    }
  }
}
```

- Claude Desktop: `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS), `%APPDATA%\Claude\claude_desktop_config.json` (Windows)
- Cursor: `.cursor/mcp.json`

**Gemini, ChatGPT, and other OAuth clients** — give them the server URL `https://gateway.example.com/mcp/<server-name>`. Clients that support discovery find the endpoints on their own; otherwise enter:

- Authorization URL: `https://gateway.example.com/oauth/authorize`
- Token URL: `https://gateway.example.com/oauth/token`
- Client ID / Secret: from the **OAuth clients** tab

**curl**

```bash
curl -N -H "Authorization: Bearer <TOKEN>" -H "Accept: text/event-stream" \
  https://gateway.example.com/mcp/my-server
```

## Configuration

Set these in `.env` (see [`.env.example`](.env.example)).

| Variable | Default | Description |
|---|---|---|
| `ADMIN_PASSWORD` | random, printed on first start | Password of the `admin` user. |
| `PORT` | `3000` | Listen port. |
| `DB_PATH` | `./data/tokens.db` | SQLite file (`/app/data/tokens.db` in the container). |
| `PUBLIC_URL` | auto-detected | Public origin, for example `https://gateway.example.com`. Recommended behind a proxy. |
| `CLIENT_ID`, `CLIENT_SECRET` | auto-generated | Seed an initial OAuth client from the environment. |
| `MCP_SERVERS` | none | Inline JSON to seed upstream servers. |
| `ALLOWED_REDIRECT_HOSTS` | Google, OpenAI, Anthropic, Cursor, localhost | Hosts (subdomains included) allowed as OAuth redirect targets. |
| `ACCESS_TOKEN_TTL` | `2592000` (30 days) | Access token lifetime, seconds. |
| `REFRESH_TOKEN_TTL` | `31536000` (1 year) | Refresh token lifetime, seconds. |
| `REFRESH_GRACE_PERIOD` | `60` | Seconds an old refresh token still works after rotation. |
| `LOG_SSE_CHUNKS` | `true` | Log SSE chunks (truncated to 200 characters). |

## Endpoints

| Path | Purpose |
|---|---|
| `/admin`, `/admin/login` | Dashboard and sign-in |
| `/api/admin/*` | Dashboard JSON API (session cookie required) |
| `/oauth/authorize`, `/oauth/token`, `/oauth/register` | OAuth 2.1 flow and dynamic client registration |
| `/.well-known/oauth-authorization-server` | Server metadata (RFC 8414) |
| `/.well-known/oauth-protected-resource[/mcp/<server>]` | Resource metadata (RFC 9728) |
| `/mcp/:serverName/*` | Authenticated proxy to the upstream server |
| `/health` | Health check and active server list |

## Development

```bash
bun run dev       # gateway (watch) + Vite dev server with hot reload
bun run check     # typecheck, server and dashboard tests, build
```

The dashboard lives in [`web/`](web) (Vite, Preact, TypeScript, Tailwind).

See [CONTRIBUTING.md](CONTRIBUTING.md) for the code layout and PR guidelines.

## Security

Client secrets and tokens are stored in the local SQLite database, so keep `data/` private. Serve the gateway over HTTPS, keep `ALLOWED_REDIRECT_HOSTS` short, and change the generated admin password. To report a vulnerability, see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
