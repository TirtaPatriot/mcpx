# Overridable MCP environment variables: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin list which environment variables of a `command` MCP server can be overridden, and let a connection override them per OAuth client or through `?env.NAME=value` in the server URL, without letting anything dangerous through.

**Architecture:** One pure module, `src/env-policy.ts`, owns every rule (names, deny list, secret-looking names, values, precedence, session key). The server, the admin API and the dashboard all import it, so a rule is written once. The proxy applies it per request; the stdio manager builds a scrubbed process environment.

**Tech Stack:** Bun, Elysia, `bun:sqlite`, Preact + Tailwind, `bun test`, axe-core.

**Spec:** `docs/design/2026-10-18-env-overrides.md`

## Global Constraints

- Names match `^[A-Z][A-Z0-9_]{0,63}$`. Values are at most 256 characters, no control characters or newlines, and must be in the entry's `values` when it has one.
- Hard deny list, never listable, compared case-insensitively: see "Validation rules" in the spec (shell startup, runtime and tool hooks, loader, traffic routing, trust store and the gateway's own settings). Implemented and tested in `src/env-policy.ts`.
- A name containing `URL|URI|HOST|ENDPOINT|ADDR|PROXY|CMD|COMMAND|EXEC|SCRIPT|PLUGIN|DIR|FILE|PATH` is only listable with an explicit non-empty `values` list.
- Names containing `KEY`, `TOKEN`, `SECRET`, `PASSWORD`, `CREDENTIAL` or `PASSWD` (case-insensitive) are never listable.
- Precedence: base environment < server `env_vars` < client overrides < URL overrides. Only names in the server's `overridable_env` take part in the last two.
- A URL override that is unknown or invalid fails with HTTP 400 `{"error":"invalid_env_override","error_description":"..."}`; a client override that is no longer allowed is skipped and logged.
- The process session key becomes `server:token` + (`:` + 8-hex-digit hash of the sorted final overrides, only when there are overrides).
- Spawned processes no longer inherit the gateway environment. Base variables: `PATH`, `HOME`, `USER`, `LOGNAME`, `SHELL`, `LANG`, `LC_*`, `TZ`, `TMPDIR`, `TERM`, `SSL_CERT_FILE`, `SSL_CERT_DIR`, `NODE_EXTRA_CA_CERTS`, `HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY` (and lower-case forms), plus the cache variables the gateway already sets. `MCP_PASSTHROUGH_ENV=A,B` adds host variables; the deny list still applies to it.
- All user-facing text is English, sentence case, with the verb of an action named the same everywhere. Accessibility rules in `CONTRIBUTING.md` apply to every new control (`Field`, `Modal`, `useConfirm`, axe tests in both themes).
- Commits are Conventional Commits with no attribution trailer.

## Review Focus

Inputs the spec implies but the obvious tests would miss, most likely first:

1. **Repeated parameter** `?env.X=a&env.X=b`: reject with 400 (never pick one silently). Owned by Task 1.
2. **Empty value** `?env.X=`: reject with "must not be empty"; "Default" in the dashboard removes an override instead. Task 1.
3. **Case**: `?env.dokploy_tool_preset=minimal` is "not overridable", not a match; `Path` and `npm_config_x` are denied. Task 1.
4. **Stale client override** (server renamed or variable removed from the list): skipped and logged, the request still succeeds. Task 1 and Task 4.
5. **Flood**: more than 20 listed variables per server, or more than 20 `env.*` parameters in one request: rejected. Task 1 and Task 2.

---

## File map

| File | Responsibility |
|---|---|
| `src/env-policy.ts` (new) | All rules and the shared types; pure, imports nothing from the server |
| `src/config.ts` | `MCP_PASSTHROUGH_ENV` |
| `src/stdio-manager.ts` | `buildProcessEnv`, overrides parameter on session creation |
| `src/db.ts` | two columns, row types, save functions |
| `src/admin-api.ts` | validate and persist the two new fields |
| `src/proxy.ts` | resolve overrides per request, 400s, session key |
| `test/fixtures/env-echo-mcp.ts` (new) | tiny stdio MCP process that reports its environment |
| `web/src/components/OverridableEnvEditor.tsx` (new) | server dialog section |
| `web/src/components/EnvOverridesSection.tsx` (new) | client dialog section |
| `web/src/components/EnvUrlBuilder.tsx` (new) | Connect dialog URL builder |
| `web/src/types.ts`, `web/src/tabs/Servers.tsx`, `web/src/tabs/Clients.tsx` | wire the three components in |
| `README.md`, `.env.example`, `docker-compose.yml`, `CONTRIBUTING.md` | document the feature and the environment change |

---

### Task 1: The policy module

**Files:**
- Create: `src/env-policy.ts`
- Test: `test/env-policy.test.ts`

**Interfaces:**
- Produces (all exported from `src/env-policy.ts`):
  - `interface OverridableSpec { values?: string[]; description?: string }`
  - `type OverridableEnv = Record<string, OverridableSpec>`
  - `type ClientEnvOverrides = Record<string, Record<string, string>>` (server id → name → value)
  - `type Result<T> = { ok: true; value: T } | { ok: false; error: string }`
  - `const MAX_LISTED = 20`, `const MAX_URL_OVERRIDES = 20`, `const MAX_VALUE_LENGTH = 256`
  - `denyReason(name: string): string | null` (reason text when the name can never be listed)
  - `parseOverridableEnv(raw: unknown): Result<OverridableEnv>` (accepts a JSON string or an object; `""`/`"{}"`/`undefined` give `{}`)
  - `validateValue(name: string, value: string, spec: OverridableSpec): string | null` (error text or null)
  - `parseClientOverrides(raw: unknown, allowedFor: (serverId: string) => OverridableEnv | null): Result<ClientEnvOverrides>`
  - `overridesFromUrl(url: URL): Result<Record<string, string>>`
  - `resolveOverrides(input: { allowed: OverridableEnv; client?: Record<string, string>; url: Record<string, string> }): Result<{ env: Record<string, string>; skipped: string[] }>`
  - `overrideKey(env: Record<string, string>): string` (`""` when empty, else 8 hex digits)
  - `buildOverrideUrl(origin: string, serverId: string, env: Record<string, string>): string`
  - `stripEnvParams(url: URL): URL` (a copy of the URL without any `env.*` query parameter, other parameters and their order kept)

- [ ] **Step 1: Write the failing tests** in `test/env-policy.test.ts`, grouped by function. Required assertions, with the spec's exact values:
  - `denyReason`: `"PATH"`, `"Path"`, `"LD_PRELOAD"`, `"DYLD_INSERT_LIBRARIES"`, `"NODE_OPTIONS"`, `"PYTHONPATH"`, `"GOFLAGS"`, `"npm_config_registry"`, `"ADMIN_PASSWORD"`, `"MCP_PASSTHROUGH_ENV"` each return a non-null reason; `"DOKPLOY_TOOL_PRESET"` returns `null`; a secret-looking name (`"DOKPLOY_API_KEY"`, `"X_Token"`, `"MY_SECRET"`, `"DB_PASSWD"`) returns a reason that says why.
  - `parseOverridableEnv`: the Dokploy example from the spec parses to the same object; `"{}"`, `""`, `undefined` give `{}`; fails with an error naming the offender for a bad name (`"dokploy_x"`), a denied name, a non-array `values`, a non-string value in `values`, an entry that is not an object, JSON that is an array, invalid JSON; fails with `"at most 20"` for 21 entries.
  - `validateValue`: `"minimal"` passes for `{values:["minimal","standard","full"]}`; `"huge"` fails with text containing `"minimal, standard, full"`; `""` fails with `"must not be empty"`; a 257-character value fails; `"a\nb"` and `"a\u0000b"` fail; `"a=b ü"` passes for a free-text spec.
  - `overridesFromUrl`: `?env.DOKPLOY_TOOL_PRESET=minimal&x=1` gives `{DOKPLOY_TOOL_PRESET:"minimal"}` (ignores other parameters); repeated `env.X` fails with `"more than once"`; 21 distinct `env.*` parameters fail; percent-encoded values are decoded; no `env.*` gives `{}`.
  - `resolveOverrides`: precedence (url beats client beats nothing); a URL name not in `allowed` fails with text containing `"is not overridable"`; a lower-case URL name fails the same way; an invalid URL value fails with the `validateValue` text; a client name not in `allowed` goes to `skipped` and does not fail; a client value that is no longer valid goes to `skipped`; empty input gives `{env:{}, skipped:[]}`.
  - `overrideKey`: `{}` gives `""`; key order does not matter (`{A:"1",B:"2"}` equals `{B:"2",A:"1"}`); different values give different keys; the result matches `^[0-9a-f]{8}$`.
  - `parseClientOverrides`: valid input round-trips; a server id for which `allowedFor` returns `null` fails with `"unknown server"`; a name the server does not list fails; an invalid value fails; `{}` and `undefined` give `{}`.
  - `buildOverrideUrl("https://gw.example.com","dokploy",{DOKPLOY_TOOL_PRESET:"minimal"})` equals `"https://gw.example.com/mcp/dokploy?env.DOKPLOY_TOOL_PRESET=minimal"`; values are percent-encoded; no overrides gives the bare URL; names are sorted.
  - `stripEnvParams`: `https://x/mcp/a?env.A=1&keep=2&env.B=3` becomes `https://x/mcp/a?keep=2`; a URL without `env.*` parameters is returned equal; the input URL object is not mutated.

- [ ] **Step 2: Run to verify failure**

Run: `bun test test/env-policy.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the module** with the signatures above. The deny list and secret pattern are two exported constants so the dashboard can show them; `denyReason` explains each class in plain words (for example "`PATH` cannot be overridden: it controls which programs run"). `resolveOverrides` checks URL entries strictly (failing on the first problem, naming it) and client entries leniently (collecting names into `skipped`). `overrideKey` is the first 8 hex digits of a SHA-256 over `JSON.stringify` of the entries sorted by name. Use `node:crypto`; no other import.

- [ ] **Step 4: Run to verify pass**

Run: `bun test test/env-policy.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/env-policy.ts test/env-policy.test.ts
git commit -m "feat(env): policy module for overridable MCP environment variables"
```

---

### Task 2: Persistence and admin API

**Files:**
- Modify: `src/db.ts` (columns, `McpServerRow`, `OAuthClientRow`, statements, `saveMcpServer`, `saveOAuthClient`), `src/admin-api.ts` (server and client handlers)
- Test: `test/env-api.test.ts`

**Interfaces:**
- Consumes: `parseOverridableEnv`, `parseClientOverrides` from Task 1.
- Produces:
  - `McpServerRow.overridable_env: string`, `OAuthClientRow.env_overrides: string` (JSON text, default `'{}'`)
  - `saveMcpServer({... overridable_env?: string})`, `saveOAuthClient({... env_overrides?: string})`: when omitted on an existing row, the stored value is kept
  - Admin API: `POST/PUT /api/admin/servers` accept `overridable_env` (object or JSON string); `POST/PUT /api/admin/clients` accept `env_overrides` (object keyed by server id). Rejections are HTTP 400 `{ok:false,error:<validator text>}`. Both fields are returned by the existing GET endpoints.

- [ ] **Step 1: Write the failing tests** in `test/env-api.test.ts`. Build requests against `adminApi.handle(new Request(...))` with the cookie `admin_session=<id>` from `createAdminLoginSession` for the seeded admin (`seedInitialData()` first). Assertions:
  - saving a command server with the Dokploy `overridable_env` returns 200 and `GET /api/admin/servers` shows it back;
  - `{ "PATH": {} }`, `{ "DOKPLOY_API_KEY": {} }`, 21 entries and a malformed entry each return 400 with the validator's text, and nothing is stored;
  - `PUT` that omits `overridable_env` keeps the stored one;
  - saving a client with `env_overrides` `{dokploy:{DOKPLOY_TOOL_PRESET:"minimal"}}` returns 200; a value not in `values`, an unknown server id, and a name the server does not list each return 400;
  - an existing database without the columns migrates: create a table in a temp DB without them, import `src/db.ts` after, and the columns exist (guard against the idempotent `ALTER` regressing).

- [ ] **Step 2: Run to verify failure**

Run: `bun test test/env-api.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement.** Add both columns with the existing idempotent `ALTER TABLE ... ADD COLUMN ... DEFAULT '{}'` pattern next to the other migrations and in the `CREATE TABLE` statements; extend the row types, the insert/update statements and the two save functions; in `admin-api.ts` call the Task 1 parsers on POST and PUT, normalize to a JSON string before saving, and return the parser's `error` as the 400 message. `allowedFor` for clients returns `null` when `getMcpServer(id)` is missing or is not a `command` server, otherwise the parsed list (an unparseable stored list counts as `{}`).

- [ ] **Step 4: Run to verify pass**

Run: `bun test test/env-api.test.ts && bun test`
Expected: PASS, and the existing server tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/db.ts src/admin-api.ts test/env-api.test.ts
git commit -m "feat(env): store and validate overridable variables and client overrides"
```

---

### Task 3: Scrubbed process environment

**Files:**
- Modify: `src/config.ts`, `src/stdio-manager.ts` (replace `getDefaultExecutionEnv`; use it in `spawnStdioSession` and `testStdioCommand`)
- Test: `test/stdio-env.test.ts`

**Interfaces:**
- Consumes: `denyReason` from Task 1.
- Produces:
  - `config.ts`: `export const MCP_PASSTHROUGH_ENV: string[]`
  - `stdio-manager.ts`: `export function buildProcessEnv(input: { serverEnv: Record<string, string>; overrides?: Record<string, string>; host?: Record<string, string | undefined>; passthrough?: string[] }): Record<string, string>` (`host` defaults to `process.env`, `passthrough` to `MCP_PASSTHROUGH_ENV`)

- [ ] **Step 1: Write the failing tests** in `test/stdio-env.test.ts`, passing an explicit `host`:
  - with a host containing `ADMIN_PASSWORD`, `CLIENT_SECRET`, `AWS_SECRET_ACCESS_KEY`, `PATH`, `HOME`, `LANG`, `LC_ALL`, `TZ`, `HTTPS_PROXY`, `https_proxy`: the result contains the last seven and none of the first three;
  - the cache variables (`UV_CACHE_DIR`, `GOCACHE`, `GOPATH`, `BUN_INSTALL_CACHE_DIR`, `npm_config_cache`, `PYTHONUNBUFFERED`) are always present;
  - `serverEnv` beats the base, `overrides` beat `serverEnv`;
  - `passthrough:["MY_HOST_VAR"]` passes it; `passthrough:["ADMIN_PASSWORD","PATH_X","LD_PRELOAD"]` passes none of the deny-listed ones;
  - a host variable that is not on the allow list and not in `passthrough` is dropped.

- [ ] **Step 2: Run to verify failure**

Run: `bun test test/stdio-env.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** `buildProcessEnv` and the `MCP_PASSTHROUGH_ENV` parse (split on commas, trim, drop empties). The allow list is one exported `BASE_ENV` array of exact names and `LC_` prefix. Replace the `getDefaultExecutionEnv(customEnv)` calls in `spawnStdioSession` and `testStdioCommand` with `buildProcessEnv`.

- [ ] **Step 4: Run to verify pass**

Run: `bun test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/config.ts src/stdio-manager.ts test/stdio-env.test.ts
git commit -m "fix(security): stop passing the gateway environment to MCP processes"
```

---

### Task 4: Apply overrides in the proxy

**Files:**
- Modify: `src/proxy.ts` (command branch), `src/stdio-manager.ts` (`getOrCreateStdioSession` and `spawnStdioSession` gain a trailing `overrides: Record<string, string> = {}` parameter that is passed to `buildProcessEnv`)
- Create: `test/fixtures/env-echo-mcp.ts`
- Test: `test/env-proxy.test.ts`

**Interfaces:**
- Consumes: `parseOverridableEnv`, `overridesFromUrl`, `resolveOverrides`, `overrideKey` (Task 1), `buildProcessEnv` (Task 3), `getOAuthClient`, `stmtGetAccessToken` (`db.ts`).
- Produces:
  - `CachedMcpServer.overridable_env: OverridableEnv` (parsed once where the cache is filled, which is two places: `reloadMcpCache` and `getCachedServer`; `{}` on bad JSON)
  - the fixture: a Bun script speaking JSON-RPC over stdio that answers `initialize` and `tools/call` named `env`, returning `JSON.stringify` of `process.env`

- [ ] **Step 1: Write the failing tests** in `test/env-proxy.test.ts`. Seed a command server `echo` running the fixture (`bun test/fixtures/env-echo-mcp.ts`) with `env_vars {"BASE":"1"}`, `overridable_env {"DOKPLOY_TOOL_PRESET":{"values":["minimal","standard","full"]}}`, a client `gemini` with `env_overrides {echo:{DOKPLOY_TOOL_PRESET:"minimal"}}`, a client `claude` without, and an access token for each. Call `proxyMcpRequest({request, server:null})` with `tools/call env`. Assertions:
  - the `gemini` token sees `DOKPLOY_TOOL_PRESET=minimal` and `BASE=1`; the `claude` token sees neither a preset nor a failure;
  - `?env.DOKPLOY_TOOL_PRESET=full` on the `gemini` token wins over the client's `minimal`;
  - none of the connections sees `ADMIN_PASSWORD` or `CLIENT_SECRET` (set both in `process.env` for the test);
  - `?env.NOPE=1` returns 400 with `error: "invalid_env_override"` and text containing `NOPE`; `?env.DOKPLOY_TOOL_PRESET=huge` returns 400 naming the valid values; a repeated parameter returns 400;
  - two requests with the same token and different URL overrides run in different processes (the fixture reports `process.pid`); two with identical overrides share one;
  - a client override for a name later removed from the server's list is skipped and the request returns 200;
  - an HTTP-type server ignores `env.*` parameters entirely, and the URL forwarded upstream carries none of them (assert on the upstream URL passed to `fetch`, with `globalThis.fetch` stubbed).

- [ ] **Step 2: Run to verify failure**

Run: `bun test test/env-proxy.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement.** In the command branch, before creating the session: read the token record to get `client_id`; load `getOAuthClient(client_id)?.env_overrides[serverName]`; call `overridesFromUrl(url)` and return the 400 JSON on `ok:false`; call `resolveOverrides({allowed: mcp.overridable_env, client, url})` and return the 400 JSON on `ok:false`; log skipped names once; compute `key = overrideKey(env)`; set `clientKey = serverName:token` plus `:key` when `key` is not empty; pass `env` as the new last argument of `getOrCreateStdioSession` (both call sites). In the HTTP branch build the upstream URL from `stripEnvParams(url)`. Add the activity-log entry naming the applied overrides.

- [ ] **Step 4: Run to verify pass**

Run: `bun test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/proxy.ts src/stdio-manager.ts test/fixtures/env-echo-mcp.ts test/env-proxy.test.ts
git commit -m "feat(env): apply client and URL overrides when a connection starts a process"
```

---

### Task 5: Server dialog: overridable variables

**Files:**
- Create: `web/src/components/OverridableEnvEditor.tsx`
- Modify: `web/src/types.ts` (`McpServer.overridable_env: Record<string, { values?: string[]; description?: string }>`; the API returns the stored JSON text, so parse it in one helper `parseSpec(json: string)`), `web/src/tabs/Servers.tsx` (`ServerModal`, command type only)
- Test: `web/test/env-overrides.test.tsx`, plus a case in `web/test/a11y.test.tsx`

**Interfaces:**
- Consumes: `parseOverridableEnv`, `denyReason` from `src/env-policy.ts` (import with a relative path, like `consent-data.ts`).
- Produces: `OverridableEnvEditor(props: { value: OverridableRow[]; onChange: (rows: OverridableRow[]) => void })` and `type OverridableRow = { name: string; values: string; description: string }` with helpers `rowsToJson(rows: OverridableRow[]): string` and `specToRows(spec: OverridableEnv): OverridableRow[]`.

- [ ] **Step 1: Write the failing tests.** In `env-overrides.test.tsx`: the section appears for the command type and not for HTTP; "Add variable" appends a labelled row (name, valid values, description fields, each with a `<label>`); typing `PATH` shows `"cannot be overridden: it controls which programs run"` in a `role="alert"` and disables Save; typing `DOKPLOY_API_KEY` shows the secret-looking reason; typing a lower-case name shows the name rule; a valid row `DOKPLOY_TOOL_PRESET` / `minimal, standard, full` saves a payload whose `overridable_env` equals the spec's example; removing a row removes it from the payload; editing an existing server pre-fills its rows. Add the dialog (with two rows, one invalid) to the axe test in both states.

- [ ] **Step 2: Run to verify failure**

Run: `cd web && bun test test/env-overrides.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement** the editor and wire it into `ServerModal` below the environment-variables field: rows with name, valid values (comma separated, empty means free text), description, a Remove button named `Remove variable NAME`, and an "Add variable" button; one hint paragraph explaining that the values are not secret and secrets cannot be listed. Validation runs through `parseOverridableEnv(rowsToJson(rows))` on every change and the first error is shown next to the row it belongs to when the error names a variable, otherwise under the list. Include `overridable_env` in the save payload.

- [ ] **Step 4: Run to verify pass**

Run: `cd web && bun test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src web/test
git commit -m "feat(web): choose which variables of a server can be overridden"
```

---

### Task 6: Client dialog: environment overrides

**Files:**
- Create: `web/src/components/EnvOverridesSection.tsx`
- Modify: `web/src/types.ts` (`OAuthClient.env_overrides: Record<string, Record<string, string>>`, parsed from the API's JSON text by one helper), `web/src/tabs/Clients.tsx` (`ClientModal`)
- Test: `web/test/env-overrides.test.tsx`, plus a case in `web/test/a11y.test.tsx`

**Interfaces:**
- Consumes: `OverridableEnv`, `ClientEnvOverrides` types and `validateValue` (Task 1); the servers list from `GET /api/admin/servers`.
- Produces: `EnvOverridesSection(props: { servers: McpServer[]; value: ClientEnvOverrides; onChange: (v: ClientEnvOverrides) => void })`.

- [ ] **Step 1: Write the failing tests.** The section lists only command servers that have at least one overridable variable, with the server's name as a heading; a variable with `values` renders a `<select>` whose first option is "Default (no override)" and then the values; a free-text variable renders an input with the description as its hint; choosing a value updates the payload (`env_overrides.dokploy.DOKPLOY_TOOL_PRESET`), choosing "Default" removes the key and removes an empty server entry; invalid free text shows the `validateValue` message; with no eligible servers the section shows an explanation and a link-style button to the Servers tab; editing a client pre-fills its overrides. Add the dialog to the axe test.

- [ ] **Step 2: Run to verify failure**

Run: `cd web && bun test test/env-overrides.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement** the section and wire it into `ClientModal` (fetch the servers when the dialog opens; show a skeleton line while loading). Include `env_overrides` in the save payload.

- [ ] **Step 4: Run to verify pass**

Run: `cd web && bun test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src web/test
git commit -m "feat(web): set environment overrides per OAuth client"
```

---

### Task 7: Connect dialog: URL builder

**Files:**
- Create: `web/src/components/EnvUrlBuilder.tsx`
- Modify: `web/src/tabs/Servers.tsx` (`ConnectServerModal`)
- Test: `web/test/env-overrides.test.tsx`, plus a case in `web/test/a11y.test.tsx`

**Interfaces:**
- Consumes: `buildOverrideUrl`, `validateValue` (Task 1).
- Produces: `EnvUrlBuilder(props: { origin: string; server: McpServer })`, rendered only when the server has overridable variables.

- [ ] **Step 1: Write the failing tests.** The builder shows the plain endpoint at first; choosing `minimal` for `DOKPLOY_TOOL_PRESET` updates the shown URL to `https://gw.example.com/mcp/dokploy?env.DOKPLOY_TOOL_PRESET=minimal` (the harness origin); "Copy URL" copies exactly that URL and the toast says it was copied; choosing "Default" returns to the plain URL; an invalid free-text value disables Copy and shows the message; the URL is announced politely (`aria-live`) when it changes; a server without overridable variables shows no builder. Add the dialog to the axe test.

- [ ] **Step 2: Run to verify failure**

Run: `cd web && bun test test/env-overrides.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement** the builder under the existing endpoint box in the Connect dialog, using the same field components as Task 6, and a note that the AI app must keep the query string for the override to apply (with the per-client alternative named).

- [ ] **Step 4: Run to verify pass**

Run: `cd web && bun test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src web/test
git commit -m "feat(web): build a server URL with environment overrides"
```

---

### Task 8: Documentation and end-to-end verification

**Files:**
- Modify: `README.md`, `.env.example`, `docker-compose.yml`, `CONTRIBUTING.md`

- [ ] **Step 1: Document.** README: a section "Overriding environment variables" (what, the three layers, the safe list with the deny and secret rules in one short list, a Dokploy example with both the client override and the URL) and a "Upgrading" note that MCP processes no longer inherit the gateway environment, with `MCP_PASSTHROUGH_ENV` as the way back. `.env.example` and `docker-compose.yml`: `MCP_PASSTHROUGH_ENV` (empty by default, one-line comment). CONTRIBUTING: the policy lives in `src/env-policy.ts` and both server and dashboard import it.

- [ ] **Step 2: Full check**

Run: `bun run check`
Expected: all server and web tests pass and the build succeeds.

- [ ] **Step 3: Real-gateway verification.** Start the gateway on a temp database, add a `command` server running `test/fixtures/env-echo-mcp.ts`, list `DOKPLOY_TOOL_PRESET` with the three values, create a client with `minimal`, then with `curl` confirm: client override applied, URL override wins, an invalid value returns 400 with the valid values, `ADMIN_PASSWORD` is absent from the process environment. In Chrome, in both themes and at phone width, walk through the three dialogs and run axe on each.

- [ ] **Step 4: Container check.** Build the image with Podman as before and confirm the same behaviour inside the container, including that a host variable placed in the container environment does not reach the MCP process unless listed in `MCP_PASSTHROUGH_ENV`.

- [ ] **Step 5: Commit**

```bash
git add README.md .env.example docker-compose.yml CONTRIBUTING.md
git commit -m "docs: environment overrides and the change to the process environment"
```
