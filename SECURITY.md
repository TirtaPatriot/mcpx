# Security Policy

mcpx sits in front of MCP servers and issues OAuth tokens, so security reports are taken seriously.

## Reporting a vulnerability

Please **do not open a public issue**. Report it privately through GitHub:
<https://github.com/ekoeryanto/mcpx/security/advisories/new>

Include what you found, how to reproduce it, and the impact you expect. You should get a first reply within a few days.

## Supported versions

Only the latest commit on `main` is supported.

## Deployment notes

- Set `ADMIN_PASSWORD`, or copy the random password printed in the log on first start, and change it in **Settings**.
- Serve the gateway over HTTPS and set `PUBLIC_URL` to its public origin.
- Keep `data/` (SQLite database with tokens and client secrets) out of version control and backups you do not trust.
- Keep `ALLOWED_REDIRECT_HOSTS` as small as you can.
