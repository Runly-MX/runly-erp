# Studio collections and favorites

## Goal
Let each user organize Studio designs and templates (stored and Runly built-in) into personal
collections, with a built-in "Favoritos" collection, and filter the home lists by collection.

## Model
- `studio_collection` (company_id, owner_id, name <= 60, is_favorites). Private to its owner. At most 30 per user and company; one favorites collection per user and company.
- `studio_collection_item` (collection_id, exactly one of design_id, template_id, builtin_key). Foreign keys cascade, so deleting a design or template removes its entries. At most 500 items per collection.
- No grants to roles; accessed only through the authorized API (RLS enabled, like other Studio tables).

## API (permission studio.view; owner only)
- `GET /studio/collections` list with item counts (favorites first, always present as a virtual entry until first use).
- `POST /studio/collections {name}`, `PATCH /studio/collections/:id {name}`, `DELETE /studio/collections/:id` (favorites cannot be renamed or deleted).
- `PUT|DELETE /studio/collections/:id/items {kind, itemId}`; `kind` is `design`, `template` or `builtin`. The item must be visible to the user (design `can_access`, template company/own, builtin must exist).
- `GET /studio/favorites` ids the user favorited; `PUT|DELETE /studio/favorites {kind, itemId}`.
- `collection=<id>` (or `favorites`) query on `GET /studio/designs` and `GET /studio/templates` filters to that collection (owner-checked).

## UI
Home sidebar gets a Colecciones section (Favoritos + user collections, create/rename/delete). Cards get a favorite heart and an "Agregar a colección" menu action. Selecting a collection shows its designs and templates.

## Acceptance
Items appear only for their owner; deleting a design removes it from collections; limits enforced; a design the user can no longer access cannot be added; E2E through the API and the UI in the test company.
