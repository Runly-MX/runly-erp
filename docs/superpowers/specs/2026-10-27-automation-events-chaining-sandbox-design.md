# Automations: rich events, chaining and a real sandbox

Date: 2026-10-27. Builds on `2026-10-24-automation-studio-v2-design.md` and `2026-10-25-system-automations-design.md`.

## Problem

Feedback from using the module:

1. "Solo si" and the data pickers only offer the bare payload keys of an event (`id`, `caseId`, `status`). No label, no description, no example, so it is unclear where a value comes from and the blocks feel disconnected from the module that raised the event.
2. "Cuando pasa algo en Runly" almost only has "created" events. Updates, deletions and deactivations are missing. One automation cannot start another.
3. "Probar" only previews in the browser. It never runs the real engine, so there is no way to fire a trigger and watch the attempts.

## Design

### 1. Event catalog (data, not just names)

`packages/module-engine/src/event-catalog.js` is the single source for domain events: for each event its `label`, `module` (group shown in the picker), `description` and `fields`, each `{ key, label, type, description, example }`. `DOMAIN_EVENTS` and `DOMAIN_EVENT_PAYLOADS` are derived from it, so validators, the Developer Hub and the compiler keep working unchanged.

- `automationEvents()` returns the full catalog entry (plus `payload`, the key list, for old callers).
- Event payloads carry more fields (names, status, dates, amounts, who did it) so conditions and templates have real material to work with.
- New events: updated / deleted / deactivated for the main modules (inventory, contacts, projects tasks, fleet, hr, files, ledger, purchases) where the module already has that action.
- UI: the event picker is grouped by module and shows the description; the trigger inspector lists "Datos que trae este evento" (label, type, example, key); "Solo si" and every data picker use the labels with the description as helper text.
- More condition operators: `not_contains` ("No contiene"), `gte`, `lte`, `empty` ("Está vacío"). `matches` stays self-contained (it is inlined into generated modules).

### 2. Chaining

Event `automations.run.finished`, published by the run log (module and company automations alike) when a run reaches a final status (success, partial, failed, rejected). Payload: `automationKey`, `moduleKey`, `status`, `error`, `durationMs`, `depth`. An automation listens to it like to any event and filters with "Solo si" (`automationKey` equals `x`, `status` equals `failed`).

Loop guard: a run started by this event inherits `depth + 1`; at depth 3 no more events are published. Test runs never publish.

### 3. Sandbox

`POST /automations/test` (company automations; same router also for Builder modules through the module test route) runs the REAL engine (`execute`: conditions, branches, templates, outputs between steps) against `createServiceSimulator` with in-memory stand-ins for waits, approvals and HTTP, so nothing touches data, people or the network. The run is logged with `triggerKind: "test"` and appears in the automation's Consola (badge "Prueba"). The Probar dialog gets sample data from the catalog examples ("Cargar ejemplo"), a "Ejecutar prueba" button that calls the endpoint, and renders the same per-step detail as the Consola.

Optional later: "disparar de verdad" with a marked test payload through the real outbox.

## Stages

1. Catalog + UI (events, fields, descriptions, operators).
2. Chaining event + loop guard.
3. Sandbox endpoint + dialog + console badge.

## Verification

Compiler/engine unit tests per stage; API tests for the sandbox and the chain guard; `pnpm lint`; real boot smoke + E2E script for a run through the sandbox.
