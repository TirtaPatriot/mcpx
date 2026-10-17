# Overridable environment variables for MCP servers

Status: proposed · Date: 2026-10-18

## Why

One MCP server definition often has to behave differently for different AI clients. The
motivating case: the Dokploy MCP server exposes a large tool list, which Gemini cannot handle
in one payload, so Gemini needs `DOKPLOY_TOOL_PRESET=minimal` while Claude can use `full`.

Today a stdio server has one fixed set of `env_vars`, set by an admin. There is no way for the
connecting side to choose a value, and no way to say which values are safe to choose.

## Goals

- An admin lists, per server, which environment variables may be overridden, and optionally
  which values are valid.
- An override can be set per OAuth client (an admin decision, for example "every Gemini
  connection uses `minimal`") and per connection through the server URL
  (`?env.NAME=value`, for clients that only let the user edit a URL).
- Nothing outside the list can be overridden, and nothing dangerous can be listed.
- Connections with different overrides never share a process.

## Non-goals

- Overriding secrets (API keys, tokens, passwords). See "Names that look like secrets".
- Overriding `command` or `args`.
- Per-user overrides, and encrypting values at rest.
- HTTP-type servers: they have no process environment. Only `command` servers are affected.

## Data model

`mcp_servers.overridable_env` (`TEXT`, default `'{}'`), JSON:

```json
{ "DOKPLOY_TOOL_PRESET": { "values": ["minimal", "standard", "full"], "description": "Size of the tool list" } }
```

- `values` is optional. When present, only those strings are accepted. When absent, any string
  that passes the value rules below is accepted.
- `description` is optional text shown in the dashboard.

`oauth_clients.env_overrides` (`TEXT`, default `'{}'`), JSON, keyed by server id:

```json
{ "dokploy": { "DOKPLOY_TOOL_PRESET": "minimal" } }
```

Both columns are added with the existing idempotent `ALTER TABLE` migrations, so existing
databases keep working and behave exactly as before until something is configured.

## Resolving the environment of one connection

For a request to a `command` server, the process environment is built in this order, later
steps winning:

1. **Base environment**: the minimal host environment described under "Process environment".
2. **Server `env_vars`**: set by an admin, may contain secrets.
3. **Client overrides**: `oauth_clients.env_overrides[server]` for the client that owns the
   request's access token. Names that are not (or no longer) in the server's list are skipped
   and logged once per start; they never fail a request.
4. **URL overrides**: every query parameter named `env.NAME`. These are validated strictly:
   an unknown name or an invalid value fails the request with HTTP 400 and
   `{"error":"invalid_env_override","error_description":"DOKPLOY_TOOL_PRESET must be one of: minimal, standard, full"}`.
   It is not ignored silently, so a typo is visible to the person who made it.

Only names present in the server's `overridable_env` take part in steps 3 and 4.

A request authenticated with a static token (no OAuth client) gets step 4 only.

## Validation rules

**Names** must match `^[A-Z][A-Z0-9_]{0,63}$`.

**Hard deny list.** These names can never be listed, even by an admin, because overriding
them amounts to running arbitrary code or changing which code runs:

`PATH`, `HOME`, `SHELL`, `IFS`, `LD_*`, `DYLD_*`, `NODE_OPTIONS`, `NODE_PATH`, `NODE_EXTRA_CA_CERTS`,
`PYTHON*`, `GO*`, `GIT_*`, `UV_*`, `BUN_*`, `NPM_*`, `npm_config_*` (compared case-insensitively),
and the gateway's own settings: `ADMIN_PASSWORD`, `CLIENT_ID`, `CLIENT_SECRET`, `MCP_SERVERS`,
`DB_PATH`, `PUBLIC_URL`, `MCP_PASSTHROUGH_ENV`.

**Names that look like secrets.** Names matching `KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|PASSWD`
(case-insensitive, anywhere in the name) cannot be listed. A value sent in a URL stays in
browser history, proxy logs and bookmarks, so secrets do not belong on this path. This keeps the
first version honest: it is for behaviour switches, not credentials.

**Values** are at most 256 characters with no control characters or newlines, and, when the
entry has `values`, must be one of them.

The dashboard and the API both enforce these rules when a server is saved. A rejected name
comes back with the reason, for example "`PATH` cannot be overridden: it controls which programs run".

## Process isolation

The process session key is `server:token` today. It becomes `server:token:hash`, where `hash`
is a short digest of the sorted, final override set (steps 3 and 4). Two connections that differ
in any override get separate processes; identical ones keep sharing, as now. A token still never
shares a process with another token.

## Process environment

Today a spawned MCP process inherits the whole gateway environment, including `ADMIN_PASSWORD`
and `CLIENT_SECRET`, so any MCP server can read them. This is a security problem in its own right
and is fixed here.

The base environment becomes an allow list of host variables:
`PATH`, `HOME`, `USER`, `LOGNAME`, `SHELL`, `LANG`, `LC_*`, `TZ`, `TMPDIR`, `TERM`,
`SSL_CERT_FILE`, `SSL_CERT_DIR`, `NODE_EXTRA_CA_CERTS`, `HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY`
(and their lower-case forms), plus the cache variables the gateway already sets for uv, Go, Bun and npm.

`MCP_PASSTHROUGH_ENV=NAME_A,NAME_B` (a gateway setting) passes additional host variables through.
It is opt-in and the deny list above still applies to it.

**Compatibility.** A server that quietly relied on an inherited host variable stops seeing it.
The fix is to add the variable to that server's `env_vars` or to `MCP_PASSTHROUGH_ENV`. This is
called out in the README. The dashboard's "Test command" button uses the same environment, so a
broken server shows up before it is saved.

## API

- `POST/PUT /api/admin/servers` accept and validate `overridable_env`.
- `POST/PUT /api/admin/clients` accept and validate `env_overrides` (each value must be valid for
  the named server's entry; unknown servers or names are rejected with a clear error).
- `GET` responses include both fields.
- `/mcp/:server` accepts `env.NAME` query parameters as described above. They are removed before
  the request is forwarded anywhere.

## Dashboard

- **Server dialog (command type):** an "Overridable variables" list: name, valid values
  (comma-separated; empty means free text), description. Inline errors for denied names.
- **Client dialog:** an "Environment overrides" section per server that has overridable variables:
  a select when valid values are listed, a text field otherwise, and a "Default" choice that
  removes the override.
- **Connect dialog:** a URL builder. Pick values, copy
  `https://gateway/mcp/dokploy?env.DOKPLOY_TOOL_PRESET=minimal`.
- Accessibility follows the project rules in `CONTRIBUTING.md` (labelled controls, `Field`,
  `useConfirm`, axe tests for the new dialogs).

## Logging

Each connection that starts a process logs the override names and values (never `env_vars`),
which is safe because secret-looking names cannot be overridable. Rejected overrides are logged
with the reason.

## Testing

- Unit: name rules, deny list, secret-looking names, value rules, enum values, precedence of
  the three layers, unknown names (400 for URL, skipped for client), session key stability and
  separation.
- Unit: the base environment contains none of the gateway's secrets and honours
  `MCP_PASSTHROUGH_ENV` (and refuses deny-listed names there).
- Integration: a tiny stdio MCP process that reports its environment. Connect with different
  overrides and assert `DOKPLOY_TOOL_PRESET` arrives, `ADMIN_PASSWORD` does not, and the two
  connections ran in different processes.
- API: saving a server or client with a bad entry returns the reason.
- UI: the new dialogs render, validate, and pass axe in both themes.

## Risks and open points

- **Query string on the MCP URL.** It is not verified that Gemini keeps the query string on every
  request it makes to the server URL. Per-client overrides exist as the path that does not
  depend on it.
- **Breaking change** for servers that relied on inherited host variables (see above).
- **Values are not secret** by design. If a real need for secret overrides appears, it needs its
  own design (storage encryption, never in URLs, never in logs).
