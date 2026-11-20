# runly.ticketing (Boletos): architecture and design (F6A)

Date: 2026-11-20
Status: design for review. Implementation (F6B-F6E) starts only when approved; nothing here is built yet.
Plan: `docs/superpowers/plans/2026-11-20-ticketing-implementation.md`.

## 1. Goal

An official native module, `runly.ticketing` (UI name "Boletos"), complementary to `runly.bookings`: events with
sessions (functions), ticket types and quotas, free and paid tickets, issued tickets with QR, and admission control.
It adds no availability engine and no payment engine:

- **Time and shared capacity** of a session (room, stage, staff) stay in the Booking Engine.
- **Money** stays in Commerce: POS orders and payments (and, later, a verified online payment contract).
- **Ticketing owns** what is specific to admission: ticket types, quotas per type, the right to enter (the ticket),
  its holder, its QR credential, admission scans and their audit.

Not RME3: Prisma models + forward migrations, manifest in `apps/api/src/manifests/official/`, routes in
`apps/api/src/routes/ticketing/`, screens in `apps/desktop/src/modules/runly.ticketing/`, same as `runly.bookings`.

## 2. Audit of the contracts it builds on (working tree, 2026-11-20)

| Area | What exists | Consequence |
|---|---|---|
| Booking Engine | `booking_session` (scheduled occurrences with `capacity`, `seats_taken` updated by one conditional UPDATE), `booking_allocation` with the exclusion constraint (a session with a resource occupies it), spaces with IANA zone, policies, members and roles, `booking_page` portal, idempotency table, outbox events, calendar projection, `createTx/transitionTx` inside a caller's transaction with `sideEffect`. | A ticketed session **is** a booking session: Ticketing never counts seats on its own; it takes seats through the engine in its own transaction. |
| POS / Commerce | POS orders and payments recorded by staff (Caja, comandero); `PAID` is a server state reached only by captured payments (`pos-recovery-*`, `pos_payment`, refunds, cash sessions). Appointments already use "charge in Caja, then the server checks the order is PAID before closing" (`pos-appointment-service.setStatus`). Catalog products have price/currency; order lines snapshot price. | Paid tickets in v1 are charged in Caja; the server issues them only after reading the POS order as `PAID` (never on a browser's word). |
| Online payments | Website `POST /public/website/checkout` creates a Stripe Checkout session with server-side prices **but records no order and has no webhook**: nothing in Runly learns that a payment succeeded. | There is no trustworthy online-payment confirmation today. Paid online tickets depend on a Commerce capability to be built first (section 9, dependency D1). |
| Contacts | `contact` with company scope; bookings link `contact_id` and keep minimal guest fields. | Ticket orders link a contact optionally; holders are minimal fields per ticket. |
| Website | Native blocks with publication-time binding (`dynamic` + pinned URLs), portal embeds via `?embed=1` + frame policy (bookings phase 4). | Event pages reuse the same block/embed pattern; no new publication mechanism. |
| Calendar | Projection pattern (`bookings-calendar.js`): from current rows, versioned, one calendar per space, no contact data. | Sessions project as events; tickets do not (attendees are not calendar data). |
| Automations | `domain_event_outbox` written in the transaction, `EVENT_CATALOG` with documented fields, at-least-once dispatcher, system automations dedupe by event id. | Ticketing publishes `ticketing.*` events the same way, without contact data. |
| Identity / permissions | Permission catalog keys, company-scoped tenant context, per-space roles in bookings, company admins. | Event-level roles mirror the bookings space roles; check-in is a separate permission. |
| QR / tokens | `qrcode` (server and web) and `@zxing/browser` (camera scanner, used by Attendance and Inventory); token conventions: 32-byte base64url, only SHA-256 at rest (public links), HMAC-derived manage links with version rotation (bookings), signed kiosk codes `RK1.<id>.<ts>.<hmac>` (attendance). | QR credentials reuse these conventions; no new crypto dependency. |

## 3. Responsibilities

| Data | Owner |
|---|---|
| Event (title, venue text, description, images, policies, publication) | Ticketing |
| Session time, duration, capacity of the room, occupied resource, timezone | Booking Engine (`booking_session` in the event's space) |
| Ticket types (name, price reference, quota, per-order limits, sale window, visibility) | Ticketing |
| Quota counters per type and session | Ticketing (`ticket_quota`, conditional UPDATE like `seats_taken`) |
| Seats of the session (total) | Booking Engine (`seats_taken`; ticket issuance takes seats through it) |
| Price, payment, refund, cash session, receipt | Commerce (POS order and payments; later online payments) |
| Ticket (the right to enter), holder, QR credential, admission, transfer | Ticketing |
| Customer identity | Contacts (optional link) + minimal holder fields |

Rule: a ticket is valid only while (a) its ticket row is `ISSUED`, (b) its seat in the engine is held, and (c) for paid
tickets, its Commerce order is `PAID` and not refunded for that ticket.

## 4. Data model (Prisma, new migration; all with `company_id`, uuidv7 ids, timestamps)

- `ticket_event`: space_id (a `booking_space` created for the event, mode internal|online), title, slug (global, for
  the public page), description, venue, image file id, organizer contact, `published`, `sales_open`, policies
  (refund text, transfer allowed, max tickets per order, holder name required), `policy_version`, `enabled`.
- `ticket_session`: event_id, `booking_session_id` (unique), `status` (`scheduled|cancelled|finished`), doors_open_at,
  admission window (minutes before/after start), version.
- `ticket_type`: event_id, name, description, `price_mode` (`free|pos`; later `online`), `catalog_product_id` (paid:
  the product Caja charges), currency, `per_order_max`, `sales_start/end`, `visibility` (`public|private|box_office`),
  sort, `enabled`.
- `ticket_quota`: ticket_type_id, session_id, `quota` (nullable = only the session limit), `issued` (counter),
  unique (type, session).
- `ticket_order`: event_id, session_id, `status` (`PENDING_PAYMENT|CONFIRMED|CANCELLED|EXPIRED|REFUNDED`),
  `channel` (`box_office|portal|website|api`), buyer contact_id / name / email / phone, `pos_order_id` (paid),
  `hold_expires_at`, `booking_id` (the engine booking that holds the seats), totals snapshot, `policy_version`,
  manage token hash/version (bookings pattern), idempotency via `ticket_idempotency` (scope, operation, key, hash).
- `ticket`: order_id, session_id, type_id, `code` (short, human, unique per company), `status` (section 6),
  holder_name / holder_email, `credential_version`, `credential_hash` (SHA-256 of the QR secret), issued_at,
  cancelled_at, `transferred_from_id`, version.
- `ticket_admission`: ticket_id, session_id, `result` (`admitted|rejected`), `reason` (`ok|already_used|cancelled|
  wrong_session|outside_window|unknown|revoked`), device_id, operator_id, scanned_at, `offline` (bool), unique
  (ticket_id) WHERE result = 'admitted' (one entry per ticket in v1; re-entry is a later specialization).
- `ticket_history`: entity, entity_id, action, actor, before/after (append-only), like `booking_history`.
- Device registry for check-in reuses the POS device-link pattern later (offline, section 8); v1 check-in runs in the
  logged-in app.

Seats in the engine: an order takes `n` seats of the `booking_session` with one engine booking (`party_size = n`,
channel = order channel, `source_module = 'runly.ticketing'`, `source_id = order id`). Cancelling or refunding tickets
reduces the booking (cancel when the last ticket goes). Ticketing's per-type `ticket_quota` is checked in the same
transaction (conditional UPDATE `issued + n <= quota`), so both limits hold.

## 5. Operations (all transactional and idempotent)

Every write takes `Idempotency-Key`; the key, operation and request hash are recorded in the operation's transaction
(bookings rule: a reused key with another payload is 422; a rolled-back attempt leaves nothing).

- **Reserve (free or paid):** one transaction: lock nothing globally; `UPDATE ticket_quota SET issued = issued + n WHERE
  ... AND (quota IS NULL OR issued + n <= quota) RETURNING` (no row = "Agotado"); engine `createTx` on the session with
  `party_size = n` (`SESSION_FULL` if the room is full); insert order and tickets (`PENDING_PAYMENT` for paid,
  `ISSUED` + credential for free); outbox event. The last seat contended by many buyers: exactly the available
  number succeed (conditional UPDATEs serialize on the row).
- **Hold expiry:** a `PENDING_PAYMENT` order keeps its quota and seats until `hold_expires_at` (box office: minutes;
  online later: the payment provider's window); the worker expires them in bulk (bookings `expireAllHolds` pattern),
  releasing quota and the engine booking.
- **Confirm payment (paid, box office):** Caja charges the POS order created for the order (lines from the types'
  catalog products, quantity n). Confirmation is a server step that reads the POS order: same company, `PAID`, lines and
  amounts equal to the order snapshot, not already linked. Then tickets become `ISSUED` with credentials; replays return
  the same tickets. A browser saying "paid" proves nothing.
- **Confirm payment (paid, online, after D1):** only from a verified provider webhook (signature checked, event id
  deduplicated) or a server-side retrieval of the payment, never from the success redirect.
- **Cancel / refund:** cancelling tickets of a paid order requires the Commerce refund to exist for those lines
  (refund first, then void); free tickets cancel directly. Quota and seats are released in the same transaction;
  credentials die with the status (no deletion; history kept).
- **Resend:** rotates nothing; sends the same credential to the holder's email through the outbox (bookings
  notification pattern, dedupe key per version).
- **Reissue (lost or leaked QR):** `credential_version + 1`; the old QR stops validating immediately.
- **Transfer (when the event allows it):** new holder name/email, `credential_version + 1`, history `transfer`;
  not after admission; optional cut-off before the session.

## 6. Ticket state machine

```
             reserve(free)                         admit
   (none) ───────────────► ISSUED ───────────────────────► USED
     │                        │  ▲                            
     │ reserve(paid)          │  │ reissue/transfer (same state, credential_version+1)
     ▼                        │  │
 PENDING_PAYMENT ─confirm────►┘  │
     │        │                  │
     │ expire │ cancel           ├── cancel (free) / refund+void (paid) ──► CANCELLED
     ▼        ▼                  │
  EXPIRED  CANCELLED             └── session cancelled ──► CANCELLED (refund flow follows)
```

- `USED` is terminal in v1 (single entry). `CANCELLED`, `EXPIRED` are terminal and release quota and seats.
- Only `ISSUED` tickets admit. Order status is derived: CONFIRMED when all its tickets are issued; REFUNDED when its
  paid tickets were refunded and voided.

## 7. QR credential and validation

- **Credential:** a random 32-byte secret per ticket version; the QR encodes `RT1.<ticketId>.<secret>` (opaque to the
  holder). Only `SHA-256(secret)` is stored (`credential_hash`). Reissue/transfer generates a new secret; the email
  rebuilds nothing from a key, so leaking the database does not leak valid QRs. (Alternative considered: HMAC of id +
  version with a server key, like bookings manage links, which allows re-sending without storing a secret but makes
  the key a single point of failure; random + hash is chosen because QRs are the entry right itself.)
- **Validation (online):** `POST /ticketing/admissions` with the scanned text and the session: one transaction that
  locks the ticket row, checks hash, version, session, status `ISSUED`, admission window and the paid/seat rule, then
  writes `ticket_admission(admitted)` and sets `USED`. Two gates scanning the same QR at once: the row lock and the
  partial unique index admit exactly one; the other gets `already_used` with the first scan's time and gate.
- **Duplicated QR / screenshots:** the same QR used twice is the "already used" case above (the second person is
  rejected; staff see when and where it entered). Reissue invalidates copies made before it.
- **Unknown or forged text:** constant-time hash compare; uniform "QR no válido" without telling whether the id exists.
- **Rate limits:** per device for scans (shared PostgreSQL buckets, bookings phase 4).
- **Offline check-in (specialization, not MVP):** a device downloads a signed snapshot of credential hashes for a
  session, admits locally, and uploads admissions; conflicts (same ticket admitted on two offline devices) resolve to
  the earliest scan and are flagged. Requires device pairing (POS device-link pattern) and is out of the MVP.

## 8. Permissions and isolation

Keys: `ticketing.access`, `ticketing.events.manage` (create events), `ticketing.checkin` (scan), `ticketing.admin`
(all events). Per-event roles reuse the bookings space membership of the event's space (`admin|agent|viewer`):
agents sell and cancel at the box office, viewers read attendees. Every query filters by `company_id` from the tenant
context; public routes resolve the company only from a published event slug; scans check the ticket's company and the
operator's event permission. Attendee lists are visible only to event members; exports follow bookings export rules.

## 9. Dependencies and contracts to add

- **D1 Commerce online payments (blocking for paid online tickets):** a Commerce order created server-side for
  online sales, a payment provider integration with verified webhooks (signature, idempotent event ids), and a
  `commerce.order.paid` / `commerce.order.refunded` contract Ticketing can consume. Not part of Ticketing; until it
  exists, paid tickets are box-office only.
- **D2 POS:** a way to start a Caja sale from a ticket order (like `?cita=`), and a server endpoint Ticketing calls to
  read a POS order's status, lines and refunds (read-only).
- **D3 Booking Engine:** nothing new beyond phase 5 (`createTx/transitionTx/rescheduleTx`, `source`, sessions). A
  "reduce party size" engine command for partial cancellations (one booking per order) is the only addition.

## 10. UX (initial)

- **Backoffice "Boletos"**: Eventos (list, status, sales and admission counters), Evento (tabs: Resumen, Funciones
  [create sessions on the engine space], Tipos de boleto [price mode, quota, limits, sale window], Asistentes [search,
  status, resend, reissue, cancel, transfer], Taquilla [sell free or start a paid sale in Caja], Publicación [public
  page, embed and Website block like bookings phase 4], Configuración [policies, roles]).
- **Check-in screen**: full-screen camera scanner (zxing, reused from Attendance), big result states (Admitido / Ya
  usado a las 20:14 en Puerta 2 / No válido / Otra función / Fuera de horario), manual code entry, live counters,
  works on phones; keyboard-wedge scanners supported by the manual field.
- **Public portal** (`/app/p/boletos/<slug>`): event page, sessions, ticket types with remaining availability (rounded
  when low), holder data, policies, free tickets issued immediately with QR and email; paid ones show "compra en
  taquilla" until D1.
- All with `@runly/ui`, Spanish UI, phone first for check-in.

## 11. MVP vs specializations

| MVP (F6B-F6E) | Later specializations |
|---|---|
| Events, sessions on the engine, ticket types, quotas | Assigned seating / seat maps |
| Free tickets online and at the box office | Online paid tickets (after D1) |
| Paid tickets at the box office (Caja) | Promo codes, discounts, bundles, memberships |
| QR credential, email, resend, reissue, transfer (if allowed) | Wallet passes (Apple/Google) |
| Online check-in with concurrency guarantees | Offline check-in devices; re-entry; zones |
| Cancel free, refund+void paid (via Commerce) | Waitlists, resale marketplace |
| Calendar projection of sessions, Automations events | Recurring event templates, series passes |
| Website block and embeds (bookings phase 4 pattern) | Dynamic pricing, fees, taxes per ticket |

## 12. Acceptance criteria per phase

See the plan. Common to all: real PostgreSQL concurrency tests (last seat, duplicate scans, retries), isolation
tests, no contact data in events, browser verification on phone and desktop, previous bookings suites green.
