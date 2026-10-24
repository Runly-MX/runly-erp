# Work layer: tasks linked to any record (design)

Status: draft for approval. Date: 2026-10-24.
Source: functional audit of Runly vs Asana/monday/Slack (plan "Runly Work Platform", phase 1).

## Problem

`runly.projects` is a solid task engine, but a Task can only live inside a Project and
cannot point at the business record it is about (a purchase order, a vehicle, an employee,
a course, an inventory item). Teams cannot say "receive this purchase" or "service this
vehicle" as tracked work without copying data into a task title.

## Goals

1. Any task can be linked to one or more records of any module (official or Builder).
2. Any record detail screen can show "Tareas" linked to it and create one in place.
3. Tasks can exist without the user picking a project: a per-user "Mis tareas" inbox project.
4. Typed values for task custom fields.
5. No change to existing task behavior, permissions or API responses (additive only).

## Non-goals

Portfolios/OKR, time tracking, Gantt changes, automations, cross-company links, replacing
Project as the permission boundary.

## Design

### Link layer (new table `task_link`, Prisma-managed because Task is a core model)

| column | notes |
|---|---|
| id | uuid v7 |
| company_id | denormalized for scoped queries |
| task_id | FK task, cascade |
| target_type | key of the `relation-targets` catalog (`contact`, `hr_employee`, `vehicle`, `inventory_item`, `project`, `task`, `calendar_event`, `ledger_account`, `file`) |
| target_id | record id (uuid, no FK: the record lives in another table) |
| label | cached display text, set from the resolver at link time |
| created_by_id, created_at | audit |

Unique `(task_id, target_type, target_id)`; index `(company_id, target_type, target_id)` for the reverse lookup used by record screens.

Reuse: `relationTargets.resolve` (apps/api/src/services/relation-targets-service.js) validates the type, enforces the per-type read permission and returns the label, so a link can only point at records the caller can see. Revised 2026-10-24 after reading the service: the catalog is closed and keyed by type (no module/entity pair), and purchases is not in it yet; adding purchases (and other modules) as relation targets is a prerequisite for linking them and is tracked as step 4.

### API (apps/api/src/routes/projects, thin routes + service)

- `GET|POST /projects/:id/tasks/:tid/links`, `DELETE /projects/:id/tasks/:tid/links/:linkId` (same per-project access as dependencies)
- `GET /projects/tasks-by-target?type=&id=` returns tasks linked to a record, filtered by projects the caller can see (reuse the existing project-visibility check from `tasks-service.js`).
- Creating a link requires edit access to the task and view access to the target (checked through relation-targets permission filtering). Audited via `AuditLog`.
- Publish `task.created` / new `task.linked` domain event with target payload (extends the existing catalog in `packages/module-engine/src/contracts.js`), enabling phase 3-4 automations.

### Personal inbox project

Lazily create one `Project` per (company, user) flagged by a new nullable `Project.kind` enum value `PERSONAL` (default `STANDARD`), owner = user, single member, default statuses. Tasks created from a record screen default to the caller's inbox unless a project is chosen. Personal projects are excluded from project lists/pickers except for their owner and from exports of other projects. Chosen over making `Task.projectId` nullable because status, position, numbering and permissions all hang off the project.

### Typed task field values

Keep `TaskFieldValue.value String` for storage (backward compatible) and add validation/parsing by `ProjectField.kind` (text, number, date, select, checkbox, user) in `projects-fields-service.js`, with a Zod schema in `packages/validators`. Reject invalid values; do not migrate existing data.

### UI (apps/desktop, @runly/ui first)

- `LinkedTasksPanel` in `packages/ui/src/components` (list + "Nueva tarea" + link existing), documented in `docs/ai-context/rme3-runtime-capabilities.md`. Uses `RunlyTable`/`Dialog`/`EmptyState`, Spanish text.
- Task detail: "Vinculado a" section with chips opening the target record.
- Mount the panel in the detail views of: purchases, inventory item, fleet vehicle, HR employee first; Builder modules get it through a manifest flag `workLinks: true` on an entity (renders in `RunlyDetail`), documented in `docs/developers`.

## Data and migration

One forward migration: create `task_link`, add `Project.kind`. No edits to existing migrations. No backfill.

## Permissions and security

Company scoping on every query; target visibility enforced server-side; `target_id` is never trusted for display (label re-resolved on read, falling back to cached label marked stale). Deleted/trashed targets keep the link and show "Registro no disponible".

## Testing (lean)

Node test runner: link service (create/duplicate/delete, permission denial, company isolation), by-target filtering, personal-project lazy creation idempotence, field value validation per kind. One API smoke against a real boot. UI verified with `pnpm build:web` and the UI-screen audit checklist.

## Rollout order

1. Migration + service + routes + tests.
2. Typed field validation.
3. `LinkedTasksPanel` + task detail section.
4. Mount in purchases, inventory, fleet, HR; Builder `workLinks` flag; developer docs + regenerate ZIP docs snapshot (`node scripts/generate-module-developer-docs.mjs`).
5. MirAI/MCP: expose link/list-by-target in the projects capabilities and adapter.

## Open decisions (defaults chosen)

- Personal project via `Project.kind` (chosen) vs nullable projectId (rejected).
- Links are same-company only.
- Inbox project name: "Mis tareas".
