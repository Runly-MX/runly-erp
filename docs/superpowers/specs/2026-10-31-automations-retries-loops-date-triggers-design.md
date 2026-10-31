# Automatizaciones: reintentos, «Para cada uno», consultas y disparadores por fecha

Date: 2026-10-31
Status: approved (autonomous roadmap decision)
Scope: company automations (`system.automations`, module runly.automations). Builder
module automations keep their current behaviour except where the shared runtime
gains backwards-compatible features (noted below).

## Problem

1. Reliability. A company automation that fails makes `runEvent` throw, so the
   dispatcher re-delivers the whole domain event: every other automation and every
   module handler subscribed to it runs again and logs a new run row. A permanent
   error (missing permission, invalid data) is retried 8 times anyway. Nobody is told
   that an automation is failing, and a failed run cannot be resumed by hand.
2. Power. A flow cannot act on many records (no loop), cannot read a record to use
   its data (only services that write are allowed), and cannot notify "the person in
   the data" (recipients are always picked by hand).
3. Time. Only fixed schedules exist; "3 days before the invoice is due" is not
   expressible.

## Design

### A. Reliability

- **Isolated retries.** `runEvent` and `runSchedule` no longer throw for a failed
  automation. When a run stops at a failed step the host decides:
  - *transient* error (no HTTP status, status >= 500, 429, timeouts) and attempts
    left (max 5): queue an `automation_job` that resumes **from the failed step**
    with the data that step would have seen; delays 1, 5, 15, 60 minutes. The run
    row is marked `retrying` (new status) and keeps its id; the retry finishes it.
  - otherwise (permanent error or no attempts left): the run is `failed` and a
    *parked* job (`status = failed`) keeps what is needed to resume it by hand.
  The same rule applies to continuations after a wait/approval and to webhooks.
  `onError: continue` runs never stop, so they are never retried.
- **Runtime support (shared, additive).** `runSteps` result gains `stoppedAt`
  (index of the step that stopped the flow) and `scope` (data the next step would
  read); failed step entries gain `status` (HTTP status of the error). `execute`
  accepts an optional `retry(result, runId)` hook and returns `runId`; when the
  hook returns `{ status: 'retrying', at }` the run is logged with that status and
  no "finished" event is announced. Generated Builder modules ignore the new fields.
- **Manual retry.** `POST /automations/system/:key/runs/:runId/retry` re-queues the
  parked job of a failed run (attempts reset). The console shows «Reintentar desde
  el bloque que falló» on failed runs that have one, and «Reintento N de 5 a las
  HH:MM» on `retrying` runs.
- **Failure notice.** When a run ends `failed` (not retrying), the automation's
  creator gets a notification (link to the editor), at most one per automation per
  hour.
- **Per automation switch.** `retry: false` in the definition turns automatic
  retries off (editor: «Reintentar si falla un servicio» in the trigger inspector).

### B. Power

- **Consultar un registro.** Single-record read services (`mutates: false`, `system:
  true`, no `items` in `returns`) are allowed as steps; their results become
  `paso<N>_<key>` like any step. New service `runly.identity:people.read({ id })`
  returns `{ id, name, email }` of a member of the company (to name the assignee, the
  requester...).
- **Personas desde un dato.** Recipient lists (`userIds`, `attendeeIds`) can also
  come from a data field of type id (e.g. `assigneeId`); the runtime already wraps a
  single id in a list. Values that are not members are ignored by the services.
- **Para cada uno.** New step `{ type: 'loop', service, args, when?, do: [action] }`:
  calls a search service (`returns` includes `items`; contracts declare `itemReturns`),
  keeps the items matching `when` (same operators as conditions), and for each one
  runs the `do` actions (1-3 service steps that run without a person) with the item
  fields as `elemento_<key>` plus everything before the loop. Max 50 items (the
  search `limit`). Idempotency per item (`<base>:<step>:<item id>:<action>`). One
  item failing does not stop the others; the loop fails if any failed. The step
  log keeps `iterations`, `failed` and the first 3 errors. After the loop,
  `paso<N>_count` (items processed) is available. A loop cannot sit inside a
  condition path, and its actions cannot be waits, approvals, conditions or loops.
  Builder modules get the same step (shared runtime) from their next publish.

### C. Disparadores por fecha

- New trigger `{ type: 'date', source, offsetDays, at, when? }` for company
  automations: every day at `at` (instance time zone) the worker looks for records of
  `source` whose date is `today - offsetDays` (offset -3 = "3 days before", 0 = "the
  day of", 2 = "2 days after") and runs once per record (idempotent per record and
  day, max 200 per day). Sources (catalog `DATE_SOURCES`, with fields and link like
  the event catalog):
  - `purchases.invoice.due` — unpaid supplier invoices by due date
  - `purchases.order.expected` — issued orders not fully received, by expected date
  - `projects.task.due` — open tasks by due date
  - `fleet.insurance.expiry` — active vehicle policies by expiry date
  - `hr.employee.anniversary` — active employees on the anniversary of their hire date
- Uses the existing `automation_schedule` rows (a date trigger is a daily schedule).

## Out of scope

Retries for Builder module automations (they keep the dispatcher's event retry),
loops over arbitrary lists from earlier steps, nested loops, date triggers in Builder
modules, "N days without changes" triggers.

## Verification

Unit tests for the runtime (loop, stoppedAt/scope, retry hook), compiler validation
(loop, reads, date trigger), retry classification and date-source queries;
API smoke against the local instance; web build.
