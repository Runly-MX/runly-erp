# Custom detail views (cards + drag and drop)

Status: approved 2026-11-05 (user asked to proceed with spec, plan and implementation).

## Goal

Let a company admin rearrange a blueprint-driven detail screen (first: the
inventory item detail) into their own cards: group any fields together, rename
cards, move cards between the main and side column, hide fields, and drag and
drop both cards and fields. The view is stored per company and applies to every
user of that company.

## Scope

- In: one view per (company, detail blueprint key). Inventory item detail
  (`inventory.item.detail`) is the first consumer. Individual inventory custom
  fields can be placed in cards (`custom:<fieldId>` keys).
- Out (later): per-user views, per-type (Tipo) views, computed cards
  (totals/charts), editing the form layout, hero/KPI strip editing.

## Data model

New Prisma model `CompanyDetailView` (`company_detail_view`):
`id uuid v7`, `company_id`, `view_key varchar(100)`, `schema jsonb`,
`updated_by_id uuid?`, `created_at`, `updated_at`; unique `(company_id, view_key)`,
FK to company with cascade.

`schema` shape (version 1):

```json
{
  "version": 1,
  "sections": [
    { "id": "identification", "label": "Identificación", "icon": "IdCard", "column": "main", "columns": 2, "fields": ["folio", "custom:<id>"] },
    { "id": "attachments", "block": true, "column": "aside" },
    { "id": "card_1", "label": "Recepción", "column": "main", "columns": 2, "fields": ["receivedAt"] }
  ],
  "hidden": ["partNumber"]
}
```

- A field section lists field keys in order. A `block` entry references a base
  section that is not a plain field card (attachments, components such as
  Compras, Etiqueta, Actividad) and can only be moved or hidden, not edited.
- Hidden blocks are listed in `hidden` by section id.

## Applying a view (pure, `packages/ui/src/runly-renderer/detail-view-layout.js`)

- `detailViewCatalog(blueprint, extraFields)` returns every field def (by key)
  and every block (by section id). Base sections without `id` get a stable id
  derived from their label.
- `defaultDetailView(blueprint)` mirrors the base blueprint (used to start the
  editor and on "Restablecer").
- `applyDetailView(blueprint, view, extraFields)` rewrites `schema.sections`:
  cards keep their order and fields; unknown keys are dropped; base fields and
  blocks missing from the view and not hidden stay visible (appended to their
  original card if it still exists, otherwise to a trailing "Otros datos" card
  / their original position for blocks). This keeps new module fields visible
  after an update. Per-field metadata (type, filterBy, visibleWhen) always comes
  from the base blueprint, never from the stored JSON.
- Cards whose fields are all empty are already hidden by RunlyDetail.

## API

`apps/api/src/routes/detail-views-routes.js`, mounted with auth:

- `GET /detail-views/:viewKey` -> `{ data: schema | null }` (read permission).
- `PUT /detail-views/:viewKey` body `{ schema }` -> upsert (write permission).
- `DELETE /detail-views/:viewKey` -> back to default (write permission).

A registry maps each allowed view key to `{ read, write }` permissions:
`inventory.item.detail` -> read `inventory.item.read`, write
`inventory.customfield.manage`. Unknown keys answer 404. The schema is
validated with Zod (max 40 sections, 80 fields per section, string lengths,
column `main|aside`, columns 1-3). No new permission.

## UI

- `DetailViewDesigner` in `@runly/ui`: full-screen Dialog with fixed header and
  footer. Two columns (Principal / Lateral) of sortable cards (dnd-kit); each
  field card holds sortable field chips that can be dragged to another card or
  to the "Campos ocultos" tray; blocks render as compact movable tiles with a
  hide toggle. Card actions: rename, 1/2 columns, delete (fields go to the
  tray). "Nueva tarjeta". Footer: Restablecer (ConfirmDialog), Cancelar,
  Guardar. Keyboard drag supported through dnd-kit's KeyboardSensor.
- Inventory detail: "Personalizar vista" in the RecordHeader menu, only with
  `inventory.customfield.manage`. The screen flattens custom values into
  `custom:<fieldId>` data keys; the "Campos personalizados" block skips values
  already placed in a card.

## Verification

- Unit tests for `detail-view-layout.js` (default round trip, regroup, hidden,
  new base field stays visible, unknown keys dropped) and the route
  (permissions, validation, upsert/delete).
- `pnpm build:web`, lint, and a browser check of the designer when the dev
  servers are running.
