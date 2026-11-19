# runly.bookings phase 1: Booking Engine backend

Spec: `docs/superpowers/specs/2026-11-18-bookings-engine-design.md` (sections 3-6).
Scope: backend only. No UI, no public portal, no changes to POS, Website or Calendar code.

## Tasks

- [ ] 1. Migration `prisma/migrations/20261118000000_bookings_engine/migration.sql`:
  `CREATE EXTENSION IF NOT EXISTS btree_gist`, enum `booking_status`, all tables of spec section 3,
  indexes `(company_id, starts_at)`, `(company_id, status)`, unique `(company_id, idempotency_key)`,
  unique `(company_id, slug)` on spaces, and the `booking_allocation` exclusion constraint.
  Matching Prisma models in `prisma/schema.prisma` (`tstzrange` as `Unsupported("tstzrange")`, written
  through `$executeRaw`). `pnpm db:migrate && pnpm db:generate`.
- [ ] 2. Manifest `bookingsMap` in `apps/api/src/manifests/official/feature-modules.js` (`kind: CORE`,
  `core: true`, `uninstallable: false`, `ownedEntities`), permissions in `permission-catalog.js`,
  event entries in `packages/module-engine/src/event-catalog.js`, seed via `pnpm db:seed`.
- [ ] 3. `apps/api/src/routes/bookings/`:
  - `bookings-slots.js`: pure slot expansion (rules + exceptions + busy ranges -> slots) given instants
    already converted by SQL; unit tests in `__tests__/bookings-slots.test.js` (DST day, closed
    exception, buffers, lead time, horizon).
  - `bookings-config-service.js`: spaces, members, services, resources, schedule rules, exceptions,
    sessions (CRUD, soft delete, timezone validation).
  - `bookings-availability-service.js`: wall-clock -> instant conversion with `AT TIME ZONE`, calls
    `bookings-slots.js`.
  - `bookings-command-service.js`: create, confirm, reject, cancel, complete, no-show, reschedule;
    one transaction each, exclusion `23P01` -> 409, session seat `UPDATE ... RETURNING`, idempotency,
    `booking_history`, `publishDomainEvent(tx, ...)`.
  - `bookings-routes.js` + `index.js`: thin Hono routes under `/bookings/*`, Zod validation,
    tenant + per-space membership checks. Mounted with `mountWithAuth` in `apps/api/src/index.js`
    and added to `API_PREFIX_RE`.
- [ ] 4. Postgres integration test `__tests__/bookings-engine-postgres.test.js` (disposable company,
  cleaned up after): 20 parallel creates on one slot -> 1 booking + 19 x 409; session capacity 5 with
  20 parallel creates -> 5; parallel reschedules into one slot -> 1 wins; same idempotency key twice
  -> one booking; company B cannot read or mutate company A records; cancel frees the slot.
- [ ] 5. Verification: `pnpm lint`, `node --test apps/api/src/routes/bookings/__tests__/`, real API
  boot already running on 4010 (`/health`), curl smoke of the main routes with `$RUNLY_TOKEN`.
  Commit.

## Closing criteria

All of task 4 passes against the real database and the smoke test answers as expected. Phase 2 (UI)
starts from this plan's routes without changing them.
