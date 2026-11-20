# runly.bookings phase 5: POS restaurant tables and appointments on the Booking Engine

Spec: `docs/superpowers/specs/2026-11-18-bookings-engine-design.md` (audit, contract and decisions in 7.5).
Scope: POS table reservations and POS appointments through the engine, per-outlet activation with migration and
rollback. No changes to kitchen, Caja payments, refunds, Ticketing or Studio.

## Tasks

- [x] F5A. Audit of POS reservations, appointments, tables, outlets, arrival, permissions, calendar and data
  (`scripts/audit-pos-bookings-legacy.mjs`, read-only); contract between `runly.pos` and `runly.bookings` (spec 7.5).
- [x] F5B. Tables: migration `20270108400000_bookings_pos_integration`, table resources with capacity, engine
  duration/party/exclusion options, adapter behind the existing `/pos/reservations*` routes, arrival through C6
  (`attachOrderTx`), walk-in guard, next reservation per table, worker completion of closed accounts, POS screen
  Reservas and the Administración > Reservas panel.
- [x] F5C. Appointments: professionals as resources, `pos_appointment` written in the booking's transaction, atomic
  reschedule, status rules, professional choice in Citas.
- [x] F5D. Preview (rolled-back activation), idempotent carry-over (`booking.source_*`), conflicts block, rollback
  without losing bookings, reactivation applying legacy-mode changes; legacy rows never deleted.
- [x] F5E. PostgreSQL acceptance suite, commerce regression, browser verification, previous phases re-run.

## Evidence (2026-11-19)

| Check | Result |
|---|---|
| `bookings-pos-postgres.test.js` (scenarios 1-12 of the brief, real PostgreSQL, real POS/bookings/portal routers) | 8/8 |
| All bookings PostgreSQL suites (engine, backoffice, portal, slots, website, calendar, POS) | 37/37 |
| `node scripts/verify-bookings-pos.mjs` (disposable stack, browser: admin activation, hostess desktop light and phone dark, arrival, portal, appointments, roles, Calendar, backoffice) | 25/25 |
| `node scripts/verify-bookings-portal.mjs` (phase 3 regression) | 35/35 |
| `node scripts/verify-bookings-distribution.mjs` (phase 4 regression) | 34/34 |
| POS + catalog commerce suites (the files of `scripts/test-commerce-postgres.mjs`) on a copy of the current schema | 207/207 |
| POS unit tests; validators | 80/80; 3/3 |
| Read-only legacy audit on the development instance | 0 reservations, 0 appointments, 0 RESERVED tables |

Scenario map of the PostgreSQL suite: 1-3 (several non-overlapping reservations on one table, overlap and buffer
refused, capacity and best fit, physical occupation vs future time, walk-in guard), 4-5-7 (portal booking in POS, POS
booking closes the public slot, cancel frees it), 6 (POS and backoffice moving two bookings into one slot at once: one
wins, one allocation per live booking), 8 (arrival through C6, account linked, closed account completes the booking and
frees the table), 9 (company and outlet isolation; a legacy outlet keeps the legacy behaviour), 10 (preview, conflict
blocks, idempotent carry-over, history stays legacy, rollback copies a booking made after activation, reactivation
applies a legacy-mode cancellation, no duplicates), 11 (professionals without overlaps, started legacy appointment
carried, atomic reschedule, status rules), 12 (history create/update/cancelled, domain events, audit, one calendar
event).

Commerce regression, how it was run: `scripts/test-commerce-postgres.mjs` builds a frozen schema (baseline commit +
selected migrations up to 2026-12-24) that no longer matches the generated Prisma client (`pos_settings.accent_color`
missing), so 63 tests fail there before reaching POS logic; that is inherited and unchanged by this phase. The same
test files were run on a schema-only copy of the disposable stack (every migration). There, the membership trigger
`runly_user_reference` on `pos_order` refuses the fixtures' waiter (the fixtures create the actor without a
membership): 22 failures, identical with and without this phase's code (baseline run with the phase-5 code stashed:
185/207, same 22 names). With that trigger disabled in the copy (the frozen schema does not have it either): 207/207 with
this phase's code, covering comandas, kitchen, payments, partial captures, cancellations, refunds, session close and the
legacy seat of a reservation.

Found and fixed during the phase: the `pos-appointment-calendar` unit test fake lacked the new link model; the
Reservaciones help had no `capabilities.json` entry since phase 2 (the help test now passes). Inherited and unchanged:
`pwa-identities` and the Growth manifest test.

## Closing criteria

Met on 2026-11-19: POS registers, lists and manages real reservations and appointments through the Booking Engine,
tables are no longer blocked all day, appointments cannot overlap per professional, and the commerce suites show no
regression.
