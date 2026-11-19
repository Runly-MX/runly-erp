# runly.bookings phase 3: Booking Portal and self-scheduling

Spec: `docs/superpowers/specs/2026-11-18-bookings-engine-design.md` (decisions in 7.3).
Scope: public portal, manage links, customer emails, hold expiry and the publication panel. No POS, Website,
Calendar, Studio, payments or ticketing changes.

## Tasks

- [x] 1. Migration `20270108200000_bookings_portal`: `booking_page`, booking reference/page/acceptance/manage-link
  columns, `booking_notification` outbox, pending-hold index; Prisma models.
- [x] 2. Engine: manage link issue/rotation (`bookings-links.js`), outbox writes per transition, customer cut-offs,
  portal idempotency scope, `expireAllHolds`; validators without PATCH defaults.
- [x] 3. Public API `/public/bookings/*` (`bookings-portal-service.js`, `bookings-public-routes.js`): page,
  availability, create, manage, manage availability, cancel, reschedule; rate limits, origin guard, honeypot.
- [x] 4. Admin API: pages CRUD, preview link, manage-link rotation; worker tick for emails and expiry.
- [x] 5. UI: portal (`/app/p/reservar/:slug`) and manage screen (`/app/p/reservar/gestion#token`), "Reservas online"
  tab, cut-offs in Configuración, "Enviar nuevo enlace" in the reservation detail.
- [x] 6. Versioned verification: `node scripts/verify-bookings-portal.mjs` boots a disposable full stack
  (`scripts/fixtures/bookings/bookings-stack.mjs`), runs every bookings PostgreSQL suite on it and the browser journeys.

## Evidence (2026-11-19, `node scripts/verify-bookings-portal.mjs`: 35/35, exit 0)

PostgreSQL suites on the stack database: 22/22 (engine 10, backoffice 2, portal 6, slots 4).
Validators: `bookings-validators.test.js` 2/2.

| Brief item | Result |
|---|---|
| 1. A company publishes a space | admin switches "Publicar este sistema" and creates a published page from the backoffice |
| 2. Opens without a session | `/app/p/reservar/<slug>` renders the page, no login redirect |
| 3-4. Real services and availability, date and time | week strip and times from the engine |
| 5-6. Details and policies | confirming without accepting is blocked |
| 7-8. Real booking, correct status | "Reservación confirmada" with folio; engine holds a `portal` booking with one resource; with approval required, "Solicitud recibida: pendiente de confirmación" |
| 9. Manage link | opens the booking; the token stays in the URL fragment |
| 10. Reschedule | moved to another free time by the engine |
| 11. Cancel | resource freed |
| 12. Backoffice | admin sees the booking cancelled and "Cliente (portal)" in its history |

| Security and integrity | Where | Result |
|---|---|---|
| Unpublished page / space refuses bookings; preview is read-only; forged preview refused | portal suite + browser | 404 |
| Last slot race (12 customers) / session capacity (8 for 3 seats) | portal suite | 1 / 3 bookings |
| Invalid, malformed, rotated and expired tokens | portal suite | 404 |
| Cancel and reschedule cut-offs on the server | portal suite | `POLICY_WINDOW_CLOSED` / not offered |
| Cross-company service or resource through a page | portal suite | refused |
| No enumeration: availability carries only times; no internal ids | portal suite | verified |
| Retries do not duplicate (same key) and a lost response retried in the browser | portal suite + browser | one booking |
| DST | portal suite | New York spring-forward day lists only real hours |
| Hold expiry, three concurrent sweeps | portal suite + browser | expired once, resources freed |
| Outbox: once per event, concurrent workers send once, retry with backoff, no SMTP = skipped | portal suite + browser | verified; emailed link opens the booking |
| Rate limit, honeypot, foreign origin | portal suite + browser | 429 / 400 / 403 |

Browser: desktop light and phone dark, no horizontal overflow, no page errors or 5xx. The real browser found two
defects fixed in this phase: the CORS allow-list lacked `X-Booking-Token`, and switches without `id` had no
accessible name.

Inherited failures, unchanged (see phase 2): `pwa-identities`, `storefront-capture-foundation-contract`,
`growth-domain`, `sdk-website-domain`, `marketplace-browser`. `pnpm check:privacy`: the same 23 inherited findings.

## Closing criteria

Met on 2026-11-19: a test customer completed book, confirm or pending, view, reschedule and cancel from the public
portal without signing in, with integrity and privacy checks passing on real PostgreSQL.
