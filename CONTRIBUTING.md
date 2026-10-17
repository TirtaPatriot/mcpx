# Contributing to MCP X

Thanks for helping out. This guide gets you from clone to pull request.

## Setup

Requires [Bun](https://bun.sh) 1.1 or newer. Node is not needed.

```bash
git clone https://github.com/ekoeryanto/mcpx.git
cd mcpx
bun install
cp .env.example .env     # optional, defaults work for local development
bun run dev              # gateway on :3000 + Vite on :5173
```

`bun run dev` starts the gateway (watch mode) and the Vite dev server together. Open the dashboard at <http://localhost:5173/_app/login.html>; Vite proxies the API to the gateway and hot-reloads UI changes. Without Vite, `bun run build` once and use <http://localhost:3000/admin>.

The OAuth consent page is rendered by the gateway from the last build, so run `bun run build` after changing it. To iterate on its look, open <http://localhost:5173/_app/consent.html>: in dev mode it shows sample data.

On first start the log prints the generated admin password (username `admin`). Set `ADMIN_PASSWORD` in `.env` if you would rather pick your own. Data lives in `./data/` and is git-ignored.

## Before you open a PR

```bash
bun run check            # typecheck (server + web), server tests, web tests, build
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
| `web/` | Dashboard: Vite + Preact + TypeScript + Tailwind. `src/tabs/` has one component per tab, `src/api.ts` the fetch helper, `src/ui.tsx` shared pieces. The OAuth consent page is `consent.html` + `src/components/ConsentView.tsx` |
| `src/web.ts` | Serves the built pages (`web/dist`): the dashboard behind the admin session, and the consent page filled with data |
| `src/consent-data.ts` | The data contract between the server and the consent page (types only) |
| `src/utils.ts`, `src/icons.ts` | Helpers |
| `test/` | Server tests (`bun test`); `test/setup.ts` points the database at a temp directory |
| `web/test/` | Dashboard tests (`bun run test:web`): components rendered in happy-dom with a mocked `fetch` |

## Accessibility

The dashboard, sign-in and consent pages are built to WCAG 2.2 AA, and the tests enforce it:

- `web/test/a11y.test.tsx` runs [axe-core](https://github.com/dequelabs/axe-core) on every section, dialog and page. A new screen or dialog should be added there.
- `web/test/theme.test.ts` checks text contrast, including accent text on its tinted background, in both themes. Add new colours to `styles.css` as palette variables, never as literal values.

Use the shared pieces instead of raw elements, because they carry the accessibility with them:

| Need | Use |
|---|---|
| A form control with a label | `Field` (ties the label to the control, links errors and hints) |
| A dialog | `Modal` (focus trap, Escape, focus return) |
| "Are you sure?" | `useConfirm()`, with a message that says what will happen |
| Actions on a table row | `RowActions` (everyday actions visible, destructive ones in the menu) |
| A table | `DataTable` with `Tr` and `Td` (keeps table semantics in the mobile card layout) |
| A decorative image | `alt=""`; an informative one gets real alt text |

Automated checks cannot judge everything. Before a release, tab through the changed screens, try them in both themes and at phone width, and use a screen reader if you can.

## Guidelines

- Keep changes focused; one concern per PR.
- Add a test when the logic can be tested without a running server (see `test/oauth.test.ts`); for dashboard changes see `web/test/app.test.tsx`.
- If you add or change an environment variable, update `.env.example`, `docker-compose.yml` and both READMEs.
- Never commit secrets, tokens or the `data/` directory.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org) (`feat:`, `fix:`, `docs:`, ...).

Security issues: see [SECURITY.md](SECURITY.md) and do not file them as public issues.
