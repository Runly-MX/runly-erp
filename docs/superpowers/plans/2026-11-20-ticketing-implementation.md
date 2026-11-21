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

## F6B status (2026-11-21): closed

- Migration `20270110000000_ticketing_core` (9 `ticket_*` tables, composite company foreign keys, quota and credential
  CHECKs, append-only `ticket_history`, RLS with client roles revoked) and the matching Prisma models.
- `runly.ticketing` manifest (official, `core: false`, installed from the catalog; no navigation until F6C) and
  permissions `ticketing.access|events.manage|checkin|admin`.
- API `apps/api/src/routes/ticketing/`: events (each with its own booking space and session service), functions via
  the engine's new `createSessionTx`, types and quotas, `POST /ticketing/orders` (free: issued with credentials; paid:
  `PENDING_PAYMENT` hold until F6C confirms it), cancel (free or unpaid), reissue, transfer, credential check
  (service only; admission is F6D). Worker expires unpaid holds.
- Outbox `ticketing.order.created|cancelled|expired`, `ticketing.ticket.reissued|transferred` without personal data,
  hidden from trigger pickers (`HIDDEN_PREFIXES`) until F6E. Ticket bookings are skipped by the calendar mirror.
- Credential decision: the QR secret is returned only in the response that creates it (issue, reissue, transfer);
  an idempotent replay returns the order without secrets. Resending an existing QR by email (F6E) therefore needs a
  reissue or a stored encrypted copy; to be decided in F6E.
- Verification: `node scripts/verify-ticketing-core.mjs` (disposable stack, real auth): 21/21 on 2026-11-21, including
  the ticketing PostgreSQL suite (11/11: 50 buyers for the last 5 room seats and for the last 5 of a type quota issue
  exactly 5, idempotent replay and concurrent duplicate, reused key 422, forced failure leaves nothing, cross-company
  isolation, reissue/transfer invalidate earlier QRs, no personal data in events, hold expiry once) and the Booking
  Engine regression suites (40/40), plus 50 concurrent HTTP buyers for the last 5 seats (5 x 201, 45 x 409).

## F6C status (2026-11-21)

- Shared contracts: engine `reducePartyTx` (D3); `booking_space.owner_module/owner_id` (migration
  `20270110100000_ticketing_box_office`): event spaces are read-only in Reservaciones (409 `MANAGED_SPACE` on every
  agent/admin route) and link back to the event; POS `pos-sale-read.js` (D2, read-only, can lock the sale row).
- Paid flow: reserve snapshots catalog price and currency; Caja opens with `?boletos=<order>`, loads the products and,
  once PAID, calls `confirm-payment`; the server reads the sale (same company, PAID, no refunds or discounts, not linked
  to another order, products, quantities, unit prices and currency equal to the snapshot), locks it and issues once.
  `payment-candidates` recovers an interrupted confirmation from the order page. Expired holds are refused
  (`HOLD_EXPIRED`): the cashier refunds.
- Cancellation: some tickets or the whole order. Free tickets cancel directly; paid ones need a Commerce refund of
  their lines (refunded quantity minus tickets already voided against it); seats freed through `reducePartyTx`; the
  order ends `CANCELLED` or `REFUNDED`. Unpaid orders cancel whole (their snapshot must keep matching the sale).
- Backoffice "Boletos" (`apps/desktop/src/modules/runly.ticketing`): Mis eventos, full-page event editor, event tabs
  (Resumen with sold/held/free per function, Funciones, Boletos with quotas per function, Taquilla, Órdenes y
  asistentes, Equipo), order page (partial cancel, reissue, transfer, confirm with a found sale, history). Launcher
  entry "Eventos" now that screens exist.

### QR delivery: resend is not reissue (decision for F6D/F6E)

- **Reissue** (built): new random secret, `credential_version + 1`; every earlier copy stops validating. For a lost
  or leaked QR, or after a transfer.
- **Resend** (F6E): send the *same, still valid* QR again (customer deleted the email). Only the SHA-256 is stored,
  so the plaintext cannot be rebuilt. F6E stores, per ticket version, the secret encrypted with AES-256-GCM under a
  server key outside the database (`TICKETING_CREDENTIAL_KEY`, key id kept with the ciphertext for rotation). Only the
  outbox mail worker decrypts it, to render the email; no API ever returns it, and validation (F6D) keeps comparing
  hashes. A database leak alone still yields no valid QR. Reissue drops the old ciphertext with the old hash.
- Until F6E, staff hand over QRs when they are created (dialog with print); a lost QR is reissued.

Ground rules for every phase: one writer per capacity (engine seats, ticket quota counters), idempotency key on every
write, history and outbox in the same transaction, no new availability or payment engine, versioned verification
script per phase, previous bookings verifications re-run when the engine or shared code changes.
