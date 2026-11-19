# runly.bookings phase 2: official backoffice

Spec: `docs/superpowers/specs/2026-11-18-bookings-engine-design.md` (phase 2 row of section 7, decisions in 7.2).
Scope: ERP screens over the phase 1 engine. No public portal, no POS/Website/Calendar/Studio changes, no payments.

## Tasks

- [x] 1. Registration: `bookingsMap` listed in `core-modules.js` (seed installs it as a core module and
  upserts its three permissions), navigation `/spaces`, `/agenda`, `/reservations`, `/resources`, help
  `help/runly.bookings/overview.md`.
  Verified: 2026-11-19 (seed on the disposable Supabase stack: module INSTALLED + enabled, `bookings.access`,
  `bookings.spaces.manage`, `bookings.admin` active, 1 help blueprint; a second seed run is idempotent).
- [x] 2. Permission bootstrap: space membership manages the per-user `bookings.access` grant
  (`user_permission_grant`), granted on the first space, revoked with the last, `user_ctx` cache invalidated;
  the last admin of a space cannot be removed.
  Verified: 2026-11-19 (`bookings-backoffice-postgres.test.js`; browser: agent and viewer with an empty role see the module).
- [x] 3. Engine additions: weekly-rule validity (`valid_from`/`valid_to`, migration
  `20270108100000_bookings_rule_validity`), search with service/resource/text filters, paging and total,
  space summary, linked-resource reads, history with actor names, server-side xlsx export in the space zone,
  `actions` advertised on every booking from the engine's own transition table.
  Verified: 2026-11-19 (16/16 Postgres tests on the disposable stack).
- [x] 4. SDK `runly.bookings` (every call online only; idempotency key header) and screens in
  `apps/desktop/src/modules/runly.bookings/`: Mis sistemas, system detail (Resumen, Servicios, Recursos,
  Disponibilidad, Equipo, Configuración), Agenda (día/semana/mes), Reservaciones, Recursos.
  Verified: 2026-11-19 (eslint clean; vite build of the desktop app; `bookingsTime.test.js` 2/2).
- [x] 5. Browser journeys on the disposable stack (`.e2e/bookings-stack.mjs`, `.e2e/bookings-ui-e2e.mjs`,
  git-ignored): 32/32.

## Evidence

| Journey (brief section 7) | Where | Result |
|---|---|---|
| 1. Admin creates a BookingSpace | browser (desktop) + API test | created from "Nuevo sistema", creator is its admin |
| 2. Configures resource and service | browser | two staff resources, linked to the space, service with both as compatible |
| 3. Defines availability | browser + API test | weekly hours for 7 days; API test checks a 13:00-14:00 break and rule validity |
| 4. Manual reservation | browser | slot picked from the engine's availability, toast "Reservación registrada" |
| 5. The engine occupies the slot | API | one booking, one allocated resource, slot gone from availability |
| 6. Another user books the same resource and time | browser (phone) | agent's dialog open, someone takes the slot first, agent gets "Ese horario acaba de ocuparse" (409 SLOT_TAKEN) and the slot list refreshes |
| 7. Agent reschedules | browser (phone) + API test | rescheduled from the detail sheet; stale `expectedVersion` answers VERSION_CONFLICT |
| 8. Viewer reads, cannot modify | browser (dark) + API test | detail and history without actions or "Nueva reservación"; 7 write routes answer 403 |
| 9. Cancel frees capacity | browser + API test | cancelled from the agenda with confirmation; resource released; slot bookable again |
| 10. Another company sees nothing | browser script API + API test | 404 on space, summary, booking, cancel, service and member routes, even as that company's admin; empty lists |

Also verified: phone (390 px) light and dark on all six screens with no horizontal overflow, no page errors or 5xx
in any journey, history `create, reschedule, cancelled` with actor names, xlsx export with times in the space zone.

Inherited failures, unchanged and not caused by this phase (re-run with this phase's SDK/app changes stashed):
`pwa-identities` (runly.website icon), `storefront-capture-foundation-contract` (runly.growth navigation),
`growth-domain` and `sdk-website-domain` method contracts, `marketplace-browser`. `pnpm check:privacy`: the same
23 inherited findings, none in runly.bookings files.

## Closing criteria

Met on 2026-11-19: an admin and an authorized agent operate real reservations from the ERP, availability and
safety come from the Booking Engine (server re-validation, exclusion constraint, per-space roles on every route),
and a viewer consults without modifying.
