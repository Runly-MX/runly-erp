# Automation Studio v2, stage B: delays and schedules (design)

Status: approved (autonomous decision, 2026-10-24)
Builds on: `2026-10-24-automation-studio-v2-design.md` (stage A: steps, conditions, `automation_run` log).

## Problem

Automations only react instantly. Real flows need "remind three days after the order is created" or "every Monday at 8:00 create the weekly review task". Both need work that survives restarts and runs without a person, so the worker must own it.

## Goals

1. **Delay step**: `{ type: 'delay', amount, unit: 'minutes' | 'hours' | 'days' }` as an item of `steps`. The steps after it run later (max 30 days, min 1 minute).
2. **Schedule trigger**: `{ type: 'schedule', every: 'hour' | 'day' | 'week' | 'month', at: 'HH:MM', weekday?: 0-6, day?: 1-28 }` in the company's time zone. Optionally scoped to an entity of the module: `entity` + `when` run the steps once per matching record, with the record as data (cap 200 records per run, the rest is logged as truncated).
3. Both log into `automation_run` (stage A) with their own `triggerKind` (`delayed`, `schedule`) and survive API restarts, duplicates and retries.
4. Builder UI: a "Esperar" step type, a "Cada día / semana / mes" trigger, and a Historial that shows pending delayed runs.

## Non-goals

Cron expressions, per-user time zones, waits for conditions ("until status changes"), cancelling a pending delay when the record changes (stage C may add it), schedules without a module (core modules come in stage C).

## Design

### Constraint: delayed and scheduled steps run without a person

The worker has no request. Therefore:
- Every service step **after a delay**, and every step of a schedule automation, must be a `system` service (the same rule event triggers already follow, `AUTOMATION_SERVICE_NEEDS_USER`).
- The `actor` argument source is captured when the delay is queued (the profile id is stored as plain data in the job) and only supplies values such as `userIds`; it does not grant permission. In schedule automations `actor` is invalid.

### Definition

```js
steps: [
  { service: 'runly.notifications:notifications.send', args: { ... } },
  { type: 'delay', amount: 3, unit: 'days' },
  { service: 'runly.projects:tasks.create', args: { ... } },
]
trigger: { type: 'schedule', every: 'week', weekday: 1, at: '08:00', entity: 'orden', when: { field: 'estado', op: 'equals', value: 'abierta' } }
```

Rules: a delay cannot be first or last, two delays cannot be adjacent, at most 2 delays per automation, total steps still max 5 (a delay counts). `entity`/`when` of a schedule follow the record-trigger validation; conditions evaluate on the record at run time.

### Persistence

Two core Prisma tables (forward migration, additive):

- `automation_job(id uuidv7, company_id, module_key, automation_key, run_id null, from_step int, data jsonb, actor_id uuid null, run_at timestamptz, status 'pending'|'running'|'done'|'failed', attempts int, last_error text null, created_at)`; index `(status, run_at)`. One row per queued continuation. `data` is the record or event payload snapshot taken when the delay was reached (max 64 KB, larger payloads are rejected with a clear log entry).
- `automation_schedule(company_id, module_key, automation_key, next_run_at, last_run_at, primary key (company_id, module_key, automation_key))`. Rows are created lazily by the worker for every enabled schedule automation of every company where the module is enabled, and re-synchronized when a module is published (removed schedules are deleted).

### Execution

- The generated `api/automations.js` exports `resume({ automation key, fromStep, data, actorId, base, services, log, runId })`: it runs steps from `fromStep`, queueing a new job when it reaches the next delay. `runSteps` (stage A) learns the `delay` type: on reaching it, it inserts an `automation_job` through a `queue` function injected by the host (`moduleContext.automations.enqueue` for requests, the dispatcher/worker `enqueue` for events and jobs) and stops, reporting the run as `waiting` until the continuation finishes.
- Idempotency: the step key stays `<base>:<index>` (stage A), and the job insert is keyed by `(automation_key, trigger ref, from_step)` so a retried event or request never queues the same continuation twice.
- Worker: a new tick (every 30 s) claims due jobs with `UPDATE ... SET status='running' WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED LIMIT 20)`, imports the module's `api/automations.js` (same loader and cache as `api/events.js`), calls `resume` with `moduleServices.forSystem(moduleKey, companyId)` and marks `done`. Failures retry with the dispatcher's backoff (`backoffMs`), 8 attempts, then `failed` and the run row is closed as `failed`. Jobs of disabled/uninstalled modules or disabled companies are skipped and kept for 24 h before being marked `failed` with a clear reason.
- Schedules: a second tick (every minute) selects due `automation_schedule` rows, computes the next occurrence in the company time zone (reusing the zone helpers the calendar uses), advances `next_run_at` first (so a crash never double-fires), then calls the module's exported `runScheduled({ key, now, prisma, services, log })`. For entity-scoped schedules the generated code reads the module's own table with parameterized SQL (never the Prisma accessors, per the RME3 rules), filters with `matches`, and runs the steps per record with idempotency base `<key>:<recordId>:<yyyy-mm-dd-hh>`.
- Missed windows after downtime: a schedule fires at most once for the latest missed occurrence, never a backlog.

### Run log

`automation_run` gains `status = 'waiting'` while a continuation is pending (`steps` shows the delay step as `waiting` with its `runAt`). The continuation updates the same row (`run_id`) to its final status. Retention (90 days) also covers jobs in `done`/`failed`.

### API and UI

- `GET /modules/:key/automation-runs?status=waiting` already works through the existing endpoint; add `DELETE /modules/:key/automation-jobs/:id` to cancel a pending delay (module managers only).
- Builder: step type selector (Acción / Esperar), duration input with unit; trigger type "En un horario" with frecuencia/día/hora and an optional entity + conditions; Historial shows waiting runs with their scheduled time and a "Cancelar" action (ConfirmDialog).
- Developer docs `automatizaciones.md` updated and the snapshot regenerated in the same change.

## Compatibility

Stage A definitions are unaffected. A module published before this stage keeps its stage A runtime; republishing generates `resume`/`runScheduled`. If the worker finds a job whose module lacks `resume`, the job is marked `failed` with "Vuelve a publicar el módulo".

## Testing (lean)

Compiler: delay placement rules, system-only enforcement after delay and for schedules, schedule trigger validation. Runtime: `runSteps` queues a job at a delay and resumes from the right index with the same idempotency keys. Worker/service: claim with `SKIP LOCKED` ordering, backoff, schedule next-occurrence math across month ends and the company time zone, missed-window collapse. One API E2E: publish a module with a 1-minute delay, create a record, see `waiting`, run the worker tick, see `success`.

## Rollout

1. Compiler: definition rules + generated `resume`/`runScheduled` + tests.
2. Migration (`automation_job`, `automation_schedule`), jobs service, worker ticks, cancel endpoint, retention.
3. Builder UI (delay step, schedule trigger, waiting runs) + developer docs + snapshot.
4. API E2E in the E2E company, then browser check.
