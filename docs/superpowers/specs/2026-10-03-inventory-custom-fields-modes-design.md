# Campos personalizados de Inventario: por tipo y a demanda

Date: 2026-10-03
Status: Approved (owner request, 2026-10-03)
Plan file: docs/superpowers/plans/2026-10-03-inventory-custom-fields-modes.md

## Problem

Custom fields only work per type ("Se pide en": one type or all types): every
item of the type always shows them. The owner wants a second mode: a library
of fields searchable from the item form, added at will to one specific item.
Also found: the edit form never preloads existing custom values (they look
empty and an unchanged save keeps them only by accident) and the item detail
never shows custom values at all.

## Design

Two modes, one model:

1. **Por tipo** (existing): `categoryId` = a type or `null` (all types);
   always shown for items of that type.
2. **A demanda** (new): `InvCustomField.onDemand = true` (new column, forward
   migration, default false). Never shown automatically; added to an item
   from the form's search. Any definition (another type's or on-demand) can
   be added to one item this way.

An item "has" an extra field when it has an `InvCustomFieldValue` row for a
field outside its type set (value non-empty, or the field is on-demand —
on-demand rows persist even with an empty value).

API: `onDemand` on create/update; type-scoped list (`?categoryId=<id>` or
empty) excludes on-demand fields; `?categoryId=all` lists everything (the
library). Item create/update accept `customValues` (an attached field may
send `value: null`) and `removedCustomFieldIds` (deletes those value rows).
`getItem` returns `customValues[].field` with `categoryId`/`onDemand`.

UI (`DynamicFieldsSection`, generic):

- Type fields grid as today; below, "Campos de este activo" (extra fields)
  with a remove button each.
- "Agregar campo" combobox searches the library (excluding shown fields);
  "Crear campo" opens the inline creator with scope "Solo este activo"
  (on-demand + attached), "Siempre en este tipo" or "Siempre en todos los
  tipos".
- RunlyForm seeds `customValues.<fieldKey>` from `initialData.customValues`
  and passes the extra definitions in; removals ride in
  `customValues.__removed`.
- Catalog panel: "Se pide en" gains "Solo a demanda".
- Item detail: new "Campos personalizados" section (type + extra fields with
  values), hidden when there are none.

Also fixed: visually hidden inputs (`sr-only`) inside inner scroll
containers scrolled the whole app shell when focused (checkbox click).

## Non-goals

No per-item required rules; no reordering of extra fields; no migration of
existing data.

## Addendum 2026-11-05: several types per field and bulk assignment

- `inv_custom_field.category_id` became `category_ids uuid[]` (migration
  `20261227100000_inv_custom_field_types`, backfilled from the old column).
  Empty list + `onDemand: false` = every type; empty list + `onDemand: true` =
  only the items it is added to. The API still accepts the legacy single
  `categoryId` on create/update (inline creator, MirAI actions).
- Catálogos > Campos defaults new fields to "Solo en los activos
  seleccionados" and lets "En los tipos que elijas" mark several types.
- `GET|POST /inventory/custom-fields/:id/items` (`{ add, remove }` item ids,
  max 5000, area scope applied) back the "Activos" sheet: adding creates an
  empty value so the field shows on each item's form; removing deletes the
  stored value.
