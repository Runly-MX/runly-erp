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
