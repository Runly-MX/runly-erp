# runly.attendance — working notes for AI sessions

Spec `docs/superpowers/specs/2026-10-11-attendance-design.md`, plan `docs/superpowers/plans/2026-10-11-attendance.md`.

## Where things live
- Prisma models `Att*` (`prisma/schema.prisma`, table prefix `att_`). No FK to company (canvas convention). `AttPerson` has a unique `(companyId, hrEmployeeId)`; `AttPunch.id` is client supplied (UUID v7) for idempotent sync.
- API `apps/api/src/routes/attendance/`:
  - `attendance-core.js` pure rules (PIN hash PBKDF2, signed phone payload `RA1.<personId>.<ts>.<sig>`, sessions, presence, quotas, clock skew). Unit tested.
  - `attendance-service.js` catalogs, people, punches, reports, kiosks (admin). `attendance-hr.js` HR link/suggestions/employee summary. `attendance-import.js` people import (parse, preview, commit, xlsx template).
  - `attendance-kiosk-service.js` + `attendance-public.js` the unauthenticated side (`/public/attendance/*`: pair, pair-status, roster, sync, enroll). Device token = `Authorization: Kiosk <token>`.
  - `attendance-routes.js` the authenticated router; `mirai-capabilities.js` read-only MirAI tools.
- Desktop `apps/desktop/src/modules/runly.attendance/`: `screens/`, `components/`, `hooks/`, `lib/` (admin), `kiosk/` and `phone/` (public, offline), `components/import/` (people import). HR employee detail shows `runly.hr:AttendanceSection`. Service worker `apps/desktop/public/sw-kiosk.js`.
- Help: `apps/api/src/manifests/official/help/runly.attendance/` (overview + one view per screen; re-sync modules after editing).

## Rules worth remembering
- Never trust a kiosk punch blindly but never drop it: suspicious punches are stored with `status: flagged` and `flags[]`.
- HR link: an attendance person may exist without HR; when linked, HR (and its Runly user) is the same identity. Linking enforces one person per employee.
- Import maps columns with aliases (`IMPORT_FIELDS`); unknown groups/categories are created only with `createMissing`, shifts are never created by import.
- Credential types: `card`, `device_key` (status `active|pending|revoked`).
- Local verification: scripts in `.e2e/attendance-*.mjs` (git-ignored) run against a throwaway API on another port (`RUNLY_API_PORT`); never touch the user's 4010/5173 servers.

## Live updates (how screens stay current)
- Admin panel: every successful write under `/attendance/*` and the public kiosk/phone writes (pairing request, sync, phone punch, selfie, enroll, correction) call `createAttendanceEvents().changed()` (`attendance-events.js`), which broadcasts `attendance.changed` on `company:<id>:events`. `RealtimeProvider` invalidates the `['attendance']` queries. Hooks keep a 20-30 s poll plus refetch-on-focus/reconnect as a safety net (the app-wide default is 5 min stale and no refetch on focus).
- A new forgotten-punch request also publishes a notification (`attendance.correction.requested`) to admins and anyone with `attendance.punch.manage` / `attendance.config.manage`.
- Kiosk (no Supabase session, so no websocket): polls `GET /public/attendance/kiosk/:link/changes` every 2 s. It returns phone punches plus `rosterVersion` (fingerprint of people, active credentials, groups, categories, sites, settings and kiosk config; `lastUsedAt` is deliberately excluded). The kiosk re-downloads the roster when the version differs from its cached one, so new phone keys/cards appear within seconds. A successful poll also clears the "offline" state.
- Phone (public page): `POST /public/attendance/me` is refreshed every 15 s while visible, on focus and on reconnect. "Mis solicitudes" shows pending vs answered requests (`corrections`, last 40) and a badge for answers not yet opened (seen ids kept in localStorage).
