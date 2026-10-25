# Automation Studio v2, stage C: test run, HTTP step, approvals (design and plan)

Status: approved (autonomous decision, 2026-10-25)
Builds on: stage A (`2026-10-24-automation-studio-v2-design.md`) and stage B (`...-stage-b-time-design.md`).

## Scope decision

The roadmap listed four stage C items. Three are built here; one is deferred:

| Item | Decision |
|---|---|
| Test run with sample data | Built (C1). Cheap, safe, and every other step gets easier to author with it. |
| HTTP step (outgoing webhook) | Built (C2), restricted: HTTPS only, hosts allow-listed by an administrator, signed body. |
| Approval step | Built (C3), simple: fixed approvers, one decision, 7-day expiry. |
| Automations for core modules (not only Builder modules) | **Deferred to its own stage.** Core modules have no `ModuleDefinition`; this needs a registry of "automation points" per core module and a storage for their automations. Treating it as an add-on here would rush the part with the most surface area. |

## C1. Test run ("Probar")

Pure and local: nothing is called and nothing is written.

- `previewAutomation(automation, { data, previous? })` in `@runly/module-compiler` (exported for the browser) evaluates the trigger conditions with the real runtime `matches`, and for each step returns the exact arguments `buildArgs` would send (service steps), the duration (wait), the approvers and message (approval) or the final method/URL/body (HTTP). A step that would fail validation against its contract reports the problem instead of throwing.
- Builder: a "Probar" button on each automation card opens a dialog with one input per field the automation uses (from the entity or the event payload) and shows the result: whether the conditions pass and a list of steps with their arguments. Components from `@runly/ui` only.

## C2. HTTP step

```js
{ type: 'http', method: 'POST' | 'PUT' | 'PATCH', url: 'https://hooks.example.com/runly', body: { folio: { from: 'field', field: 'folio' }, note: { from: 'template', template: 'Orden {{folio}}' } } }
```

- Sent as JSON `{ module, automation, companyId, idempotencyKey, data: { ...mapped body } }`. The body uses the same argument sources as service steps (`value`, `field`, `template`, `recordId`; `actor` only for record triggers before any wait).
- Headers are fixed: `Content-Type`, `X-Runly-Idempotency-Key`, `X-Runly-Signature: sha256=<hex HMAC of the raw body>`. The signing secret is instance-level (`InstanceConfig` key `automation_http_secret`, generated on first use, shown once to administrators when they ask for it). No custom headers: a definition is visible to every Builder user and must never carry credentials.
- Allow-list: `InstanceConfig` key `automation_http_hosts` (JSON array of exact host names). Managed by `core.modules.manage` from the Builder Automatizaciones tab ("Destinos permitidos") through `GET|PUT /module-builder/automation-http-hosts`. A step whose host is not allowed fails at run time with a clear message; the Builder warns while editing.
- Safety rules enforced by the host (`automation-http-service.js`, never by generated code): `https:` only and default port, no credentials in the URL, host in the allow-list, DNS resolved first and every address must be public (no loopback, private, link-local, metadata ranges), redirects are not followed, 10 s timeout, body at most 64 KB, response body discarded except the first 200 characters kept in an error message. Any non-2xx is a step failure.
- Allowed everywhere (record, event, schedule, after a wait): it needs no person.
- Retries come from the run machinery (stage A/B); the idempotency header lets the receiver deduplicate.

## C3. Approval step

```js
{ type: 'approval', approvers: ['<profile-id>', ...], message: 'Aprobar la orden {{folio}}' }
```

- Between two actions, at most one per automation, 1 to 5 approvers (user profile ids chosen in the Builder with the people picker), message is a one-line template. Steps after it are system-only, like after a wait.
- Reaching it stores the continuation as an `automation_job` in status `awaiting_approval` (never claimed by the worker), creates an `automation_approval` row, notifies the approvers (`notifications.publish`, link to Home) and leaves the run `waiting`.
- Decision: `POST /automation-approvals/:id/decide { decision: 'approve' | 'reject', comment? }` by one of the approvers of the same company. Approve: the job becomes `pending` with `run_at = now` and the worker continues the run. Reject: the job is `cancelled`, the run row ends as `rejected` with the comment.
- Expiry: the worker expires approvals older than 7 days (`expired`), cancels the job and closes the run as `cancelled`.
- Persistence: `automation_approval(id uuidv7, company_id, module_key, automation_key, run_id, job_id, approver_ids uuid[], message, status 'pending'|'approved'|'rejected'|'expired', decided_by, decided_at, comment, expires_at, created_at)` plus an additive `awaiting_approval` job status. Forward migration, additive.
- Surfaces: Home widget **Aprobaciones** (shown when the user has pending ones) with Aprobar / Rechazar (reject uses `ConfirmDialog` with an optional comment) and `GET /automation-approvals/mine`. Builder Historial shows "Esperando aprobación de ..." and `rejected` runs.
- Audit: decisions go to `AuditLog` (`automation.approval.decided`).

## Validation additions

New codes: `AUTOMATION_HTTP_INVALID` (method, URL shape, body sources), `AUTOMATION_APPROVAL_INVALID` (approver count/format, message, placement, more than one). `automationServices` and the "after a wait" system-only rule treat an approval like a wait. Step limits stay at 5 (waits, approvals and HTTP count).

## Testing (lean)

Compiler: validation of both new steps, preview output, generated runtime queues the approval and calls HTTP through the host function only. API: HTTP safety rules (scheme, host allow-list, private-address rejection, redirects, size, timeout, signature), approval create/decide/expire with permission checks and company isolation. One API E2E: publish a module with an approval step, approve through the endpoint, see the run succeed; reject and see `rejected`.

## Rollout

1. C1: preview function, dialog, tests, docs.
2. C2: compiler/runtime step, HTTP service, allow-list endpoints and UI, tests, docs.
3. C3: migration, approvals service and routes, worker expiry, runtime step, Builder step editor, Home widget, tests, E2E, docs.
4. Deferred stage: automations for core modules.
