# Runly Reservaciones (runly.bookings) v1: Release Candidate

Status on 2026-11-20: **Release Candidate**. Code-complete and verified on disposable stacks. Not deployed to staging
or production, and no outlet activated on any real environment. No new features beyond F0-F5.1.

## 1. What is in v1

| Phase | Scope | Closing document |
|---|---|---|
| F0-F1 | Booking Engine: schema, seven-state machine, allocations with exclusion constraints, idempotency, holds | `docs/superpowers/plans/2026-11-18-bookings-phase1-engine.md` |
| F2 | Module registration, backoffice screens and API | `docs/superpowers/plans/2026-11-19-bookings-phase2-backoffice.md` |
| F3 | Public portal without login, manage links, customer emails, hold expiry | `docs/superpowers/plans/2026-11-19-bookings-phase3-portal.md` |
| F4 | Distribution: secure embeds, Website block, share links, Calendario projection, Automations events | `docs/superpowers/plans/2026-11-19-bookings-phase4-distribution.md` |
| F5 | POS table reservations and appointments on the engine, activation with preview, rollback | `docs/superpowers/plans/2026-11-19-bookings-phase5-pos.md` |
| F5.1 | Production hardening: occupation as engine capacity, outlet IANA zones, safe rollback, read-only audit, framing headers, RLS | `docs/superpowers/plans/2026-11-20-bookings-phase5-1-hardening.md` |

Commits: `64304f1e0` (phase 0) through `e534e50b6` (F5.1 report). As of this document, `7572a5935`, `e534e50b6` and the
F6A docs commit `87ec8d0a2` are local only (not pushed). There are no uncommitted Reservaciones changes.

## 2. Approved (evidence in the closing documents)

| Check | Result |
|---|---|
| All bookings PostgreSQL suites (engine, backoffice, portal, calendar, website, POS) | 36/36 (F5.1) |
| Commerce POS + catalog suites on the current schema with membership triggers enabled | 207/207 (F5.1) |
| `verify-bookings-pos.mjs` (browser: activation, hostess desktop and phone, portal, roles, Calendario) | 25/25 (F5.1) |
| `verify-bookings-portal.mjs` | 35/35 (F5) |
| `verify-bookings-distribution.mjs` | 34/34 (F5) |
| `verify-nginx-frame-headers.mjs` (real nginx with `infra/nginx/spa.conf`) | 7/7 (F5.1) |

Not run: the full repository test suite. Inherited failures unrelated to Reservaciones are recorded in the phase 2-5
documents (`pwa-identities`, `storefront-capture-foundation-contract`, `growth-domain`, `sdk-website-domain`,
`marketplace-browser`).

## 3. Deployment order

Release API, worker and web **from the same commit**. The usual flow applies: `pnpm docker:release` here, then
`./update-local.sh` on each VPS.

1. **Back up the database** (installer backup or `pg_dump`) and note the image tags currently running (for rollback).
2. **Pre-checks** on the target database, read-only:
   - `pnpm exec prisma migrate status`: no failed migration. Note which of the six Reservaciones migrations are
     pending:
     `20270108000000_bookings_engine`, `20270108100000_bookings_rule_validity`, `20270108200000_bookings_portal`,
     `20270108300000_bookings_distribution`, `20270108400000_bookings_pos_integration`,
     `20270108500000_bookings_pos_hardening`.
   - `AUDIT_DATABASE_URL=... node scripts/audit-pos-bookings-legacy.mjs > audit-<env>-before.json`. Before migration
     0400/0500 it lists them as a blocker; that is expected at this point.
3. **Environment** (shared `.env` file of API and worker):
   - `BOOKINGS_LINK_SECRET`: set a dedicated random value (see risks). It must be identical for API and worker.
   - Public ERP origin (`PUBLIC_APP_URL`, or `APP_URL` / `RUNLY_APP_URL`, as the instance already uses for other
     emails). Manage links and embeds are built from it.
   - Platform `SMTP_*`, or SMTP per company in Ajustes: without it, customer emails are recorded as `skipped`.
   - `RUNLY_BOOKINGS_TICK_MS` (optional, default 30000). Keep it well under 30 minutes.
4. **API container start**: the entrypoint runs `prisma migrate deploy` and `node prisma/seed.js`, unless
   `RUNLY_SKIP_DB_INIT=1`. The seed registers `runly.bookings` (core) and its permissions. With
   `RUNLY_SKIP_DB_INIT=1`, run both commands by hand before starting the API.
5. **Worker**: start it right after the API, with the same image version. Then stop **every** older worker that shares
   the database (see the API-worker sync risk).
6. **Web image** (it ships `infra/nginx/spa.conf`): rebuild and restart it so the framing headers apply.
7. **Post-checks**:
   - `GET /health` is OK.
   - The worker log shows `[worker] bookings` ticks without errors.
   - `curl -sI <app>/app/` contains `frame-ancestors 'self'`.
   - A booking page with `?embed=1` returns the authorized origin, and `/app/p/reservar/gestion` returns `'none'`.
   - Run `audit-pos-bookings-legacy.mjs` again: the migration blocker is gone.

## 4. Mandatory legacy audit before activating any outlet

POS outlets stay in legacy mode after the update. Activation is a separate, per-outlet admin action.

1. Run `AUDIT_DATABASE_URL=... node scripts/audit-pos-bookings-legacy.mjs > audit-<env>.json` on each environment. It
   is read-only (`BEGIN READ ONLY`) and outputs counts and ids only, never personal data.
2. Clear every entry in `blockers` in POS first:
   - every enabled outlet has an IANA zone (Administración > General > sucursal);
   - no overlapping live reservations on one table;
   - no party larger than its table.
3. Per outlet, in Administración > Reservas: **Revisar**. It is a preview and changes nothing. Then confirm the zone
   shown, then **Activar**. Activation refuses with 409 if any carried record does not fit.
4. Activate one pilot outlet first, observe one service, then the rest.

## 5. Rollback

Prisma migrations have no down step, and applied migrations are immutable. Rollback means older images plus the
additive schema left in place. Both 0400 and 0500 are additive and backward compatible with older images:

- new nullable columns and new tables;
- the allocation owner check still accepts the older writers;
- RLS and `REVOKE` affect only the public PostgREST roles, not the API's owner role.

Order matters:

1. **Return every engine outlet to legacy first, while the new images still run.** For each active row in
   Administración > Reservas, click **Volver al modo anterior**. This copies live engine reservations into POS, re-marks those
   tables `RESERVED` and releases the account holds.
2. Check on the database, read-only. Both counts must be 0:
   ```sql
   SELECT count(*) FROM pos_booking_link WHERE mode = 'engine';
   SELECT count(*) FROM booking_allocation WHERE pos_order_id IS NOT NULL AND active;
   ```
3. Restore the previous API, worker and web image tags together.
4. Never roll images back with outlets still in engine mode:
   - older POS code ignores engine reservations, so tables get double-booked;
   - the older worker never releases account holds, so tables look busy online.
5. Restore the database backup only for data corruption. A restore loses every booking made since the backup.

## 6. Remaining risks

| Risk | Impact | Mitigation | Blocks |
|---|---|---|---|
| `BOOKINGS_LINK_SECRET` not provisioned by the installer | Links fall back to `JWT_SECRET`. Rotating it invalidates every customer manage link already emailed. | Set a dedicated value per instance before the first public booking, and never rotate it casually. | Staging (recommended) |
| API-worker version skew | Only the new worker extends holds of open POS accounts. An older worker on the same database lets a table occupied past one turnover show online as free. A stopped worker also stops hold expiry, emails, the Calendario projection and Automations events. | Deploy API and worker together, check no older worker shares the database, then activate. | Production |
| Email delivery | Verified only against a test SMTP sink. "sent" means the SMTP server accepted the message. Real provider deliverability (SPF/DKIM, spam folders) is untested. | Real SMTP test in staging: book, reschedule, cancel; check the inbox and the manage link. | Staging |
| Physical device QA | Phone dark mode was covered in a headless browser. Real phones and tablets are untested: zone selector, hostess screen with a device in another zone, portal on a mobile network. | Manual pass on one Android phone, one iPhone and the POS tablet. | Staging |
| Two-operator concurrency on real hardware | Concurrency is proven on PostgreSQL, but not with two hostesses and one portal customer at once on staging. | One scripted session on staging. | Staging |
| Framing headers | The ERP can no longer be framed by third-party sites. Only booking embeds on authorized origins can be. | Confirm no customer frames the ERP itself. | None (expected) |
| Extension conflicts | An account open past the next reservation is not extended over it. The reservation keeps the table, and the worker logs `conflicts`. | Hostess resolves it on the floor. This behavior is deliberate. | None |
| Inherited test failures | Five suites unrelated to Reservaciones fail on `main`. | Tracked in the phase documents. | None |

## 7. Gates

**Pending for staging:**
- deploy following section 3;
- dedicated `BOOKINGS_LINK_SECRET`;
- real SMTP pass;
- device QA;
- two-operator session;
- audit on a copy of production data;
- pilot activation and a rollback rehearsal following section 5.

**Blocks production:**
- any staging item above that fails;
- database backup not taken;
- migrations 0400/0500 not applied cleanly;
- API and worker not on the same version, or an older worker still attached to the database;
- web image with the new `spa.conf` not deployed;
- audit `blockers` not empty for an outlet about to be activated;
- `BOOKINGS_LINK_SECRET` not decided before the first public booking.

## 8. v1.1: form layout pass and first post-deploy checks (2026-11-20)

UI-only change in `a1e12ef41`: service, settings, booking, session, exception and public-page forms (the page form is
now a side sheet), schedule rows on phones, and the POS reservations panel. No API, schema, permission or rule change.

Verified: 2026-11-20 (`verify-bookings-portal.mjs` 35/35, `verify-bookings-pos.mjs` 25/25, local
`.e2e/bookings-ui-e2e.mjs` 45/45 with desktop light and phone dark form checks, lint and web build clean).
`verify-bookings-distribution.mjs` was not re-run: embeds, share links and the Website block were not touched.

Post-deploy checks done from outside, read-only, against the production web origin:

- `/app/` sends `frame-ancestors 'self'`, `/app/p/reservar/gestion` sends `'none'`: the new `spa.conf` is live.
- `/api/health` OK. `/api/public/bookings/pages/<unknown>` answers 404 `PAGE_UNAVAILABLE` and `/manage` with a bad
  token 404 `LINK_INVALID` (no 5xx, so the portal tables exist). `/runly/bookings-embed.js` is served.
- `/api/health` reports no version, so the API image version cannot be confirmed from outside.
- No `Strict-Transport-Security`, `X-Content-Type-Options` or `Referrer-Policy` header on `/app/`. Not specific to
  Reservaciones; decide at the proxy level.

Still to do on each VPS (needs shell or database access): `prisma migrate status`, the API and worker image tags
match, `[worker] bookings` ticks in the worker log and no older worker on the database, `BOOKINGS_LINK_SECRET` is
set (check presence only, never print it), a real SMTP pass (book, reschedule, cancel), the legacy audit before
any outlet activation, and a booking from an external site using the embed.

## 9. Ticketing (F6A) is architecture only

`docs/superpowers/specs/2026-11-20-ticketing-design.md` and `docs/superpowers/plans/2026-11-20-ticketing-implementation.md`
stay as design documents. Nothing of `runly.ticketing` is implemented and it is not part of this release.

Dependency to note: **paid online tickets need a trustworthy payment confirmation from Commerce (D1)**. Today the
Website checkout creates a Stripe session but records no order and has no verified webhook. Free tickets and box-office
sales through POS (D2) do not depend on it.
