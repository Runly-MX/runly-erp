# Runly MCP Server

## 1. Feature title

Runly MCP server: OAuth-protected Model Context Protocol endpoint for AI clients
(ChatGPT, Claude, MCP Inspector) over official Runly modules.

## 2. Status

Complete (retroactive spec, written 2026-10-16 after implementation). The feature
was built without a spec in this folder; this document records the contract as
shipped plus the 2026-10-16 hardening (trusted-proxy quotas, request-scoped
access cache, quota/activity tables, sliding grant lifetime, per-adapter
sensitivity). Operational detail lives in `docs/integrations/RUNLY_MCP*.md`,
which remain the reference for configuration, tools and verification evidence.

## 3. Context

Users already work with general AI assistants. Runly has MirAI in-app, but no way
for an external assistant to read or change ERP data with the user's identity,
company scope and permissions. MCP is the standard protocol those clients speak.

## 4. Problem

An external AI client cannot safely act on Runly data: there is no delegated
authorization bound to a user and selected companies, no way to keep ERP
permissions authoritative, and no human approval step before writes.

## 5. Goals

1. Expose `/mcp` (Streamable HTTP, stateless, JSON responses) inside the existing
   Hono API, disabled by default and never blocking ERP startup.
2. OAuth 2.1 authorization server: public-client DCR, authorization code + PKCE
   S256, resource indicators, RFC 9207 `iss`, rotating refresh with replay
   revocation, consent per company.
3. Per-domain scopes that never grant more than the user's live ERP permissions.
4. Read tools and two-phase writes (`prepare` -> web approval -> `commit`) for 17
   official modules through their existing services.
5. Users can review, approve, reject and revoke from `/app/mcp`, and see activity.

## 6. Non-goals

1. Deletes, bulk destructive operations, arbitrary SQL, payments, bank or external
   transfers, POS/website/checkout writes, chat message sending.
2. Generic CRUD over RME3 module tables (manifest `mcp.version=1` is discovery only).
3. Server-initiated notifications / standalone SSE stream.
4. Confidential clients, client credentials, CIMD, fixed development tokens.
5. ChatGPT UI components or approval inside the AI client.

## 7. User stories

1. As an ERP user, I want to connect ChatGPT or Claude to Runly so that I can ask
   about my inventory, projects or calendar in natural language.
2. As an ERP user, I want to choose which companies and modules a connection can
   use so that an assistant only sees what I allowed.
3. As an ERP user, I want every change an assistant proposes to wait for my
   approval in Runly so that nothing is written without me.
4. As an ERP user, I want to see and revoke connections and their activity so
   that I stay in control.

## 8. UX requirements

1. `/app/mcp?request=<id>`: consent screen with client name (marked unverified),
   redirect host, grouped scope matrix (read/changes), company selection with
   branding; "Autorizar" and "Rechazar".
2. `/app/mcp?proposal=<id>`: proposal review with before/after fields, effects and
   recipients; sensitive proposals require an explicit confirmation checkbox.
3. `/app/mcp` tabs "Conexiones", "Actividad", "Aprobaciones". Connections are
   accordion items with last activity, module/company counts, expiry badge when
   7 days or fewer remain ("Vence en N días"), an expiry notice and "Revocar"
   behind a `ConfirmDialog`.
4. All UI text in Spanish; `@runly/ui` components only.

## 9. Routes/screens

- `/app/mcp` — `McpConnectionScreen.jsx` (+ `McpConnectionParts.jsx`,
  `McpActivityParts.jsx`). Public-to-session route outside module navigation.

## 10. Data model

- `mcp_state`: key (SHA-256 of the secret/identifier), kind, payload jsonb,
  counter, expires_at, created_at. Kinds: `client` (1 year), `request` (10 min),
  `code` (2 min, single use), `grant` (sliding 30 days, max 180 days from
  consent), `access` (15 min), `refresh` (never outlives its grant), `proposal`
  (10 min; versions 1 inventory, 2 domains, 3 file import).
- `mcp_rate` (UNLOGGED): key, counter, expires_at — per-minute quota buckets.
- `mcp_activity`: auth_user_id, grant_id, type (`tool`/`approval`), client_name,
  tool, module_key, mode, operation, company_id, status, created_at; 30-day
  retention; never stores inputs or results.

## 11. Prisma impact

Models `McpState`, `McpRate`, `McpActivity`. Migrations
`20261016120000_runly_mcp` and `20261030000000_mcp_rate_activity` (additive; the
second moves activity rows out of `mcp_state`). RLS enabled, no policies,
privileges revoked from `anon`/`authenticated`.

## 12. API contract

- `GET /.well-known/oauth-protected-resource[/mcp]`, `GET /.well-known/oauth-authorization-server`
- `POST /mcp/oauth/register` (JSON, public clients, 10/min per client)
- `GET /mcp/oauth/authorize` -> 302 to `/app/mcp?request=<id>`
- `GET /mcp/oauth/request/:id`; `POST /mcp/oauth/consent` (web session)
- `POST /mcp/oauth/token`, `POST /mcp/oauth/revoke` (form-encoded)
- `GET /mcp/account`, `GET /mcp/account/activity`, `POST /mcp/account/revoke` (web session)
- `GET|POST /mcp/proposals/:id` (web session; POST `{ approve, acknowledgeSensitive? }`)
- `POST /mcp` (MCP bearer only; Supabase JWTs rejected). 50 tools; catalog in
  `docs/integrations/RUNLY_MCP_CATALOG.md`.
- Errors: OAuth `{ error, error_description, correlationId }`; tool errors
  `isError` with `{ code, message, correlationId }`. Codes listed in
  `RUNLY_MCP.md` "Revocación y diagnóstico".

## 13. SDK contract

None. The desktop screen calls `/mcp/*` with origin-relative fetches.

## 14. Validator contract

None in `@runly/validators`; MCP schemas are local Zod contracts in
`apps/api/src/mcp/contracts.js` and adapters reuse existing domain schemas.

## 15. Module manifest impact

Optional `manifest.mcp` (version 1, up to 30 entities, typed fields, permission
per entity) for RME3 discovery only. No official manifest changes.

## 16. Navigation impact

None.

## 17. Blueprint impact

None.

## 18. RBAC/permissions

Scopes: `runly:read`, `<domain>:read`, `<domain>:write`, `files:write` (list in
`apps/api/src/mcp/config.js`). Each tool also requires the module's manifest ACL,
the operation permission and, for writes, its read permission; individual ACLs
(projects, calendar, ledger accounts, notes) stay with each service.

## 19. Multi-company behavior

A grant lists consented company IDs. Every call re-checks the company is granted,
the membership/profile/role is active, and the module is enabled for that company.
Proposals bind user, company, grant, module and operation.

## 20. Files/storage impact

`runly_files_import_prepare/commit` copy client-provided originals into Runly
storage and attach them to 27 targets; details in `RUNLY_MCP_FILES.md`.

## 21. Export/import requirements

None beyond file import.

## 22. Audit log requirements

Commits write `AuditLog` with action `mcp.<operation>` (`inventory.mcp.<action>`
for inventory), actor profile, `metadata: { proposalHash, clientId }`, `after`
result. Activity (who/what/when/outcome) goes to `mcp_activity`.

## 23. Edge cases

1. Refresh token reuse revokes the whole grant.
2. Concurrent commits of one proposal produce one write and the same result.
3. Resource changed between prepare and commit -> `proposal_stale`.
4. Permission or membership removed after consent -> denied on next call.
5. Forged `X-Forwarded-For` from an untrusted peer is ignored for quotas.
6. Grant at its 180-day cap is not extended by refresh.

## 24. Risks

1. Prompt injection through record contents — server instructions mark data as
   untrusted; writes need web approval; no destructive tools.
2. Approval fatigue — sensitive proposals require explicit acknowledgement;
   adapters declare `sensitive` explicitly (registry rejects omissions).
3. Shared quotas behind proxies — `RUNLY_MCP_TRUSTED_PROXIES`.
4. Client/spec drift (Inspector, ChatGPT, Claude) — compatibility audit in
   `RUNLY_MCP_OAUTH_COMPATIBILITY.md`; real-client verification still pending.

## 25. Acceptance criteria

1. Given MCP disabled or misconfigured, when the API boots, then `/mcp` is not
   mounted and the ERP starts.
2. Given a valid token without `hr:read`, when `runly_hr_query` is called, then
   the tool is not listed and calls fail with `insufficient_scope`.
3. Given a prepared proposal, when commit is called before web approval, then it
   fails with `approval_required` and nothing is written.
4. Given an approved sensitive proposal without acknowledgement, when approving,
   then it fails with `confirmation_required`.
5. Given a used connection, when refresh happens on day 29, then the grant
   expires 30 days later, never beyond 180 days after consent.
6. Given `runly_inventory_search`, when called once, then it issues at most 15
   database operations.

## 26. Verification plan

`pnpm test:mcp` (ephemeral PostgreSQL 18, real migrations, official SDK, optional
Inspector with `RUNLY_MCP_TEST_INSPECTOR=true`), MCP unit tests
(`node --test apps/api/src/mcp/__tests__/*.test.js`), MCP browser test with
`RUNLY_BROWSER_TEST_MODULE`, `pnpm lint`, `pnpm check:privacy`,
`pnpm --filter @runly/desktop build:web`. Evidence in `RUNLY_MCP_VERIFICATION.md`.
Pending: deployed HTTPS instance with real ChatGPT and Claude accounts.

## 27. Rollback plan

Set `RUNLY_MCP_ENABLED=false` and restart the API: routes are not mounted, data
is untouched. Tables are additive; no rollback migration is needed. Reverting the
code without dropping `mcp_rate`/`mcp_activity` is safe.

## 28. Future enhancements

1. In-client approval via MCP elicitation where clients support it.
2. MCP Resources/Prompts (schemas, catalogs, guided flows).
3. Tool loading per domain to reduce client context.
4. RME3 capability contract v2 with reviewed adapters.
5. Company-level admin view of connections and usage.
6. Read-only Growth/Catalog/POS queries.
