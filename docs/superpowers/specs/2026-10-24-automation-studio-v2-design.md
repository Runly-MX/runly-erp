# Automation Studio v2 (design)

Status: approved (autonomous decision, 2026-10-24)
Source: Runly Work Platform roadmap, phase 4. Builds on `2026-10-04-builder-automations-design.md` (v1: one trigger, one optional condition, one service call) and Module Services v2.

## Problem

Automations v1 cannot express "when X happens, do A then B", cannot check more than one field, leave no trace of what ran or failed, and only exist inside Builder modules. Event coverage (phase 3) now gives enough triggers to make a richer engine worth building.

## Goals (staged)

**Stage A - steps, conditions, run log (this spec's first delivery)**
1. `action` becomes `steps`: an ordered list (max 5) of service calls. `onError: 'stop' | 'continue'` per automation (default `stop`). v1 definitions (`action`) keep compiling and are normalized to one step.
2. `trigger.when` accepts one condition or an array (all must hold, max 5). New operators: `not_equals`, `contains`, `gt`, `lt`.
3. Run log: every execution (record or event) writes one row to the core table `automation_run` (company, module, automation key, trigger kind, source id, status `success | partial | failed`, per-step results, error text, duration). Retained 90 days. Read through `GET /modules/:key/automation-runs` (module manager permission) and shown in the Builder Automatizaciones tab.
4. Later steps can use earlier steps' results is NOT in stage A (arguments map only trigger data).

**Stage B - time**: `delay` step (minutes/hours/days) and `schedule` trigger (cron-like presets: daily, weekly, monthly at HH:MM). Needs a persisted `automation_job` queue drained by the worker.

**Stage C - reach**: generic `http` step (allow-listed host, signed, company setting), `approval` step reusing the purchases/MirAI proposal pattern, automations for core modules (not only Builder modules), "test run" with sample payload.

**Stage D - editor**: visual canvas editor; MirAI/MCP tools to list, create and enable automations.

## Non-goals

Loops, custom code, branching trees (a step list with conditions per step may come later), cross-company automations.

## Design (stage A)

### Definition

```js
automations: [{
  key, label, enabled,
  onError: 'stop',                       // optional, 'stop' | 'continue'
  trigger: { type: 'record' | 'event', ..., when: cond | [cond, ...] },
  steps: [{ service: 'runly.calendar:events.create', args: { ... } }, ...],
}]
```

Validation: the existing arg/trigger rules apply to every step; error paths become `automations[i].steps[j].args.x`. `consumes` and service keys are derived from all steps. A definition with both `action` and `steps` is invalid.

### Runtime (generated `api/automations.js`)

- `AUTOMATIONS` carries `steps` (each with its `runtime` info) and `onError`.
- A shared `runSteps(automation, ctx)` runs steps in order. Idempotency key per step: `<key>:<source>:<stepIndex>` (record `create`) or `<key>:<eventId>:<stepIndex>` (events), so a retried event never repeats finished steps.
- Result per step `{ index, service, ok, code?, error? }`. With `stop`, remaining steps are marked `skipped`.
- Event handlers still rethrow after the loop when any automation failed so the dispatcher retries; idempotency keys make that safe.
- After every run the generated code calls `moduleContext.automations.log(...)` (record triggers) or the dispatcher-provided `log` (event triggers). Logging never throws and never blocks the save.

### Run log

Prisma-managed core table (not an RME3 module table):

`automation_run(id uuidv7, company_id, module_key, automation_key, trigger_kind, trigger_ref, status, steps jsonb, error text null, duration_ms int, created_at)`, index `(company_id, module_key, created_at desc)`. Worker retention sweep deletes rows older than 90 days. New forward migration; no edits to applied ones.

### API and UI

- `GET /modules/:key/automation-runs?automation=&status=&limit=` (company scoped, requires module management permission).
- Builder Automatizaciones tab: step list editor (add/remove/reorder up to 5), multi-condition rows, per-automation `onError`, and a "Historial" panel with status filter. Components from `@runly/ui` only.
- `docs/developers/*` (automatizaciones page) updated and ZIP docs snapshot regenerated in the same change.

## Compatibility

Stored v1 definitions are accepted and normalized (`action` -> `steps: [action]`). Generated modules published before the upgrade keep working with their old runtime until republished.

## Testing (lean)

Compiler: validation of steps/conditions, v1 normalization, consumes derivation. Runtime: ordered execution, stop vs continue, idempotency keys, log call. API: runs endpoint scoping. One real compile of a module with two steps.

## Rollout

1. Compiler validation + normalization + runtime + tests.
2. `automation_run` migration, log capability, endpoint, retention.
3. Builder UI (steps, conditions, history) + developer docs + regenerated snapshot.
4. Stages B-D get their own specs.
