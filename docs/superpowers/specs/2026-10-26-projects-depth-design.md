# Projects depth: Gantt, time and workload (Work Platform, phase 5)

Status: proposed, waiting for approval. Roadmap: phase 5 of the Work Platform plan
(2026-10-24). Phases 1 to 4 are implemented (see `docs/TASKS.md`).

## Problem (verified in the code, 2026-10-26)

- **Timeline** (`TimelineView.jsx`, 287 lines) draws one bar per task from `startDate`
  to `dueDate` over weekly columns. No dependency arrows, no dragging, no today line,
  no zoom, and tasks without dates are only listed.
- **Dependencies** exist (`task_dependency`, blocker -> blocked) but are only a list in
  the task detail; the cycle guard checks one hop only, so A -> B -> C -> A is accepted.
  Nothing moves when a blocker slips.
- **No effort data**: tasks have no estimate and nothing records time spent. The only
  time data in the ERP is HR attendance (people, not tasks).
- **No workload view**: a manager cannot see who is overloaded or free next week.
- **No project dashboard**: progress is visible only by counting cards on the board.
- Two Kanban implementations exist (Projects and the generic Builder one).

## Goals

1. **Gantt that works**: dependency arrows, drag to move and resize, today line, zoom
   (day / week / month), tasks without dates can be dropped on the chart to schedule
   them, blocked tasks are visibly blocked.
2. **Estimates and time entries**: an estimate per task (hours) and a simple way to log
   time (manual entry and a start/stop timer), with totals per task, person and project.
3. **Workload**: per person and per week, estimated hours of their open tasks against
   a capacity, so overload and free capacity show at a glance.
4. **Project dashboard**: progress, overdue, by status, by person, burn of estimated vs
   logged hours, upcoming milestones.

## Non-goals (later, separate specs)

- Portfolios, goals and OKRs (phase 5 follow-up).
- Unifying the two Kanban implementations.
- Billing, rates or payroll from time entries (entries are effort data, not money).
- Automatic rescheduling of the whole chain when a blocker moves (a warning and an
  explicit "push dependents" action instead, see 1.3).
- Resource levelling and critical path calculation.

## Design

### 1. Gantt

**1.1 Chart.** A new `GanttView` replaces the bars of `TimelineView` (the timeline tab
keeps its name; its file is rewritten and split, it is already close to the file-size
guideline). Layout: task list on the left (title, assignee avatar), time grid on the
right with a sticky header (month / week / day by zoom). Tokens only, rounded-md bars,
selected = flat tint. Works with mouse and touch (long press starts a drag; the pan
gesture stays on the background).

**1.2 Interaction.**
- Drag a bar to move it, drag its ends to resize; dates snap to the day. One request per
  drop (`PATCH task` with `startDate`/`dueDate`), optimistic with rollback on error.
- Dependency arrows from the end of the blocker to the start of the blocked task
  (finish-to-start). To create one, drag from a bar's right handle onto another bar;
  click an arrow to delete it. Keyboard: select a bar, `Alt+Arrow` moves a day,
  `Alt+Shift+Arrow` resizes, `Delete` on a selected arrow removes it.
- A blocked task whose start is before its blocker's end shows a red marker and a
  tooltip ("Empieza antes de que termine «X»"); never blocks the drag.
- **Push dependents** (explicit): when a blocker moves later, a toast offers "Mover las
  tareas que dependen de esta" which shifts each dependent by the same number of days,
  recursively, in one request.
- Undated tasks sit in a strip above the chart; dropping one on a date sets
  `startDate = dueDate` (one day) and lets the person resize.
- Milestones: a task with the same start and due day and zero estimate renders as a
  diamond (no new field).

**1.3 Server.**
- `POST /projects/:id/tasks/:tid/reschedule` `{ startDate, dueDate, pushDependents }`
  validates `startDate <= dueDate`, updates the task and, when asked, its dependents
  (same project, same day shift) in a transaction; returns every task it changed.
- Cycle guard becomes transitive: reject a dependency when the blocked task can already
  reach the blocker (iterative DFS with a visited set, depth cap 500).
- `GET /projects/:id/gantt` returns tasks (id, title, number, status, assignees, dates,
  estimate, done flag) plus all dependencies of the project in one call (2 queries).

### 2. Estimates and time entries

**Data (new migration).**
- `Task.estimateMinutes Int?` (nullable; 0 means a milestone).
- `task_time_entry`: `id uuidv7, company_id, task_id, user_id, started_at, minutes int,
  note text?, source 'manual' | 'timer', created_at`; unique partial index so a person
  has at most one running timer (`minutes IS NULL` while running, one per user).
  Indexes `(task_id)`, `(company_id, user_id, started_at)`.

**API.**
- `POST /projects/:id/tasks/:tid/time` `{ minutes, startedAt?, note? }` manual entry
  (1 to 1440 minutes, not in the future beyond today).
- `POST .../time/start`, `POST .../time/stop`: the timer; starting a second one stops the
  first (answers which). A timer left running more than 12 hours is closed at 12 h
  and flagged so it is reviewed, by the worker tick that already exists.
- `DELETE .../time/:entryId`: only the author or a project owner; entries are never
  edited, a wrong one is deleted and re-entered (keeps the audit simple).
- `GET /projects/:id/time-summary`: totals per task, per person and per week.
- Permissions: log and see your own time with `projects.task.update` on a project you
  belong to; see everyone's time with project owner or `projects.manage`.

**UI.** In the task detail: estimate field ("Estimación", hours and minutes), a "Tiempo"
section with the entries, a "Registrar tiempo" popover and a start/stop button. A
running timer shows in the topbar of the module and in "Mi trabajo". Project and task
totals display "registrado / estimado" with a bar that turns amber over 100%.

### 3. Workload

`GET /projects/:id/workload?from&to` (and a company-wide variant for people who manage
several projects) returns, per person and week: estimated minutes of open tasks whose
dates overlap the week (an undated task is not counted and is listed apart as
"sin fecha"), distributed evenly across the task's working days, plus logged minutes.
- Capacity default: 40 h/week per person, overridable per project member
  (`ProjectMember.weeklyCapacityMinutes Int?`, new column) and later from HR.
- UI: a "Carga" tab with people as rows and weeks as columns; each cell is a bar
  (estimated / capacity) with colour plus a percentage (never colour alone). Clicking a
  cell lists the tasks behind it; dragging a task between people reassigns it.

### 4. Project dashboard

A "Resumen" tab composed from one endpoint `GET /projects/:id/overview`: progress
(done / total tasks, and by estimated hours when estimates exist), overdue count, tasks
per status (reuses the board colours), tasks per person, estimated vs logged hours by
week (the burn), next 5 milestones. Same widgets are available to the Builder home
widget contract later (out of scope here).

### 5. Automations, events and MirAI

- New domain events: `projects.task.rescheduled` (`id, projectId, title, startDate,
  dueDate`) and `projects.time.logged` (`id, taskId, projectId, minutes`). Documented in
  `docs/developers/servicios-y-eventos.md`.
- MirAI capability: read tools `projects_workload` and `projects_time_summary`; the
  existing actions get `estimateMinutes`; "log time" is an action with confirmation.
  MCP gets the same read tools.

## Data and migration

One forward migration: `Task.estimate_minutes`, `ProjectMember.weekly_capacity_minutes`,
`task_time_entry` with its indexes (company scoped, FK to task with cascade). No data
backfill. Applied to the dev database; deployed by the owner.

## Permissions and security

- Every endpoint checks project access (`requireProjectAccess`) and company scope; time
  data of others only for project owners.
- Reschedule with `pushDependents` only touches tasks of the same project and caps at 200
  tasks per call.
- Timer and entries use server time for `started_at` of timers (the client cannot move a
  running timer's start).

## Testing (lean)

- Unit: transitive cycle guard (A->B->C->A rejected, diamond accepted), reschedule with
  push (shift, recursion, cap), workload distribution (week boundaries, undated tasks,
  capacity), time entry rules (one running timer, 12 h close), overview aggregates.
- API E2E in the E2E company: create project, tasks, dependency, reschedule, log time,
  read workload and overview.
- Browser: Gantt drag, resize, arrow create/delete, push toast, timer; screenshots at
  desktop and phone width. Touch behaviour is flagged as unverified until tried on a
  device.
- Developer docs and MCP docs updated in the same change.

## Rollout order

1. **5A Gantt** (reschedule endpoint, transitive guard, `GET gantt`, `GanttView`).
2. **5B Time and estimates** (migration, API, task detail UI, timer).
3. **5C Workload and Resumen** (endpoints and the two tabs).
4. **5D Events and MirAI/MCP**.

Each part is shippable alone and ends with its own verification and commit.

## Open decisions (defaults chosen)

- Dependency type: **finish-to-start only** (the only one the data supports today).
- Working days: **Monday to Friday**, no company calendar yet (a holiday calendar can
  replace this later without changing the API).
- Capacity: 40 h/week default, per-member override; no link to HR vacations yet.
- Timer scope: one running timer per person across all projects.
- Estimate unit: minutes in the database, shown as hours and minutes.
