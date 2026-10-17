# Contributing to mcpx

Thanks for helping out. This guide gets you from clone to pull request.

## Setup

Requires [Bun](https://bun.sh) 1.1 or newer.

```bash
git clone https://github.com/ekoeryanto/mcpx.git
cd mcpx
bun install
cp .env.example .env     # optional, defaults work for local development
bun run dev              # http://localhost:3000/admin
```

On first start the log prints the generated admin password (username `admin`). Set `ADMIN_PASSWORD` in `.env` if you would rather pick your own. Data lives in `./data/` and is git-ignored.

## Before you open a PR

```bash
bun run check            # typecheck + tests
```

CI runs the same checks plus a Docker build.

## Project layout

| File | Role |
|---|---|
| `src/index.ts` | Elysia app: routes, startup, logging |
| `src/config.ts` | Environment variables and constants |
| `src/db.ts` | SQLite schema, queries, first-start seeding |
| `src/oauth.ts` | OAuth 2.1: discovery, registration, authorize, token, PKCE |
| `src/auth.ts` | Admin session and bearer-token checks |
| `src/proxy.ts` | Reverse proxy to upstream MCP servers |
| `src/stdio-manager.ts` | Runs stdio MCP servers (bunx, npx, uvx, go run, python) and bridges them to HTTP |
| `src/admin-api.ts` | JSON API behind the dashboard |
| `src/admin-ui.ts` | Dashboard, login and consent pages (HTML in template strings) |
| `src/utils.ts`, `src/icons.ts` | Helpers |
| `test/` | `bun test` suites; `test/setup.ts` points the database at a temp directory |

## Guidelines

- Keep changes focused; one concern per PR.
- Add a test when the logic can be tested without a running server (see `test/oauth.test.ts` for the style).
- If you add or change an environment variable, update `.env.example`, `docker-compose.yml` and both READMEs.
- Never commit secrets, tokens or the `data/` directory.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org) (`feat:`, `fix:`, `docs:`, ...).

Security issues: see [SECURITY.md](SECURITY.md) and do not file them as public issues.
