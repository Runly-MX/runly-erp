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

## 8. Non-goals for v1

Multi-resource services (service needs room AND staff), recurring bookings, waitlists, payments,
external calendar free/busy (Google) as an availability source.
