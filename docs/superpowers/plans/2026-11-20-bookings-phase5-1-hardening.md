# runly.bookings F5.1: production hardening of the POS integration

Follows `2026-11-19-bookings-phase5-pos.md`. Scope: close the production risks found after F5, without deploying or
activating anything. Nothing was pushed, deployed or activated on any real environment.

## Changes

| # | Risk | Resolution |
|---|---|---|
| 1 | Commerce suites passed only with the `runly_user_reference` trigger disabled. | `scripts/test-commerce-current-schema.mjs` runs every POS and catalog suite on a schema-only copy of the **current** schema (all migrations + seed) with every trigger and membership guard enabled. Fixtures that created operators without a membership now create one (`pos-recovery-postgres`, `pos-restaurant-phase4-postgres`), which is what production requires. `scripts/test-commerce-postgres.mjs` keeps its frozen-schema migration checks. |
| 2 | Online availability near "now" depended on `pos_table.status` (physical state checked outside the engine, racy and not seen by the public portal). | Physical occupation is engine capacity: an open POS account holds its table's resource through an allocation it owns (`booking_allocation.pos_order_id`, no booking row, events or calendar entry). The exclusion constraint keeps online and POS reservations off busy tables. A walk-in holds one turnover, or is refused with the time of the next reservation. The worker (`maintainOccupancy`) extends open accounts 30 minutes at a time, never over the next reservation (counted as a conflict), and releases closed accounts. Activation holds the accounts already open. `busyNow` / `assertTableWalkIn` / `excludeResourceIds` from the POS side are gone. |
| 3 | Engine spaces were created with a hard-coded `America/Mexico_City`. | `pos_outlet.timezone` (IANA, validated against `pg_timezone_names`). Activation uses the outlet's zone; an outlet without one takes the zone sent (shown in the activation dialog) and keeps it. Changing the zone moves the linked spaces with it (bookings are instants and do not move); a linked outlet cannot drop its zone. The hostess screen computes days, times and the form in the outlet's zone, whatever the device's zone (DST-safe, a 23-hour day lists correctly). Selector in Administración > General > sucursal. |
| 4 | The legacy audit could only read the configured database and gave totals only. | `scripts/audit-pos-bookings-legacy.mjs` runs in a `READ ONLY` transaction, accepts `AUDIT_DATABASE_URL` for any environment, and adds per-outlet counts (ids only, no personal data) and a `blockers` list: missing migrations, outlets without a zone, overlapping legacy reservations on one table, parties over table capacity. |
| 5 | Rollback to legacy left tables `AVAILABLE` while they had reservations taken in engine mode; legacy mode's only guard is `RESERVED`, so a second reservation or a walk-in could take them. | Rollback re-marks as `RESERVED` every free table with a live confirmed reservation and releases the account holds (meaningless in legacy mode). |
| 6 | Embedding and deployment. | `infra/nginx/spa.conf`: the ERP SPA and `/p/` pages send `frame-ancestors 'self'` (clickjacking); booking embeds keep their per-URL policy from the API; manage links `'none'`; the ERP is never served on a website hostname. `scripts/verify-nginx-frame-headers.mjs` checks the headers real nginx sends. Migration `20270108500000_bookings_pos_hardening`: `pos_order_id` + owner check, `pos_outlet.timezone`, and RLS enabled + `REVOKE` from `PUBLIC`/`anon`/`authenticated` on every bookings table (the API role owns them, so it is unaffected). |

## Evidence (2026-11-20, disposable stacks only; 4010/5173 and the regular database untouched)

| Check | Result |
|---|---|
| All bookings PostgreSQL suites (engine, backoffice, portal, calendar, website, POS), including the 3 new F5.1 scenarios: occupation as engine capacity (walk-in closes near online slots, 409 on the portal, extension, no extension over the next reservation, release on close); outlet zone (validation, activation needs one, space follows, DST day); rollback restoring `RESERVED` | 36/36 (F5 had 33 test cases; its "37" counted differently) |
| `node scripts/test-commerce-current-schema.mjs` (POS + catalog suites, triggers enabled) | 207/207 |
| `node scripts/verify-nginx-frame-headers.mjs` (nginx:alpine with the real `spa.conf`) | 7/7 |
| `node scripts/verify-bookings-pos.mjs` (browser; re-run because the hostess screen and activation changed) | 25/25 (activation shows the zone; hostess desktop light and phone dark; portal; roles; Calendar; no page errors or 5xx) |
| POS and bookings unit tests | 84/84 |
| `node --check` and ESLint on every changed file | clean |

Not re-run (no shared code changed): `verify-bookings-portal.mjs` (35/35 in F5) and `verify-bookings-distribution.mjs`
(34/34 in F5). The portal PostgreSQL suite above covers the availability path they share.

## Production readiness: blockers

Must be done before the first activation in an environment:

1. **Apply migrations** `20270108400000_bookings_pos_integration` and `20270108500000_bookings_pos_hardening` (forward
   only). The audit reports them as a blocker while missing.
2. **Deploy API and worker together.** Holds of open accounts are extended only by the new worker. With an older worker
   on the same database, a table occupied longer than one turnover is offered online again. Do not activate an outlet
   until every worker that shares the database runs this version.
3. **Run the audit per environment** (`AUDIT_DATABASE_URL=... node scripts/audit-pos-bookings-legacy.mjs > audit-<env>.json`)
   and clear its `blockers`: set each outlet's zone, resolve overlapping legacy reservations and parties over capacity
   in POS. Then use the per-outlet preview (`Revisar`) before `Activar`.
4. **Web image rebuild** so the new `spa.conf` ships. Effect to know: no third-party site can frame the ERP any more
   (only booking embeds on authorized origins).

Recommended, not blocking:

5. Set a dedicated `BOOKINGS_LINK_SECRET` on each instance. Without it, manage links are signed with `JWT_SECRET`, and
   rotating that secret invalidates every customer's manage link. The installer does not provision it today.
6. Phone/tablet pass of the zone selector and of the hostess screen with a device in a different zone than the outlet
   (covered by code and API tests, not by a browser run on a real device).

## Known limits

- An account that stays open past the next reservation cannot be extended over it: the reservation keeps its table in
  the engine and the hostess resolves it on the floor (worker logs `conflicts`). This is deliberate: the engine never
  double-books.
- Holds are extended once less than 30 minutes remain, on a 30-second worker tick (`RUNLY_BOOKINGS_TICK_MS`). A
  table only becomes bookable while still occupied if the worker is stopped for longer than that margin.
