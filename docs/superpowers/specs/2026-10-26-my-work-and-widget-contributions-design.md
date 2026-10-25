# My Work and widget contributions (Work Platform, phase 2)

Status: proposed, waiting for approval. Roadmap: phase 2 of the Work Platform plan
(2026-10-24). Phase 1 (task links, personal inbox project, "Mis tareas" widget) and
phase 3 (event and service coverage) are already implemented, see `docs/TASKS.md`.

## Problem

Home is a board of independent widgets. Each widget lives in the desktop code
(`apps/desktop/src/app/home/widgets/registry.js`), so:

- A module built in the Module Builder (RME3) cannot put anything on Home, however
  important its data is (open orders, expiring contracts...).
- There is no single place that answers "what do I have to do today?": tasks,
  approvals, mentions and agenda are four widgets the person has to read separately.
- Widgets cannot be reordered or resized, and the board is the same for everyone.

## Goals

1. **Builder modules contribute widgets** declared in the module definition, rendered by
   one generic widget, no code in the module and no web rebuild.
2. **"Mi trabajo"**: one screen that lists what needs the person today, from every module
   they can use, with the same data the widgets use.
3. **Mentions** of the person in chat appear as work (read only list with a link).
4. **Order and size of widgets** chosen by each person and remembered.

## Non-goals

- A shared team dashboard (that is a Builder DASHBOARD view).
- Notifications digests (phase 6) and push.
- Writing from the widgets (the widget links to the record; the work happens there).
- Custom React widgets from modules (only declarative widgets, same rule as the rest
  of the Builder).

## Design

### 1. Declarative widgets in the Builder definition

`definition.homeWidgets[]` (max 5 per module):

```json
{ "key": "ordenes_abiertas", "label": "Órdenes abiertas", "entity": "orden",
  "kind": "count" | "list", "when": { "field": "estado", "op": "not_equals", "value": "cerrada" },
  "titleField": "folio", "detailField": "cliente", "sort": { "field": "fecha", "dir": "desc" }, "limit": 5 }
```

- `count`: one big number (total of matching records) with the label.
- `list`: the newest `limit` records (title, optional detail line, link to the record).
- `when` reuses the same condition object and validation as automations (one or a list).
- The compiler validates entity, fields and the condition and rejects unknown keys; the
  manifest carries the widgets so the web app can read them without loading the module.
- Data comes from a new endpoint `GET /modules/:key/home-widgets/:widgetKey` that runs
  the query through the module's own records API (same permissions, company scoped,
  soft-deleted rows excluded). Counting is exact (SQL), never from a page.
- The Home registry merges the built-in widgets with the ones of the installed, enabled
  modules the person can open (`moduleKey` gate as today).

### 2. My Work (`/app/work`)

A screen with sections, each one fed by an existing source and hidden when empty or
when the module is not available:

| Section | Source |
|---|---|
| Tareas de hoy y atrasadas | `GET /projects/my-tasks` (add `scope=today|overdue`) |
| Aprobaciones | `GET /automation-approvals/mine` (and purchases approvals later) |
| Menciones | new `GET /chat/mentions/mine` (last 7 days, unread first) |
| Agenda de hoy | calendar events of the day |

- One endpoint `GET /work/summary` returns the four lists and their totals in one call
  (4 parallel queries; the dev database costs about 84 ms per query, so one request
  matters). Sections fail independently (`{ error }` in one section, the rest render).
- Home gets a compact "Mi trabajo" header card with the three counts and a link; the
  full screen is the destination. The old widgets stay.
- Mobile first: sections stack, each row is a 44 px touch target.

### 3. Mentions

Chat already parses mentions (`chat-mentions-service.js`). The endpoint returns the
message excerpt (first 140 chars, only from conversations the person belongs to),
author, conversation and a link; marking as read stays in chat.

### 4. Order and size

Stored per user in the existing profile preference `home.widgets` (today `{ hidden }`, see
`useHomeWidgetPrefs`), extended to: `{ order: [ids], hidden: [ids], size: { id: 'sm'|'md'|'lg' } }`.
Drag to reorder in "Personalizar" (keyboard alternative: move up/down buttons), sizes
span 1, 2 or 3 columns of the grid.

## Data and migration

No new tables. `homeWidgets` is part of the module definition JSON; the user preference
extends the existing preference value.

## Permissions and security

- A contributed widget is shown only when the person can open the module and read the
  entity (the entity read permission), and the endpoint re-checks it.
- Mentions only come from conversations the person is a member of; the excerpt is cut.
- `when`, field names and sort fields are validated against the entity at publish
  time; the endpoint never builds SQL from request text.

## Testing (lean)

- Compiler: valid and invalid `homeWidgets` (unknown entity/field, bad `when`, over the
  limit), manifest output.
- API: widget endpoint (count exactness, soft delete, company scope, permission), work
  summary (sections fail alone), mentions scope.
- Frontend: registry merge, order/size persistence helpers (pure), screen smoke in the
  E2E company.
- Developer docs: `docs/developers/*.md` (new section "Widgets de inicio"), regenerate
  the ZIP snapshot.

## Rollout order

1. Compiler + manifest + endpoint + generic widget (module contributions).
2. `GET /work/summary`, mentions endpoint and the My Work screen.
3. Order and size in "Personalizar".

## Open decisions (defaults chosen)

- Where is My Work in the navigation? **Default**: a card on Home plus the route
  `/app/work`; Home stays the landing page. Alternative: make My Work the landing page
  (bigger change; revisit after a week of use).
- Do purchases approvals join the Approvals section now? **Default**: no, only
  automation approvals; purchases keep their own screen until their approvals expose a
  "pending for me" query.
- Widget sizes: **default** three sizes; no free resize.
