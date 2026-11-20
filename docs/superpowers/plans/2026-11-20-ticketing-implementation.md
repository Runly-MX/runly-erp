# runly.ticketing implementation plan (F6B-F6E)

Spec: `docs/superpowers/specs/2026-11-20-ticketing-design.md`. Not started; each phase starts only when the previous one
closes and the user asks for it.

| Phase | Scope | Depends on | Closes when |
|---|---|---|---|
| F6B Core | Migration and Prisma models (event, session, type, quota, order, ticket, admission, history, idempotency); manifest `runly.ticketing` (official, core: false), permissions; services: events, sessions on the engine space (`booking_session`), types and quotas; reserve/confirm/cancel for **free** tickets in one transaction with the engine (`createTx`, `source`); credential issue (random secret, SHA-256 at rest), reissue, transfer; outbox events `ticketing.*` (hidden from triggers until F6E); worker hold expiry. | Bookings phases 0-5 | PostgreSQL suite: 50 concurrent buyers for the last 5 seats (type quota and session capacity) issue exactly 5; idempotent retry and reused key 422; cross-company isolation; reissue invalidates the old credential; no contact data in events. |
| F6C Box office and paid tickets | Backoffice screens (events, sessions, types, attendees, taquilla) with `@runly/ui`; paid flow: order `PENDING_PAYMENT` → Caja sale from the order (D2) → server confirmation reading the POS order (`PAID`, lines and amounts match, not linked twice) → issue; refund-then-void cancellation; engine "reduce party size" command (D3). | F6B, D2 (POS read endpoint and Caja `?boletos=`) | Confirmation without a paid order is refused; a paid order cannot issue twice (concurrent confirm); refund required before void; commerce suites (`scripts/test-commerce-current-schema.mjs`) and bookings suites green; browser walkthrough on desktop and phone. |
| F6D Check-in | Admission endpoint (row lock + partial unique index), result reasons, admission window, rate limits per device, check-in screen with the zxing scanner and manual entry, live counters. | F6B | Two simultaneous scans of one QR admit once (PostgreSQL + two browsers); forged/unknown QR uniform rejection; wrong session and outside window rejected; phone camera walkthrough; operator without `ticketing.checkin` refused. |
| F6E Distribution and integration | Public event portal (`/app/p/boletos/<slug>`, free tickets online, paid shown as box office until D1), emails with QR via the outbox, Website block and embeds (bookings phase 4 contracts), calendar projection of sessions, Automations triggers enabled. | F6B-F6D; bookings phase 4 | Portal E2E on phone (book free tickets, receive QR, admit it); embed allowed/blocked by origin; events in Automations without contact data; calendar shows sessions once. |
| Later | Online paid tickets | D1 Commerce online payments (verified webhooks) | Separate spec. |

Ground rules for every phase: one writer per capacity (engine seats, ticket quota counters), idempotency key on every
write, history and outbox in the same transaction, no new availability or payment engine, versioned verification
script per phase, previous bookings verifications re-run when the engine or shared code changes.
