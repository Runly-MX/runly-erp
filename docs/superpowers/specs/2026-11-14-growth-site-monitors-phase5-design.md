# Growth site monitors, phase 5 (public status page, real-user errors) - design

Date: 2026-11-14
Status: part A (status page) shipped; part B (real-user error reporting) follows in this document.

## A. Public status page (shipped)

Per site, opt-in, unguessable slug (`growth_status_page`, 9 random bytes base64url).
Authenticated management under `/growth/status-pages` (read: `growth.access`, write:
`growth.properties.manage`). Public `GET /public/status/:slug` (no auth, `Cache-Control:
public, max-age=30`, 120 requests/minute per slug) answers the same 404 for unknown,
disabled or malformed slugs.

The payload is deliberately small: page title, overall status (worst of the live
monitors; a monitor in maintenance only wins when nothing else is known), each monitor's
name, a generic kind label, status and 30-day uptime, and the last 10 incidents (monitor
name, start, end, minutes). It never includes URLs, hosts, tokens, headers, raw errors or
internal ids. Regenerating the slug kills the old link at once.

UI: public screen at `/app/p/status/:slug` (no shell, light/dark, phone-safe) and a
"Pagina de estado" dialog in Monitores to publish, title, copy and rotate the link.

## B. Real-user error reporting (SDK, opt-in)

Opt-in only: `window.RUNLY_CONFIG.captureErrors = true` in the snippet of
"Sitios conectados" (checkbox with a plain-language privacy note). It lives in the
embeddable `apps/api/src/public/runly-sdk.js`; the npm package is not covered.

What is captured: failed calls the page makes to its own backend (HTTP 5xx or a network
failure) through `fetch` and `XMLHttpRequest`, reported as the analytics event
`client_error` with `host`, `apiPath`, `status` and `kind` (`http` | `network`). The path
has no query string and numeric/UUID segments become `:id`. Bodies, headers and query
strings are never read. "Own backend" means the page host, hosts sharing its last two
labels, or `captureErrorsHosts`; third-party hosts, Runly's own calls and aborted requests
are ignored. At most one report per host+path+status per minute per page and 20 per
minute (a `shortcut` comment notes the two-label rule misreads suffixes such as `.com.mx`).

It goes through `track()`, so the property's analytics mode, visitor consent and Do Not
Track still decide whether anything is sent. Because analytics must be running for the
event to travel, `captureErrors` also starts analytics (previously only `analyticsMode`
did); the snippet checkbox says so.

Server: `GET /growth/real-errors?propertyId&hours` (permission `growth.access`) groups
`client_error` events by site, host, path, status and kind for the last 24 h (max 168 h),
with report count, distinct visitors (sessions) and last seen. No new table.

UI: "Errores reales de visitantes" section in Monitores. The count is reports, not raw
failures, because of the per-minute dedupe.

Not included: alerts on error spikes, the npm SDK, and turning a route into a monitor.

## Testing

Unit (embed harness, vm): masked path/no query/no body, third-party and own calls ignored,
duplicates collapse, off by default, denied consent sends nothing. E2E in a real browser
(Playwright) with a local page that loads the real embedded script from the dev API: off by
default, grouped by masked route, login failure separate, site name and visitor count, and
no secrets stored. E2E found two real defects before shipping: a variable out of scope in
the embed, and that analytics never started for snippet-connected sites without
`analyticsMode`.
