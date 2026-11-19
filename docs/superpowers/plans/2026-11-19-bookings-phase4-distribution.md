# runly.bookings phase 4: distribution, Website block, external embeds, Calendar and Automations

Spec: `docs/superpowers/specs/2026-11-18-bookings-engine-design.md` (decisions in 7.4).
Scope: F4A secure distributable portal, F4B Runly Website native block, F4C external integration, F4D Calendar
projection and Automations events. No POS, payments, Ticketing, Studio or legacy Website booking changes.

## Tasks

- [x] F4A. Portal without the ERP boot splash; `?embed=1` mode (client origin guard, height reporting, manage links in a
  new tab); `GET /public/bookings/frame-policy` + nginx `location /app/p/reservar/` (auth_request, CSP frame-ancestors,
  admin-host gate); write rate limits shared in PostgreSQL; worker prunes buckets; migration
  `20270108300000_bookings_distribution`.
- [x] F4B. `BookingPortalBlock` in `@runly/website-blocks` (calendar, button, link), block catalog regenerated, editor
  selectors from `GET /bookings/pages/published`, publication binding and pinned `portalUrl`, site CSP `frame-src`
  limited to the portal origin, publication error messages.
- [x] F4C. "Compartir e integrar" dialog (link, iframe + `/runly/bookings-embed.js`, button, authorized sites).
- [x] F4D. `bookings-calendar.js` projection (API after commit + worker sweep), read-only events in Calendario with a deep
  link to the reservation, bookings events enabled as Automations triggers.
- [x] Versioned verification `node scripts/verify-bookings-distribution.mjs`.

## Evidence (2026-11-19)

- `node scripts/verify-bookings-distribution.mjs`: **34/34**, exit 0 (disposable Supabase, API, web build, real worker
  process, nginx:alpine running `infra/nginx/spa.conf`, Chromium).
- `node scripts/verify-bookings-portal.mjs` (phase 3 regression, same tree): **35/35**, exit 0; its PostgreSQL step now
  runs every bookings suite, 29/29 (engine 10, backoffice 2, portal 7, slots 4, website block 2, calendar 4).
- Unit: validators 3/3, `embedSnippets.test.js` 3/3 (snippets, embed guard, editor selectors), module-compiler 149/149,
  automations services 40/40, website route tests 129/129 + security 118/118, website lib 17/17. ESLint clean on the
  changed files. `nginx -t` on `spa.conf` OK. `pnpm check:privacy`: the same 23 inherited findings.

| Subphase | Check | Result |
|---|---|---|
| F4A | Portal opens without the ERP splash/loader | PASS |
| F4A | Frame policy: manage link `'none'`, plain portal `'self'`, embed lists authorized sites; website host 403 | PASS (API and real nginx) |
| F4A | Write limits shared by two API instances (7th attempt across both refused); no IPs at rest | PASS (portal suite) |
| F4A | Worker as a real process: expires holds, processes the email outbox (no SMTP = skipped) | PASS |
| F4B | Publish with the block: binding + pinned portal URL; site CSP `frame-src` = portal origin only; none without block | PASS |
| F4B | Second release as button, rollback restores the first configuration, draft keeps the newest | PASS |
| F4B | Another company's page = not found; unpublished page; service not on page; no page | refused with codes |
| F4B | Real booking from the published Runly Website, then in backoffice and Calendario | PASS |
| F4C | "Compartir e integrar": HTTP site refused, authorized site saved, snippets generated from the page | PASS |
| F4C | External authorized site: booking desktop light; phone dark with touch, no horizontal overflow, auto height | PASS |
| F4C | External unauthorized site: Chromium refuses the frame (CSP frame-ancestors) | PASS |
| F4D | One event per booking; pending/confirmed titles; reschedule moves; cancel/expiry removes; duplicates healed | PASS |
| F4D | 8 concurrent projections + sweep = 1 event; no duplicates in the E2E database | PASS |
| F4D | Space members see the event, a company user outside the space does not; leaving the space revokes | PASS |
| F4D | No email/phone/notes in calendar events or event payloads | PASS |
| F4D | Deleting the calendar event keeps the slot taken (engine refuses a second booking) | PASS |
| F4D | Real worker delivers `bookings.booking.created` to a company automation once | PASS |

Found and fixed during verification: the global website origin guard answered 404 (nginx turns it into 500) for
`/public/bookings/frame-policy` on a website host; it now reaches the handler, which answers 403.

Inherited failures listed in phases 2-3 (`pwa-identities`, `storefront-capture-foundation-contract`, `growth-domain`,
`sdk-website-domain`, `marketplace-browser`) were not re-run in this phase; the full repository suite was not run.

## Closing criteria

Met on 2026-11-19: bookings made from an external iframe and from a published Runly Website go through the same engine
and appear in the backoffice and in Calendario; only authorized sites can frame the portal; nothing in phase 3 regressed.
