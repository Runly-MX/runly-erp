# Growth site monitors, phase 2 (API, content, heartbeat, guided connection) - design

Date: 2026-11-14
Status: draft, continues `2026-11-14-growth-site-monitors-phase1-design.md` (phase 1 shipped: `http` and `ssl`).

## Problem

Phase 1 detects a site that is down or has an expiring certificate. It cannot tell that
a page returns 200 but is broken, that a backend/API/login is down behind a healthy
frontend, or that a worker/cron without a public URL stopped. Setting monitors up is also
manual: the user must know which URLs to watch. Many sites are third-party (no code
access), so everything must work from a URL alone, with code-level options only as extras.

## Goals

- New check types: `keyword`, `api`, `heartbeat`.
- Optional request headers for `api` checks, stored encrypted.
- Autodiscovery from a URL: detect the platform and propose checks.
- Guided connection: templates by site type, plus copy-paste snippets (curl, crontab) and
  an "AI prompt" to add a health endpoint to one's own project.

## Non-goals (later)

`domain` (RDAP), `tcp`, `dns`, maintenance windows, Automation Studio triggers, Home widget,
MirAI/MCP exposure, browser-based checks, SDK real-user failure reporting, the installable
health package for frameworks (phase 2b once the snippets prove useful).

## Design

### Probe changes (`growth-monitor-probes.js`)

`probeHttp` accepts `method` (GET|HEAD|POST), `headers`, `body` and `readBody`. When
`readBody` is set it reads at most 256 KB of the response (no more) and returns `body`
text. Redirect, SSRF and timeout rules are unchanged. Headers named by the user cannot
override `host`. POST bodies are capped at 8 KB.

### Check types

- `keyword`: http check on `url` that also requires `mustContain` (text) present and/or
  `mustNotContain` absent in the body. Case-insensitive. Failure reason names the missing text.
- `api`: `url`, `method` (GET|POST|HEAD), optional JSON `body`, optional `headers`
  (values encrypted), `expectedMin/Max` status, optional JSON assertion
  `{ path: "data.ok", equals: true }` (dot path, strict equality). Template presets:
  "Login responde" (POST with invalid credentials, expected 400-401), "API viva"
  (GET a route that must answer 200 or 401), "Servidor MCP" (JSON-RPC `initialize`, assert
  `result.protocolVersion` exists).
- `heartbeat`: the monitored system calls `GET|POST /public/monitor/ping/:token`. The
  monitor is `down` when no ping arrives within `intervalSeconds + graceSeconds` (default
  grace 60). Token is 32 random bytes (base64url); only its SHA-256 hash is stored
  (`config.tokenHash`); the full URL is shown once at creation and on explicit
  "Regenerar". The worker evaluates heartbeat monitors by `lastPingAt` and never probes.
  The ping route is public, constant-time compares hashes, rate limits by token and answers
  the same body for unknown tokens (no enumeration).

### Data

One additive migration: `growth_monitor.last_ping_at TIMESTAMP(3) NULL`. Header secrets live
in `config.headers` as `{ name, valueEnc }`; the API never returns `valueEnc`, only
`{ name, set: true }`. Reuse `encryptPassword`/`decryptPassword` from `smtp-service.js` (same
as Turnstile secrets). Evaluators gain `evaluateKeywordCheck`, `evaluateApiCheck`,
`evaluateHeartbeat`, all pure and unit tested.

### Autodiscovery (`POST /growth/monitors/discover`, permission `growth.properties.manage`)

Input `{ url }`. Through the same SSRF-guarded fetcher: GET the page (body up to 256 KB),
read headers and HTML to detect the platform (Shopify, WooCommerce/WordPress, Wix,
Tiendanube, Squarespace, Next.js/Vercel, generic), then probe a short fixed list of
candidate paths with a hard cap (max 12 requests, 3 s each, sequential per host):
`/health`, `/api/health`, `/healthz`, `/login`, `/my-account`, `/account/login`,
`/wp-json`, `/products.json`, `/cart`, `/robots.txt`. Returns detected platform and a list
of suggestions `{ type, name, config, reason }` only for paths that answered. Rate limited
like "check now". Best effort; the user confirms which suggestions to create.

### Guided connection (UI)

- `MonitorDialog` becomes a two-step wizard "Conectar un sitio": (1) pick the site and type
  of site: "Solo pagina web", "Pagina web con API", "Ecosistema completo" (adds heartbeat
  guidance); (2) paste URL, press "Detectar", review suggested monitors with checkboxes,
  create. Manual single-monitor creation stays available.
- Heartbeat monitors show a "Conexion" panel after creation (and via "Ver conexion"):
  the ping URL, a `curl` line, a crontab line, a short Node `fetch` example and a
  "Copiar prompt para tu IA" text that asks an assistant to add a `/health` route or ping
  call to the user's project (prompt includes the URL placeholder, no secrets).
- All text Spanish, `@runly/ui` components, `Dialog` md+ with `DialogHeader` icon, fixed
  header/footer with scrolling body.

### Security

- Header values and the heartbeat token are secrets: encrypted or hashed, never logged,
  never returned, never in notification bodies. Error messages from probes must not echo
  header values.
- Discovery and `api` checks are SSRF-guarded exactly like phase 1.
- Login-style checks never carry real credentials: the preset sends obviously invalid
  ones. A real account for flow checks is out of scope.
- Heartbeat endpoint: no auth by design, so it only updates `lastPingAt` for a matching
  hash and nothing else.

## Testing

- Evaluator unit tests for keyword, api assertions (path/equals, status ranges) and heartbeat
  (grace, never pinged).
- Probe tests: body cap, POST body cap, header handling, SSRF still enforced with bodies.
- Heartbeat route test: valid token updates `lastPingAt`, unknown token answers identically,
  hash compare.
- Discovery test with injected transport: platform detection and request cap.
- Local E2E on the test company: keyword fails on missing text, api JSON assertion, heartbeat
  down after silence and recovery after a ping, discovery against a local fixture server
  (allow-private flag) and against a real public site.

## Migration

`ALTER TABLE growth_monitor ADD COLUMN last_ping_at`. No changes to phase 1 data.

## Open points

- Candidate path list and platform signatures are a starting set; revise with real sites.
- Whether heartbeat grace should be configurable per monitor in the UI (proposed: yes,
  advanced field).
