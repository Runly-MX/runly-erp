# runly.bookings (Reservaciones): Booking Engine design

Date: 2026-11-18
Status: approved for phased implementation (source: "Runly Reservaciones — Acuerdos de arquitectura v1.0", 2026-11-18)
Plan for phase 1: `docs/superpowers/plans/2026-11-18-bookings-phase1-engine.md`

## 1. Goal

One official core module, `runly.bookings` (UI name "Reservaciones"), that owns a single Booking Engine
with two experiences over the same tables and the same transactional services:

- **Backoffice** (`/app/m/runly.bookings/...`): spaces, services, schedules, resources, customers,
  bookings, policies and publication.
- **Booking Portal** (`/app/p/reservar/...`): public availability, create, confirm, look up,
  reschedule and cancel without a Runly account.

No other module or channel (Website block, iframe, popup, POS, public API) implements its own
availability or booking logic; they call the engine.

## 2. Phase 0 audit: existing contracts (verified 2026-11-18 against the working tree)

| Area | What exists | Consequence for the engine |
|---|---|---|
| POS table reservations | `pos_reservation` (Prisma `PosReservation`), statuses `CONFIRMED/SEATED/CANCELLED/NO_SHOW`; `pos-reservation-service.js` locks `pos_table` `FOR UPDATE` and flips `pos_table.status` to `RESERVED`. | Availability is table-status based, not time-range based: a table reserved at 21:00 is blocked all day and two future reservations cannot share a table. Not touched in phases 1-5; phase 6 makes POS consume engine resources. |
| POS appointments | `pos_appointment` (`PosAppointment`), gated by `pos_outlet.appointments_enabled`; `pos-appointment-service.js` lists by range, no resource overlap check found. | Same: phase 6 candidate. |
| Website booking block | `BookingFormBlock` (`packages/website-blocks/src/bookingFormBlock.jsx`) + `POST /public/website/bookings` (`routes/website/bookings-routes.js`): inserts a `calendar_event` directly. | No availability check, no idempotency, no rate limit, no cancel/reschedule, guest PII written into the event description, and `${date}T${time}:00.000Z` treats the visitor's local time as UTC. Phase 5 rewires the block to a `BookingPage`; the legacy endpoint stays until then. |
| Calendar projection | `pos-calendar-bridge.js` (and the fleet bridge): best-effort mirror keyed by `calendar_event.source_module` + `source_entity_id`, never throws into the caller, one calendar per company and kind tracked in `InstanceConfig`, viewers shared by permission. | Reuse the exact pattern (`source_module = 'runly.bookings'`). Calendar is a projection, never read back for availability. |
| Public links | `module_public_link` + `module-public-links-service.js`: 32-byte base64url token, expiry, revoke, `max_uses`, atomic `reserveUse`. Bound to RME3 manifests (`publicResources` + CUSTOM view). | Not reusable as-is for an official module. Copy the token conventions; booking pages and manage links get their own columns. |
| Public routing | API public routers mounted at `/public/<module>/*` (see LMS `createLmsPublicRouter`); SPA public screens under `/app/p/<feature>/<token>` inside `PublicShell` (`apps/desktop/src/app/AppEntry.jsx`). | Portal API: `/public/bookings/*`; portal UI: `/app/p/reservar/<pageSlugOrToken>` and `/app/p/reservar/gestion/<manageToken>`. |
| Domain events | `publishDomainEvent(db, { companyId, event, payload })` writes `domain_event_outbox`; event keys must exist in `EVENT_CATALOG` (`packages/module-engine/src/event-catalog.js`); delivery is at-least-once. | Add `bookings.booking.*` entries; publish inside the booking transaction (db = tx). |
| Official module shape | `runly.lms`: Prisma models + forward migrations, manifest in `manifests/official/feature-modules.js` (`kind: CORE`, `core: true`, `uninstallable: false`, `lifecycle.ownedEntities`), routes in `apps/api/src/routes/lms/`, permissions in `permission-catalog.js`, screens in `apps/desktop/src/modules/runly.lms/` resolved by `module-screen-resolver.js`. | Follow it. This is an official module, so RME3 rules (Runly ORM, no Prisma models) do not apply. |
| Database | `btree_gist` available on the instance but not installed; migrations already run `CREATE EXTENSION IF NOT EXISTS` (pgcrypto, pg_trgm, unaccent). No exclusion constraints in the schema yet. | Install `btree_gist` and enforce no double booking with an `EXCLUDE` constraint. |
| Time zones | No tz library in the API; `@runly/core/time` formats with `Intl`. | Convert wall-clock schedules to instants in Postgres (`(date + time) AT TIME ZONE tz`), so DST is handled by the tz database and no dependency is added. |

## 3. Data model (Prisma, migration `20261118000000_bookings_engine`)

All tables carry `company_id`, `id UUID DEFAULT uuidv7()`, `created_at`, `updated_at`; soft delete via
`enabled` where records are user-managed.

- `booking_space`: name, slug (unique per company), `mode` (`internal|online|hybrid`), `timezone`
  (IANA, validated with `Intl.supportedValuesOf('timeZone')`), `published` (bool; toggling never
  deletes data), policy JSON (`leadMinutes`, `horizonDays`, `cancelUntilMinutes`,
  `rescheduleUntilMinutes`, `requiresApproval`, `holdMinutes`), `enabled`.
- `booking_space_member`: space_id, user_id, `role` (`admin|agent|viewer`). Per-space permission.
- `booking_service`: space_id, name, `kind` (`appointment|session`), `duration_minutes`,
  `buffer_before_minutes`, `buffer_after_minutes`, `slot_step_minutes`, `capacity` (sessions),
  `min_party`/`max_party`, `enabled`.
- `booking_resource`: company-level (shared between spaces), name, `type`
  (`staff|room|equipment|table|other`), optional `user_id` (staff), `enabled`.
- `booking_space_resource`: which resources a space can use (sharing between spaces = same resource
  linked to several spaces; the exclusion constraint is per resource, so sharing is safe).
- `booking_service_resource`: which resources can deliver a service (`any one of` semantics in v1).
- `booking_schedule_rule`: owner = space or resource; `weekday` 0-6, `start_time`, `end_time`
  (local wall clock), optional `valid_from`/`valid_to`.
- `booking_exception`: owner = space or resource; `starts_at`/`ends_at` (instants), `kind`
  (`closed|open`), reason. `closed` = block / holiday; `open` = extra hours.
- `booking_session`: shared-capacity occurrence of a `session` service: resource_id (optional),
  `starts_at`, `ends_at`, `capacity`, `seats_taken` (maintained atomically), `status`
  (`scheduled|cancelled`).
- `booking`: space_id, service_id, session_id (nullable), `status` enum
  `PENDING|CONFIRMED|CANCELLED|REJECTED|COMPLETED|NO_SHOW|EXPIRED`, `starts_at`, `ends_at`,
  `party_size`, `contact_id` (nullable, link to Contactos), minimal guest fields
  (`guest_name`, `guest_email`, `guest_phone`), `notes`, `channel` (`backoffice|portal|website|pos|api`),
  `hold_expires_at` (PENDING holds), `manage_token_hash` (sha256, raw token returned once),
  `idempotency_key` (unique with company_id), `created_by_id` (nullable for portal), `version`.
- `booking_allocation`: booking_id, resource_id, `during tstzrange` (includes buffers), `active` bool.
  `EXCLUDE USING gist (resource_id WITH =, during WITH &&) WHERE (active)`.
- `booking_history`: booking_id, actor (user id or `portal`), action, before/after JSON, created_at.
  Append-only change history.

## 4. Engine rules

**Availability (read).** For a service and a date range: expand schedule rules of the space and of
each candidate resource into instants in the space timezone, intersect them, subtract `closed`
exceptions, add `open` exceptions, subtract active allocations (with buffers), apply lead time and
horizon, and cut slots every `slot_step_minutes`. Sessions: list `scheduled` sessions with
`seats_taken + party_size <= capacity`. The read is advisory only.

**Booking (write), always atomic, used by create, confirm-from-hold and reschedule.** One
transaction: re-validate the slot against schedules/exceptions/policy, pick a free resource, insert
`booking_allocation` rows; the exclusion constraint is the final guard (SQLSTATE `23P01` maps to
409 "Ese horario ya no está disponible"). Sessions: `UPDATE booking_session SET seats_taken =
seats_taken + n WHERE id = ... AND status='scheduled' AND seats_taken + n <= capacity RETURNING`; no
row = 409 "Cupo agotado". Reschedule deactivates the old allocations and inserts the new ones in the
same transaction, so either both happen or neither.

**Idempotency.** Every create/reschedule/cancel accepts `Idempotency-Key`; create stores it in
`booking.idempotency_key` and a repeated key returns the existing booking (200) instead of a second one.

**Status machine.**
`PENDING -> CONFIRMED | REJECTED | CANCELLED | EXPIRED`;
`CONFIRMED -> CANCELLED | COMPLETED | NO_SHOW`; terminal states free their allocations/seats
(`active = false`, `seats_taken - n`). `requiresApproval` spaces create PENDING; the worker expires
PENDING holds past `hold_expires_at` (phase 3). Each transition writes `booking_history` and publishes
a domain event.

**Isolation.** Every query filters by `company_id` from the tenant context; space-scoped endpoints also
check `booking_space_member` (or `bookings.admin`). Public endpoints resolve the company only from a
published page and never return other customers' data, resource personal data beyond display name,
or internal notes.

## 5. Permissions

`bookings.access` (module), `bookings.spaces.manage` (create spaces, resources), `bookings.manage`
(bookings in spaces where the user is a member), `bookings.admin` (all spaces of the company).
Per-space roles: `admin` (configure the space), `agent` (operate bookings), `viewer` (read).

## 6. Domain events

`bookings.booking.created`, `.confirmed`, `.rescheduled`, `.cancelled`, `.rejected`, `.completed`,
`.no_show`, `.expired`. Payload: id, spaceId, serviceId, status, startsAt, endsAt, partySize, channel,
contactId (no guest email/phone; Automations reads them through an authorized action if needed).

## 7. Phases and closing criteria

| Phase | Scope | Closes when |
|---|---|---|
| 0 | This audit and design | Spec + plan committed (2026-11-18). |
| 1 | Engine backend: migration, Prisma models, manifest, permissions, services (spaces, services, resources, schedules, exceptions, sessions, availability, booking commands, history), internal routes, domain events | `node --test` unit tests for slot expansion (incl. DST) + Postgres integration tests: 20 parallel creates on one slot produce exactly 1 booking; 20 parallel creates on a session of capacity 5 produce exactly 5; reschedule race; idempotent retry; cross-company isolation. Real API boot + curl smoke. |
| 2 | Backoffice UI (spaces, services, resources, schedules, bookings agenda/list, history) with `@runly/ui` | UI audit checklist + browser walkthrough create/confirm/cancel/reschedule. |
| 3 | Booking Portal: `booking_page`, public routes, manage token, rate limit, confirmation email, hold expiry in the worker, mobile + a11y | Public E2E (Playwright) on phone viewport; token leakage tests. |
| 4 | Calendar projection, Contactos linking, Automations events | Calendar shows bookings; deleting a calendar event does not change availability. |
| 5 | Website native block on `BookingPage`, iframe/popup embed; retire `POST /public/website/bookings` behind a redirect | Website E2E; legacy block regression. |
| 6 | POS restaurant/appointments consume engine resources (migration path for `pos_reservation`, `pos_appointment`) | POS regression suite green. |
| Later | Ticketing (QR, admission), payments via Commerce/POS, public API | Separate specs. |

## 7.1 Phase 1 implementation decisions (2026-11-18)

These refine sections 3-6; nothing else in the design changed.

- Migration is `20270108000000_bookings_engine` (sorts after the existing 2027-dated migrations).
- Intervals are half-open `[start, end)` everywhere (`tstzrange(..., '[)')`, CHECK on `booking_allocation`), so back-to-back bookings coexist.
- Idempotency lives in `booking_idempotency` (company, scope = `user:<id>`, operation, key, request hash, booking id) instead of a `booking.idempotency_key` column, so create, reschedule and every transition are covered and a reused key with another payload is detected (422 `IDEMPOTENCY_KEY_REUSED`). The row is written inside the operation's transaction: a rolled-back attempt leaves no record and can be retried.
- `booking_allocation` also carries `session_id`: a session with a resource occupies it for its whole duration. Bookings inside a session take seats, not allocations.
- Occupying states: `PENDING` (until `hold_expires_at`) and `CONFIRMED`. Every other state frees allocations and seats. Stale holds are expired inside the transaction that needs their capacity, and in bulk by `expireHolds` (worker wiring in phase 3).
- `COMPLETED` and `NO_SHOW` are only accepted once the booking has started. Cancelling a session with active bookings is refused.
- Permissions: three keys (`bookings.access`, `bookings.spaces.manage`, `bookings.admin`); `bookings.manage` was dropped because the per-space roles already carry the right to operate bookings. Company admins count as `bookings.admin`.
- Domain events are written with the transaction client and allowed to throw (the existing `publishDomainEvent` swallows errors, which inside a transaction would turn the commit into a silent rollback). They are hidden from the Automations trigger picker (`INTERNAL_EVENTS`) until phase 4.
- `bookingsMap` is defined but not yet listed in `core-modules.js`: seed does not install it and no module without screens reaches the launcher. Phase 2 lists it together with its screens and the seeded permissions; until then only company admins can call `/bookings/*`. (Done in phase 2, see 7.2.)
- Time zones: nonexistent local times (DST gap) shift forward and ambiguous ones resolve to the later, standard-time occurrence (Postgres `AT TIME ZONE`). Zone names are validated against `pg_timezone_names`.
- Not built in phase 1: `valid_from`/`valid_to` on schedule rules, manage-token generation (column exists; phase 3), cancel/reschedule cut-offs for customers (phase 3; staff are not limited).
- Prisma models declare no relation fields; the foreign keys exist only in SQL, as in the rest of the schema (`prisma migrate diff` already reports the same kind of drift for other modules).

## 7.2 Phase 2 implementation decisions (2026-11-19)

Plan and evidence: `docs/superpowers/plans/2026-11-19-bookings-phase2-backoffice.md`.

- `bookingsMap` is now listed in `core-modules.js`; the regular seed installs it and its permissions (it runs on
  every deploy through `infra/docker/api-entrypoint.sh`). This supersedes the 7.1 note about not listing it.
- Permission bootstrap: space membership owns the per-user `bookings.access` grant (granted with the first
  space, revoked with the last). A `bookings.access` granted by hand to someone without spaces is also revoked
  when they leave their last space. Company resources are readable only by catalog managers and space members.
- Weekly rules gained optional `valid_from`/`valid_to` (local dates, inclusive) in a forward migration.
- Every serialized booking carries `actions` (allowed transitions plus `reschedule`) computed from the engine's
  single transition table; the UI shows only those and never re-derives the state machine.
- The SDK domain is online only: a reservation is never queued offline and replayed.
- The module's root list lives at `/spaces` because the shell only authorizes routes covered by navigation
  (`/spaces/:id` needs the `/spaces` prefix); `/` resolves to the same screen.
- Publication stays descriptive in Configuración (no switch) until the portal exists.
- Not built: a Contacts-picker fallback for users without contacts permission (the guest fields remain), per-module
  MirAI capabilities, push notifications for bookings (phase 4 with events).

## 7.3 Phase 3 implementation decisions (2026-11-19)

Plan and evidence: `docs/superpowers/plans/2026-11-19-bookings-phase3-portal.md`.

- `booking_page` (migration `20270108200000_bookings_portal`): global slug (`/app/p/reservar/<slug>`, `gestion`
  reserved), owning space, visible services (explicit list), texts, policies, privacy notice, accent color,
  `policy_version`. A page accepts bookings only while the page, its space and the company are published/enabled.
  Pages are never hard-deleted.
- Manage link: token = HMAC-SHA256(`BOOKINGS_LINK_SECRET` or `JWT_SECRET`, booking id + version), 43 chars.
  Only its SHA-256 is stored (`manage_token_hash`); emails rebuild it from the version, so no secret sits in the
  database or outbox. Rotation (backoffice "Enviar nuevo enlace") bumps the version and revokes the old link.
  Expiry: 30 days after the booking ends (moved on reschedule). The token travels in the URL fragment
  (`/app/p/reservar/gestion#<token>`) and in the `X-Booking-Token` header, never in a path or query.
- Access policy after unpublishing: the customer keeps viewing and cancelling (within the cut-off); rescheduling
  needs the page and space still published. Bookings made in the backoffice with a customer email also get a link
  (view/cancel; reschedule only if made from a page).
- Customer cut-offs (`cancelUntilMinutes`, `rescheduleUntilMinutes`) are enforced inside the booking transaction
  after the row lock; staff are never limited by them. Changing a page's policy texts or the space policy bumps
  `policy_version`; a booking stores the accepted version, time and a keyed hash of the client IP.
- Notifications: `booking_notification` outbox written in the same transaction (`dedupe_key = booking:kind:version`,
  so idempotent replays enqueue nothing), sent by the existing worker through the company mailer with branding,
  claimed with `FOR UPDATE SKIP LOCKED`, retried with exponential backoff up to 6 attempts, `skipped` when no SMTP
  is configured. "sent" means accepted by SMTP. A crash between send and mark can resend once (at-least-once).
  The user-notification queue was not reused because customers are not ERP users.
- Pending holds expire in the same worker tick (`expireAllHolds`, every 30 s, idempotent per row).
- Public security: per-IP read bucket, per-IP-and-page and per-page create buckets, per-IP manage-write bucket
  (in memory per API process), honeypot field, required idempotency key (scope `portal:<page>`), browser origin
  allow-list (`CORS_ORIGIN` + app URL), client IP only through `RUNLY_TRUSTED_PROXIES`, `Cache-Control: no-store`,
  `Referrer-Policy: no-referrer`, uniform 404 for unknown/unpublished pages and invalid/expired/revoked links,
  no internal ids, other customers or resource names (unless the page lets customers choose) in responses.
- Found and fixed while testing: zod applied `.default()` inside `.partial()`, so PATCH requests reset space mode
  and policy, service buffers/capacity and resource type; update schemas now have no defaults (regression test).
- Not built: prices (no price source exists), captcha (honeypot + limits first), embeds/widgets and custom
  domains (phase 4). The SPA boot splash also shows briefly on public routes (shared shell; phase 4 embedding).

## 7.4 Phase 4 implementation decisions (2026-11-19)

Plan and evidence: `docs/superpowers/plans/2026-11-19-bookings-phase4-distribution.md`. Phase 4 (as agreed for this
program) covers distribution (F4A-F4C) and the Calendar/Automations wiring (F4D); the old Website `BookingFormBlock`
and `POST /public/website/bookings` stay untouched until phase 5.

- Migration `20270108300000_bookings_distribution`: `booking_page.embed_origins`, `booking_rate_bucket` (UNLOGGED),
  `booking_calendar_sync`, index on `booking.updated_at`.
- **Public pages without the ERP boot.** `/app/p/reservar/*` skips the brand loader and removes the static splash.
- **Embedding.** A page is framed only as `/app/p/reservar/<slug>?embed=1`. nginx (`infra/nginx/spa.conf`, location
  `/app/p/reservar/`) asks `GET /public/bookings/frame-policy` (auth_request, with `X-Original-URI`) and sends
  `Content-Security-Policy: frame-ancestors <answer>`: `'none'` for manage links, `'self'` for the plain portal, and
  `'self'` + the page's `embed_origins` + the company's assigned and ready Runly Website hostnames (https) for embeds.
  The same endpoint answers 403 on non-ERP hosts, like the admin-origin gate it replaces for that location. The SPA
  also refuses to render when the browser reports a framing origin outside the list (defense in depth; Firefox
  without `ancestorOrigins` relies on the CSP). The iframe's API calls are same-origin (portal origin), so CORS was
  not widened. Manage links from an embed open in a new tab. Origins are scheme + host + port, HTTPS only (HTTP on
  loopback for local tests), no paths or wildcards, up to 20.
- **Rate limits with several API instances.** Writes (creates per IP+page, per page, manage changes per IP) use
  token buckets in PostgreSQL (one atomic upsert per request, hashed keys, pruned by the worker). Reads stay in memory
  per process: N instances only multiply a generous browsing limit.
- **Website block** `BookingPortalBlock` ("Reservaciones", universal group): `bookingPage` (slug), `serviceId`,
  `display` (`calendar` iframe with auto height, `button`, `link`), `buttonLabel`. The editor offers the company's live
  pages (`GET /bookings/pages/published`, readable with `website.pages.update` or `bookings.access`). Publication
  validates page and service against the company (cross-company = not found; unpublished = `booking_page_unpublished`;
  service not on the page = `booking_service_unavailable`), records a `{ kind: 'booking' }` dynamic binding and pins
  `portalUrl` (absolute) into the sealed copy; base routes are re-pinned on every release, so rollback restores the
  configuration exactly. Published pages open `frame-src` only to the portal origin, only when the release has the block.
- **Compartir e integrar** (Reservas online, per page): direct link, iframe snippet with the optional
  `/runly/bookings-embed.js` auto-height script (accepts height messages only from the portal origin and its own
  iframes), button snippet, and the authorized sites editor.
- **Calendar.** `bookings-calendar.js` mirrors each booking from its current row (never from an event payload) under a
  per-booking advisory lock and a version check (`booking_calendar_sync`), so replays, out-of-order and concurrent runs
  converge on one event and stray duplicates are removed. PENDING ("Pendiente · ..."), CONFIRMED, COMPLETED and NO_SHOW
  are shown; CANCELLED, REJECTED and EXPIRED remove the event. One calendar per space ("Reservaciones · <space>"),
  owned by a space admin and shared as viewer with current members only (leaving the space revokes it). Title and
  description carry service, guest name, folio, status, party and channel; never email, phone or notes. Triggered after
  each committed API command (not awaited) and by the worker for everything not yet mirrored at its version (expired
  holds, crashes, bookings changed in the last 35 days). Calendar shows these events read-only with "Abrir reservación"
  (`/app/m/runly.bookings/reservations?reservacion=<id>`). The engine never reads them.
- **Automations.** The eight `bookings.booking.*` events left `INTERNAL_EVENTS`: their payload is documented in
  `EVENT_CATALOG` without contact data, they are written to the outbox in the booking transaction and delivered at
  least once by the existing dispatcher (system automations dedupe by event id).
- Not built: the website editor's booking selector in the legacy `WebsitePageEditorScreen` (text field there), a
  popup/modal embed, channel `website` for embedded bookings (they are `portal`), custom domains for the portal itself.

## 7.5 Phase 5: POS on the Booking Engine (2026-11-19)

Plan and evidence: `docs/superpowers/plans/2026-11-19-bookings-phase5-pos.md`. In this program phase 5 is the POS
integration (the table in section 7 listed it as phase 6; the Website rewiring was absorbed by phase 4).

**F5A audit (working tree, 2026-11-19).**

| Area | Finding |
|---|---|
| Table reservations | `pos_reservation` + `pos-reservation-service.js`: creating one with a table sets `pos_table.status = RESERVED` for the whole day (confirmed: a 21:00 reservation blocks the table from the morning, and a second future reservation on the table is refused while it is RESERVED). No time-range check, no capacity check (party size vs table seats), duration only informative. Cancel / no-show set the table AVAILABLE when no open order. |
| UI | No POS screen uses the reservation hooks (`usePosReservation.js` is unused): reservations exist only through the API/SDK; the comandero just shows RESERVED tables. |
| Arrival | Two seat paths: legacy `POST /pos/reservations/:id/seat` (floor routes) is shadowed by the C6 command `seatReservation` (v2 router mounted first), which opens the order through `createPosRecoveryOrders.createOrder` (table lock, one open order per table, RESERVED only openable by its reservation). |
| Appointments | `pos_appointment`: no professional/resource at all and no overlap detection (confirmed: any number of appointments can share a time in one outlet). COMPLETED requires the paid POS order; status changes have no time rules. |
| Outlets, customers | Outlets have no time zone; reservations keep guest name/phone, appointments link `contact_id` and catalog items (charged later in Caja). |
| Permissions | Reservations: `pos.orders.read/create/update`; appointments: any of `pos.caja.*`, `pos.comandas.*`, `pos.admin.*`. |
| Calendar | `pos-calendar-bridge.js` mirrors reservations and appointments onto "Punto de venta - Agenda". |
| Data | `scripts/audit-pos-bookings-legacy.mjs` (read-only, counts only) on the development instance: 0 legacy reservations, 0 appointments, 0 RESERVED tables. Production must be audited the same way before activating any outlet. |

**Contract.** The Booking Engine is the only source of time and capacity; POS keeps physical state and money.
- `pos_booking_link (company, outlet, kind = tables | appointments)` → one engine space + service; `mode` `engine`
  (POS writes through the engine) or `legacy` (POS writes its own tables). One writer per outlet and kind.
- Tables are engine resources (`pos_booking_table`), `booking_resource.capacity` = seats; the engine keeps only
  resources with room for the party and picks the smallest that fits. Professionals are staff resources.
- The legacy POS routes and SDK keep their shape: `/pos/reservations*` and `/pos/appointments*` delegate to
  `pos-bookings-adapter.js` for engine outlets (reservation id = booking id, or a carried legacy row). No route was
  removed; POS UI calls were made online-only (a time is never confirmed offline).
- Engine additions (no second engine): `durationMinutes` per booking for staff (never portal), `partySize` change on
  reschedule (staff), `createTx/transitionTx/rescheduleTx` inside a caller's transaction with a `sideEffect` hook
  (the `pos_appointment` row commits with its booking), `source` idempotency (`booking.source_module/source_id`,
  unique), `attachOrderTx` (arrival: `booking.pos_order_id`, `arrived_at`, history `arrive`), `updateDetails`,
  internal `skipLimits` (migration only) and `excludeResourceIds`.
- Boundary with physical state (POS): a table occupied now cannot take a reservation that starts within one turnover
  (the link service's duration) and is skipped by auto-assignment; a walk-in cannot open a table whose unseated
  reservation overlaps the next turnover (`TABLE_OCCUPIED`, existing code); seating needs the table physically free.
  The engine booking stays CONFIRMED while seated (the table keeps its time) and is completed by the worker once its
  account is paid/cancelled/refunded (or an appointment was charged) and it has started.
- Statuses: engine CONFIRMED → POS `CONFIRMED`, or `SEATED` with an account; CANCELLED/REJECTED/EXPIRED → `CANCELLED`;
  NO_SHOW, COMPLETED, PENDING as is. Appointments: ARRIVED is POS-only; NO_SHOW only after the start (engine rule);
  COMPLETED before the start updates POS now and the engine later.
- Calendar: engine outlets are mirrored only by the bookings projection (the POS bridge skips them); carried legacy rows
  lose their POS calendar event.

**F5D migration and rollback.** Per outlet and kind, from Administración > Reservas (or the routes):
`preview` runs the whole activation in a transaction that is rolled back and reports what is carried and what does not
fit; `activate` creates the space (internal, unpublished, open 24 h in two halves so a dinner can cross midnight), the
service (tables 90 min + 15 min cleanup, appointments 60 min), the resources, and carries every open, not yet ended
legacy row into the engine with `source` = the legacy row (idempotent; started ones keep their remaining time);
any conflict blocks the activation (409 with the list) until staff fix it in POS; legacy RESERVED marks are cleared.
Legacy rows are never deleted: history stays in `pos_reservation`/`pos_appointment` (`booking_id` links carried
ones). `rollback` sets `legacy`, unpublishes the space and copies every live engine booking back to a legacy row
(created or updated, linked by `booking_id`), so nothing booked after activation is lost; reactivation applies changes
made in legacy mode (cancellations, moves) through the engine first. Legacy mode after a rollback does not re-mark
tables RESERVED (that would block them all day again).

Not built: automatic combination of tables (resources are one table each; a combination would need multi-resource
bookings, a non-goal of v1), outlet time zones (the activation takes the browser's), a public restaurant portal by
default (the space starts unpublished; a portal booking for a near time can land on a table that is physically busy,
see risks), deposits/payments.

## 8. Non-goals for v1

Multi-resource services (service needs room AND staff), recurring bookings, waitlists, payments,
external calendar free/busy (Google) as an availability source.
