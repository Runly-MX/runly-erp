# Runly Boletos (runly.ticketing) v1: Release Candidate

Date: 2026-11-22. Status: **release candidate, verified locally only**. Nothing has been pushed or deployed. This document
does not declare production readiness: it lists what is verified, what needs physical tests and what depends on real
services. Spec: `docs/superpowers/specs/2026-11-20-ticketing-design.md` (section 12 = F6E as built). Plan with the
evidence of every phase: `docs/superpowers/plans/2026-11-20-ticketing-implementation.md`.

## 1. What is in v1

| Phase | Scope |
|---|---|
| F6B Core | Events with their own booking space, functions on the Booking Engine, ticket types and quotas, free issue, cancel, reissue, transfer, QR credential `RT1.<ticketId>.<secret>` (SHA-256 at rest), outbox events, hold expiry. |
| F6C Box office | Backoffice screens, paid tickets charged in Caja and confirmed by reading the POS sale on the server, refund-then-void. |
| F6D Check-in | Admission engine (row lock + partial unique index), reasons, window, rate limits, camera/manual gate screen, live counters. |
| F6E Distribution | Public event portal with free tickets without an account, buyer link and resend, ticket emails with QR, encrypted credential copy, Website block and embeds, Calendar mirror of functions, Automations triggers, function move/cancel. |

Out of v1 (by decision): online payment of paid tickets (needs Commerce D1: verified webhooks), Stripe, resale,
waitlists, recurring passes, Apple/Google Wallet, offline check-in, re-entry, seat maps.

## 2. Verified (local evidence)

| Script | Result | Date |
|---|---|---|
| `node scripts/verify-ticketing-core.mjs` | 21/21 | 2026-11-21 |
| `node scripts/verify-ticketing-box-office.mjs` | see plan F6C | 2026-11-21 |
| `node scripts/verify-ticketing-checkin.mjs` | 33/33 | 2026-11-21 |
| `node scripts/verify-ticketing-distribution.mjs` | **40/40** | 2026-11-22 |

The F6E script runs on a disposable stack (real Supabase in Docker, every migration and seed, the API and web of
the working tree, real auth, real Chromium) and covers, among others:

- publication from the UI (switches, cover upload) and an unpublished event unreachable;
- a visitor without an account obtaining free tickets on a phone (dark), with QR shown once;
- per-order limit, over-capacity refusal, 5 concurrent visitors for 3 seats (exactly 3), idempotent replay, rate
  limit (429) and company isolation;
- a real MIME email built by nodemailer from the real notifier, with the QR as inline images, no credential text;
- the email's QR image placed in front of Chromium's fake camera and admitted by the F6D gate screen;
- the buyer page, resend keeping the same credential, the resent QR admitted;
- reissue and transfer revoking the old QR, the encrypted copy (key id, nonce, version), a QR built from database
  data alone rejected, no credential in any order API;
- the Website card view, frame policy allowed/blocked by origin, an unlisted site refused inside an iframe;
- Calendar showing functions once and following a move;
- Automations offering `ticketing.*`, payloads without personal data;
- desktop and phone, light and dark, no horizontal overflow, no console errors or 5xx.

Regressions in the same run: ticketing PostgreSQL suites 39/39, Booking Engine and Reservaciones 66/66, Automations +
Website unit suites 286/286, Calendar unit suites 123/123.

Earlier v1.2 Reservaciones scripts touch the shared engine: `verify-bookings-rooms.mjs` (20/20),
`verify-bookings-meetings.mjs` (24/24) and `verify-bookings-calendars.mjs` (24/24). Re-run them if the engine changes
again before deploying.

## 3. Requires physical tests or real services

- **SMTP**: delivery, spam placement and image rendering in Gmail, Outlook and Apple Mail (inline `cid` images).
  Locally emails are real MIME but sent to no server. "sent" will mean the SMTP server accepted the message.
- **Phones and readers**: the camera path is verified with Chromium's fake camera playing the emailed QR. Real Android
  and iPhone cameras, screen brightness and hardware scanners are untested.
- **nginx**: the web image must ship the new `infra/nginx/spa.conf` (`location ^~ /app/p/boletos/` with its own frame
  gate). Locally the frame-policy endpoint and the in-page guard are verified, not the served headers.
- **Website**: the public runtime build must include `TicketingEventBlock` (rebuilt by `pnpm docker:release`).
  Verified on the real publication pipeline with a runtime built from the working tree.
- **Two gates and a full house on staging**: concurrency is proven on PostgreSQL and in browsers, not with people.

## 4. Deployment order

Release API, worker and web **from the same commit** (`pnpm docker:release`, then `./update-local.sh` on each VPS).

1. **Back up the database** and note the running image tags.
2. **Pending migrations** (applied by the API entrypoint unless `RUNLY_SKIP_DB_INIT=1`): R2/R3 of Reservaciones and
   `20270112000000_bookings_meetings`, `20270112100000_ticketing_distribution` (plus any earlier ticketing ones not
   yet applied: `20270110000000_ticketing_core`, `20270110100000_ticketing_box_office`, `20270110300000_ticketing_checkin`).
   All additive. Check with `pnpm exec prisma migrate status`.
3. **Environment** (shared by API and worker, identical values):
   - `TICKETING_CREDENTIAL_KEYS="k1:<base64 of 32 random bytes>"` (generate with
     `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`). Keep it only in the instance's
     secret store, never in the database or backups of it. Without it tickets still work but cannot be resent.
   - `TICKETING_LINK_SECRET`: a dedicated random value (falls back to `BOOKINGS_LINK_SECRET`/`JWT_SECRET`; rotating it
     invalidates every buyer link already emailed).
   - `PUBLIC_APP_URL` (event and buyer links) and `RUNLY_API_URL` (already set by the installer).
   - Platform `SMTP_*` or SMTP per company; without it ticket emails end `skipped`.
4. **Worker** with the same image right after the API; stop any older worker on the same database (it would not send
   ticket emails, mirror functions or open sealed credentials).
5. **Web image** rebuilt (nginx `spa.conf`, public routes, Website runtime).
6. **Module sync**: `runly.ticketing` manifest 0.4.0 (help, owned entities). Sync from Módulos after deploy.
7. **Post-checks**: `GET /health`; worker log shows `ticketing emails` / `ticketing calendar` ticks without errors;
   `curl -sI <app>/app/p/boletos/<slug>?embed=1` returns the authorized origins in `frame-ancestors`; publish a test
   event, obtain a free ticket, receive the email, resend, admit it at the gate, then unpublish it.

## 5. Key rotation

1. Generate a new key and prepend it: `TICKETING_CREDENTIAL_KEYS="k2:<new>,k1:<old>"`. New credentials are sealed
   with `k2`; existing rows (`key_id = 'k1'`) still open.
2. Rows move to `k2` as tickets are reissued or transferred. To retire `k1` sooner, reissue the remaining tickets of
   upcoming functions (`SELECT count(*) FROM ticket_credential_secret WHERE key_id = 'k1'`), then remove `k1`.
3. A removed key makes its rows unreadable: resend answers `REISSUE_REQUIRED` for them (never a wrong QR).

## 6. Rollback

Migrations are additive (new columns, new tables). Older images ignore them. Restore API, worker and web tags
together. Tickets issued in F6E keep working at older gates (validation is the same SHA-256); only resend, portal,
Calendar mirror and Website block stop. Restore the database backup only for corruption.

## 7. Risks

| Risk | Impact | Mitigation | Blocks |
|---|---|---|---|
| Typed ticket code after a reissue (known since F6D) | The human folio identifies the ticket, not the credential version: after a reissue the old printed folio still admits. | Proposed (not built, needs approval): rotate the folio on reissue/transfer and record the old one as revoked. Until then gates show the holder name before "Registrar entrada" and the audit marks `method = code`. | Real pilot (decide first) |
| Tickets issued before F6E | No sealed copy: they cannot be resent, only reissued. | Explicit `REISSUE_REQUIRED` message; staff reissue on request. Nothing is reissued or invalidated automatically. | None |
| Vault key handling | Losing `TICKETING_CREDENTIAL_KEYS` disables resend for existing tickets (not admission). Leaking it plus a database dump exposes valid QR codes. | Secret store only, rotation procedure (section 5), never in database backups. | Production |
| `TICKETING_LINK_SECRET` rotation | Invalidates every buyer link already emailed. | Set once per instance before the first public event. | Staging |
| Email deliverability | Inline images may be hidden by some clients until the reader allows images. | The email also names the folio (manual entry at the gate) and links "Ver mis boletos". Real SMTP test. | Staging |
| Atlas catalog snapshot | `TicketingEventBlock` is in the editing catalog (158 blocks), not in the frozen Atlas 0.9.0 snapshot (157). Website templates/ZIPs and the Hub validate against 0.9.0 and do not know the block yet. | Include it in the next Atlas catalog snapshot; sites built in the ERP editor are unaffected. | None for the ERP |
| API-worker version skew | An older worker does not send ticket emails or mirror functions. | Deploy both together (section 4). | Production |
| Inherited test failures | Two SDK suites (growth and website domains) fail on `main`, unrelated to Ticketing. One Reservaciones calendar test failed once in a combined local run and passed on every re-run. | Tracked; not caused by this release. | None |

## 8. Gates

**Pending for staging**: deploy following section 4; dedicated `TICKETING_LINK_SECRET` and `TICKETING_CREDENTIAL_KEYS`;
real SMTP pass (issue, resend, reissue, transfer); device pass on one Android phone, one iPhone and the gate device;
nginx headers on the real web image; one session with two gates and a full function; decision on the typed-code risk.

**Blocks production**: any staging item above that fails; database backup not taken; migrations not applied cleanly;
API and worker on different versions; web image without the new `spa.conf`; `TICKETING_CREDENTIAL_KEYS` not stored
outside the database.

Ticketing v1 is **apt as a release candidate**: a company can publish an event, a visitor can obtain free tickets
without signing in, receive and resend them safely, and use them at the existing access control, with Website,
Calendar and Automations verified locally. Production readiness depends on section 8.
