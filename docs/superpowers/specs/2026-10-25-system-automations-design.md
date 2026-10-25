# Automations for system modules (design and plan)

Status: approved (autonomous decision, 2026-10-25)
Builds on: Automation Studio v2 stages A-C (steps, conditions, waits, schedules, HTTP, approvals, run log, test run).

## Problem

Domain events (purchase orders, employees, tasks, courses, vehicles, inventory, calendar, files, contacts) and the whole step engine only reach people through modules made with the Builder. An administrator who wants "when a purchase order is approved, notify the warehouse" or "every Monday, create the weekly review task" has to create a custom module just to host the automation.

## Decision

A company-level "Automatizaciones" screen in Runly Core where an administrator creates automations that are **not tied to a module**. They use the same definition shape, validation, step engine, run log, waits, approvals, HTTP step and "Probar" as Builder automations.

Scope limits (deliberate):
- Triggers: **system domain event** or **schedule** (without records). There is no "when a record is saved" trigger because there is no entity; that stays a Builder feature.
- Steps: system services only (the same rule as event/schedule triggers), plus waits, approvals and HTTP. No step needs a person, so everything runs in the background.
- One company at a time: an automation belongs to the active company and only sees that company's events.
- Permission: `core.modules.manage` (administrators), to avoid adding a permission to every deployed instance for now.

## Design

### Storage

`system_automation(id uuidv7, company_id, key, label, enabled, definition jsonb, created_by_id, created_at, updated_at)` with `unique(company_id, key)`. `definition` is the normalized automation (`trigger`, `steps`, `onError`), identical to a Builder `automations[]` item. Forward migration, additive. Limit: 50 per company.

### Validation

`validateSystemAutomation(automation)` in `@runly/module-compiler` wraps the existing validator with an empty entity list and rejects `record` triggers and entity-scoped schedules. The API returns the same diagnostics the Builder shows.

### Execution (reusing the engine)

The step runner (`runSteps`, `execute`, `runEntry`) moves from the generated module template into `@runly/module-engine` so the generated code and the API share one implementation (the template inlines the functions, so Builder modules keep working unchanged).

- A pseudo module key `system.automations` identifies these automations in runs, jobs, approvals and service grants.
- **Events**: the domain event dispatcher, after delivering to subscribed modules, runs the company's enabled system automations whose trigger event matches and whose conditions hold. Idempotency base `<key>:<eventId>`; failures make the dispatcher retry the event (steps are idempotent).
- **Waits / approvals**: jobs and approvals carry `module_key = 'system.automations'`. The worker resumes them from the stored definition (`resume`), with no module-installed check.
- **Schedules**: `automation_schedule` rows with the pseudo key, created only for the owning company; the worker fires them through `runScheduled` equivalent for system automations.
- **Service grants**: saving an automation grants the services it uses to `system.automations` for that company (company-specific grants), and removes grants no longer used. Saving is the administrator's consent.

### API (`core.modules.manage`)

`GET /automations`, `GET /automations/catalog` (events with payload fields, services usable without a person), `POST /automations`, `PUT /automations/:key`, `DELETE /automations/:key`. Runs, pending waits and cancel reuse `/modules/system.automations/automation-runs|automation-jobs`.

### UI

Navigation "Automatizaciones" in Runly Core. The screen lists automations as the Builder cards (trigger, conditions, steps, Probar), each with its own **Guardar** (validation diagnostics shown inline) and a delete confirmation, plus the Historial panel. Reuses `AutomationCard`, `AutomationSteps`, `AutomationRunsPanel`, `AutomationTestDialog` and the allowed-destinations dialog; the card takes an `allowedTriggers` prop (event, schedule) and a `systemMode` that hides entities.

## Testing (lean)

Compiler: system validation (record trigger rejected, schedule without entity accepted). Engine: shared runner behaviour is covered by the existing generated-runtime tests. API: service tests for save/validate/grants, event matching, resume and schedule with fakes; one E2E: create an automation on `purchases.order.approved`-like event via the API, fire the event through the outbox, see the run and the created record; wait + schedule paths reuse stage B coverage.

## Rollout

1. Compiler validator + engine extraction (done first, regression-tested).
2. Migration, service, routes, dispatcher and worker integration, tests.
3. UI screen + navigation, docs, E2E.
