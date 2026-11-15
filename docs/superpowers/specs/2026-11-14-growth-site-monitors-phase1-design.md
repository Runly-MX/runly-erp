# Growth site monitors, phase 1 (uptime + SSL) - design

Date: 2026-11-14
Status: draft, derived from the approved overall plan (active monitoring of sites in Growth). Awaiting review before the implementation plan.

## Problem

`runly.growth` only watches properties passively: `growth-property-health-worker.js`
flags a `GrowthProperty` as `inactive` after 48 h without SDK events, checked hourly.
It never contacts the site, so a fully down site, an expired SSL certificate or a dead
backend goes unnoticed for days, and there is no incident history.

## Goals (phase 1)

- Actively check each connected property from the Runly instance: HTTP availability,
  latency and SSL certificate validity/expiry.
- Work with only a URL, so it covers third-party sites where there is no code access
  (for example a client store).
- Open and close incidents with history; notify managers on down, recovery and SSL expiry.
- Minimal "Monitores" screen in Growth.

## Non-goals (later phases, see overall plan)

`api`, `keyword`, `heartbeat`, `domain` (RDAP), `tcp`, `dns` checks, platform
autodetection, browser (Playwright) checks, SDK real-user failure reporting,
Automation Studio triggers, Home widget, MirAI/MCP exposure, public status page,
multi-region.

## Design

### Data (new forward migration, UUID v7, no edits to old migrations)

- `GrowthMonitor`: `id`, `companyId`, `propertyId`, `type` (`http` | `ssl`), `name`,
  `config` Json (`url`, `method` GET|HEAD, `expectedStatus` list or range, `timeoutMs`,
  `maxLatencyMs`, `warnDays` for ssl), `intervalSeconds` (60-3600, default 300),
  `enabled`, `status` (`unknown` | `up` | `down` | `degraded` | `paused`),
  `consecutiveFailures`, `lastCheckedAt`, `lastChangeAt`, `lastError`, timestamps.
- `GrowthMonitorCheck`: `id`, `monitorId`, `companyId`, `checkedAt`, `ok`, `statusCode`,
  `latencyMs`, `error`, `detail` Json (for ssl: `daysLeft`, `validTo`, `issuer`).
  Retention: delete rows older than `RUNLY_GROWTH_MONITOR_RETENTION_DAYS` (default 30),
  pruned by the same worker once per day.
- `GrowthIncident`: `id`, `companyId`, `monitorId`, `startedAt`, `resolvedAt`, `cause`,
  `lastNotifiedAt`.
- Index `GrowthMonitor(enabled, lastCheckedAt)` for the due query; index
  `GrowthMonitorCheck(monitorId, checkedAt desc)`.
- Creating a property from the Growth connect flow auto-creates one `http` and one `ssl`
  monitor for `https://<domain>/` (user can disable or edit them).

### Engine (`apps/api/src/services/growth-monitor-service.js`, `growth-monitor-worker.js`)

- Pure evaluator `evaluateHttpCheck(result, config)` and `evaluateSslCheck(result, config)`
  (unit-testable, no I/O) return `{ ok, state, error }`.
- Probe functions take injected `transport`/`resolveHost` (same pattern as
  `createAutomationHttpService`) so tests need no network.
- SSRF guard: reuse `isPublicAddress` exported from `automation-http-service.js`.
  Resolve the host first, reject non-public addresses (loopback, private, link-local,
  metadata), connect to the resolved IP, cap redirects (max 3, each revalidated), cap body
  read (64 KB, we only need status/headers), enforce timeout. Only `http`/`https`.
- SSL probe: TLS connect to host:443 with SNI, read peer certificate (`valid_to`,
  `issuer`, authorization error). Down if handshake fails, certificate invalid, hostname
  mismatch or expired; `degraded` (warn) when `daysLeft <= warnDays`.
- Worker tick every 30 s (`RUNLY_GROWTH_MONITOR_TICK_MS`): select due monitors with
  `FOR UPDATE SKIP LOCKED` in a short transaction, mark `lastCheckedAt`, run with a
  concurrency of 10. One failure is retried immediately once; `consecutiveFailures`
  reaches the threshold (default 2) before the monitor goes `down` and an incident opens.
  First success closes the incident and sets `up`.
- Control check: if every due monitor in a tick fails and a control resolve of a public
  host also fails, treat the tick as a local network outage and do not change state
  (avoids mass false alerts).
- `GrowthProperty.status` stays as is; the passive inactivity logic is unchanged. A
  property with a `down` monitor shows as down in the Monitores screen only (deriving
  `GrowthProperty.status` is deferred to avoid changing existing semantics).

### Alerts

`notificationService.publish` with `eventType` `growth.monitor.down`,
`growth.monitor.recovered`, `growth.monitor.ssl_expiring`, channels `in_app` + `email`,
recipients resolved with the same manager lookup as the health worker (extract
`resolveManagerUserIds` to a shared helper in `lib/`, keep behavior identical). Down
reminders every 60 min while the incident is open (`lastNotifiedAt`). SSL expiring is
notified once per threshold (30/14/7/3/1 days).

### API (`apps/api/src/routes/growth/growth-monitor-routes.js`, thin; logic in service)

- `GET /growth/monitors?propertyId=` list with status, 24 h and 30 d uptime, latest latency.
- `POST /growth/monitors`, `PATCH /growth/monitors/:id`, `DELETE` (soft: `enabled:false`).
- `POST /growth/monitors/:id/check` run now (rate limited, same SSRF guard).
- `GET /growth/monitors/:id/checks?from=&to=` and `GET /growth/incidents?propertyId=`.
- Permission `growth.properties.manage` for writes, `growth.properties.view`-equivalent
  existing read permission for reads; Zod schemas in `@runly/validators`; scoped by
  `companyId` like the other growth routes. SDK group `growth.monitors` in `@runly/sdk`.

### UI (`apps/desktop/src/modules/runly.growth/screens/GrowthMonitorsScreen.jsx`)

Spanish text, `PageHeader`, `RunlyTable`, `Dialog` with `DialogHeader` icon (md+),
`EmptyState`/`ErrorState`, `ConfirmDialog` for delete. List per property with status
badge, uptime %, latency, SSL days left; detail drawer with last checks and incident
timeline; "Probar ahora" button; edit dialog (URL, interval, expected status). Navigation
entry in the growth manifest. Files kept under 800 lines.

## Security

- SSRF is the main risk: server fetches user-supplied URLs. Guard described above,
  covered by tests (private IPs, DNS rebinding via resolve-then-connect, redirect to
  internal host, non-http schemes).
- No credentials stored in phase 1 (no headers/secrets); added with `api` checks later
  with encryption at rest.
- "Probar ahora" and creation are rate limited per company to prevent using the instance
  as a request cannon.

## Testing

- `node --test` unit tests for evaluators (thresholds, retry, hysteresis, SSL days).
- SSRF guard tests with injected resolver and transport.
- Worker test with a fake clock and fake prisma: due selection, single incident per
  outage, recovery closes it, reminder cadence, control-check suppression.
- Local E2E: a throwaway local server toggled up/down/slow plus a self-signed and an
  expired certificate (localhost is blocked by the guard, so the E2E uses an explicit
  test-only allowlist env flag, disabled by default and rejected when
  `NODE_ENV=production`).
- `pnpm lint` and the UI audit checklist for the new screen.

## Migration

One additive Prisma migration creating the three tables. No change to existing tables.
Existing properties get default monitors created lazily on first visit to Monitores
(idempotent), not in the migration.

## Open points

- Default interval and retention values (300 s, 30 days) are proposals.
- Whether to expose monitors to the existing `growth` MirAI capability now or in phase 4
  (plan says phase 4).
