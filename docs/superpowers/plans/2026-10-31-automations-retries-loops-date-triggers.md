# Plan: automatizaciones — reintentos, consultas, «Para cada uno», disparadores por fecha

Spec: docs/superpowers/specs/2026-10-31-automations-retries-loops-date-triggers-design.md

Each stage is verified (unit tests + `node --check`/lint + web build when UI changes)
and committed on its own.

## Stage A — reliability
1. `packages/module-engine/src/automation-runtime.js`: `runSteps` returns `stoppedAt`,
   `scope`; failed entries carry `status`; `execute` takes `retry` hook, opens the run
   row first when it is given, returns `runId`. Tests in `__tests__/automation-runtime*.test.js`.
2. `apps/api/src/services/automation-retry.js` (new): `isTransient(entry)`,
   `RETRY_DELAYS_MIN`, `planRetry(...)`. Tests.
3. `automation-runs-service.js`: status `retrying`, `retryInfo` in the view.
   `automation-jobs-service.js`: `enqueue` accepts `status: 'failed'` (parked),
   `requeue({ companyId, moduleKey, runId })`.
4. `system-automations-service.js`: `hostFor` passes the retry hook; `runEvent`,
   `runSchedule`, `resume` stop throwing for automation failures; failure notice
   (one per hour) to `createdById`. `retry: false` honoured.
5. Compiler: `retry` boolean validated/normalized.
6. Route `POST /automations/system/:key/runs/:runId/retry` + SDK method.
7. UI: console badge/text for `retrying`, retry button; trigger inspector switch.

## Stage B — reads, people from data, loop
1. Contracts: `itemReturns` on search services; new `runly.identity:people.read`
   (+ handler, docs). Compiler allows single-record reads as steps; `automationServices`
   lists them (group «Consultar»).
2. UI: people args accept «Persona del dato» (id fields).
3. Runtime: `loop` step. Compiler: validate/normalize/toRuntimeSteps for loop; outputs
   `paso<N>_count`; `elemento_<key>` available only inside `do`.
4. UI: flowModel kind `loop`, describe/issues; inspector `LoopStepEditor` (search
   service, its args, filter conditions, 1-3 actions with item fields).

## Stage C — date triggers
1. `packages/module-engine/src/date-sources.js`: catalog (label, module, fields, link).
   Compiler validates `{ type: 'date', source, offsetDays (-60..60), at, when? }`.
2. `apps/api/src/services/automation-date-sources.js`: per-source query (company, day).
3. `system-automations-service.js`: `listSchedules` includes date triggers as daily
   schedules; `runSchedule` runs once per matching record.
4. UI: trigger editor «En una fecha de un registro»; field options from the source.

## Docs
`docs/developers/automatizaciones.md` (+ servicios-y-eventos for new service/itemReturns),
regenerate developer docs, help page of runly.automations if it lists triggers/blocks.
