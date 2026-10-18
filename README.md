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
docker run -d --name mcpx -p 3000:3000 -v mcpx-data:/app/data ghcr.io/ekoeryanto/mcpx:latest
docker logs mcpx            # first start prints the admin password
```

Or build from source with Compose:

```bash
git clone https://github.com/ekoeryanto/mcpx.git
cd mcpx
cp .env.example .env
docker compose up -d --build
docker compose logs -f      # first start prints the admin password
```

### bunx

Requires [Bun](https://bun.sh) 1.1+. No clone needed; data is stored in `./data` of the directory you run it from (override with `DB_PATH`).

```bash
bunx @ekoeryanto/mcpx
```

### From source

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
| `MCP_PASSTHROUGH_ENV` | none | Comma-separated host variables that MCP processes may inherit (see [Overriding environment variables](#overriding-environment-variables)). |
| `LOG_SSE_CHUNKS` | `true` | Log SSE chunks (truncated to 200 characters). |

## Overriding environment variables

One MCP server can behave differently for different AI apps. The Dokploy server, for example, can expose a large tool list; Gemini cannot take a payload that big, so Gemini needs `DOKPLOY_TOOL_PRESET=minimal` while Claude can use `full`.

For a server that runs as a command (`bunx`, `uvx`, `go run`, ...), an admin lists which variables may be overridden, and who may change them is then limited to that list:

1. **Server dialog → Overridable variables.** Add `DOKPLOY_TOOL_PRESET` with the allowed values `minimal, standard, full`.
2. **Per OAuth client.** In the client's dialog, choose a value under *Environment overrides*. Every connection of that client uses it.
3. **Per connection, in the URL.** The server's **Connect** dialog builds `https://gateway/mcp/dokploy?env.DOKPLOY_TOOL_PRESET=minimal` for apps that only let you edit a URL.

The order is: the server's own `env_vars`, then the client's overrides, then the URL. A wrong URL override is refused with a message naming the variable and the valid values. Connections with different overrides get separate processes.

What can be listed is limited on purpose:

- Names that change which code runs or where traffic goes (`PATH`, `LD_*`, `NODE_*`, `PYTHON*`, `BASH_ENV`, proxy and certificate settings, the gateway's own settings, ...) can never be listed.
- Names that look like secrets (`KEY`, `TOKEN`, `SECRET`, `PASSWORD`, `CREDENTIAL`) cannot be listed: values sent in a URL end up in browser history and logs.
- Names that point somewhere or run something (`URL`, `HOST`, `DIR`, `FILE`, `COMMAND`, ...) need an explicit list of allowed values, so a client cannot redirect a server, and the credentials you gave it, to a host of its choosing.
- A value is at most 256 characters, with no line breaks.

### The environment of an MCP process

MCP processes do **not** inherit the gateway's environment. They get a small base (`PATH`, `HOME`, `LANG`, `TZ`, proxy and certificate settings, cache directories), then the server's `env_vars`. The gateway's own settings (`ADMIN_PASSWORD`, `CLIENT_SECRET`, ...) are set to empty in the process, because Bun reads a `.env` file from the working directory by itself and would otherwise hand them over.

If a server relied on a host variable, add it to that server's `env_vars`, or name it in `MCP_PASSTHROUGH_ENV` (for example `MCP_PASSTHROUGH_ENV=GITHUB_TOKEN`). Prefer `env_vars` for secrets. Other secrets in a `.env` next to the gateway can still be read by processes started with `bun` or `bunx`, so keep that file out of the gateway's working directory, or use Docker, where `.env` is not part of the image.

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
