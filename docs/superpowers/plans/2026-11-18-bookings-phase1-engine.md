# runly.bookings phase 1: Booking Engine backend

Spec: `docs/superpowers/specs/2026-11-18-bookings-engine-design.md` (sections 3-6 and the phase 1 decisions in 7.1).
Scope: backend only. No UI, no public portal, no changes to POS, Website or Calendar code.

## Tasks

- [x] 1. Migration `prisma/migrations/20270108000000_bookings_engine/migration.sql` (btree_gist, `booking_status`,
  13 tables, composite company foreign keys, `booking_allocation_no_overlap` exclusion constraint, append-only
  trigger on `booking_history`) and matching Prisma models.
  Verified: 2026-11-18 (`prisma validate` + `prisma generate`; `prisma migrate deploy` of all 280 migrations on a
  disposable `supabase/postgres:17.6.1.136` container; the bookings migration also ran inside a rolled-back
  transaction on the shared Postgres 15.8 test instance as the non-superuser migration role: 13 tables + exclusion
  constraint created, nothing left after rollback).
- [x] 2. Manifest `bookingsMap` (not yet listed in `core-modules.js`, see spec 7.1), permissions in
  `permission-catalog.js`, `bookings.booking.*` events in `event-catalog.js` (hidden in `INTERNAL_EVENTS`).
  Verified: 2026-11-18 (`validateModulePwaIdentity(bookingsMap)` valid; module-engine, module-compiler,
  validators and official-manifest suites: 355/359 pass, 2 skipped, 2 failures pre-existing and unrelated:
  `runly.website` icon `PanelsTopLeft` and the `runly.growth` navigation contract).
- [x] 3. `apps/api/src/routes/bookings/`: `bookings-slots.js`, `bookings-core.js`, `bookings-config-service.js`,
  `bookings-availability-service.js`, `bookings-command-service.js`, `bookings-routes.js`, `index.js`; Zod
  contracts in `packages/validators/src/bookings.js`; router mounted in `apps/api/src/index.js`.
  Verified: 2026-11-18 (`bookings-slots.test.js` 4/4; eslint clean on all touched files; `node --check`).
- [x] 4. `__tests__/bookings-engine-postgres.test.js` (`BOOKINGS_TEST_DATABASE_URL`, localhost only).
  Verified: 2026-11-18 (10/10, four consecutive runs, ~4.2 s each, on the disposable container).
- [x] 5. Verification: lint, tests, `pnpm check:privacy` (no findings in phase 1 files; 23 pre-existing findings
  elsewhere), real API boot on a separate port (4091) with `/health` 200 and `/bookings/*` behind the auth gate (401).
  Verified: 2026-11-18.

## Evidence for the closing criteria

| Requirement | Test | Result |
|---|---|---|
| 20 parallel creates, one resource and time | `20 simultaneous requests for one resource...` | 1 x 201, 19 x 409 `SLOT_TAKEN`; 1 booking, 1 allocation, 1 history row, 1 outbox event |
| 20 parallel creates, session capacity 5 | `... session of capacity 5 ...` | 5 x 201, 15 x 409 `SESSION_FULL`; `seats_taken` = 5; an oversized party is refused without consuming seats; cancel frees one seat |
| Two parallel reschedules into one slot | `two simultaneous reschedules ...` | one 200, one 409; the loser keeps its original time and active allocation |
| Idempotency | `idempotency: ...` | exact repeat replays (200, same id); reused key with another payload 422; 6 parallel duplicates create 1 booking; a failed attempt stores no key and the same key succeeds once the slot frees; repeated cancel with its key replays |
| Isolation and roles | `isolation: ...` | another company (even its admin) gets 404 on read, cancel and reschedule; cross-company resource link refused by the service (404) and by the composite FK; non-member 403; viewer reads but cannot create, cancel or configure; agent operates but cannot configure |
| Seven-state machine | `every transition ...` | 7 states x 5 API transitions = 35 cases match `TRANSITIONS`; allocations are active only while `PENDING`/`CONFIRMED`; `COMPLETED` before start is refused |
| Adjacent, buffers, exceptions, midnight | `adjacent intervals ...` | back-to-back bookings coexist; buffer blocks the next slot; closed exception blocks, open exception adds hours; 20:00-02:00 rule books across midnight |
| DST and IANA zones | `DST in an IANA zone ...` | America/New_York spring forward yields 2 real hours, fall back resolves the ambiguous hour once; invalid zone refused |
| Full rollback | `a failure after the booking insert ...` | outbox failure inside the transaction leaves bookings, allocations, seats, history, outbox and idempotency unchanged; UPDATE/DELETE on history refused by trigger |
| Expired holds | `expired holds ...` | a stale PENDING hold no longer blocks availability or creation and becomes EXPIRED |

## Closing criteria

Met on 2026-11-18. Phase 2 (UI) starts from these routes; it must list `bookingsMap` in `core-modules.js`
and run `pnpm db:seed` so the permissions exist for non-admin roles.
