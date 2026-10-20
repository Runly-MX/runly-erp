# Inventory supplier portal - parity with the main module (backend) Plan

Follows `2026-10-20-inventory-supplier-portal-backend.md`. UI is a separate batch built from the HTTP contract.

## Decisions
- Capability flags live on the guest membership row (`inv_area_member`, guest rows only), per area: `can_create_models` (also governs creating brands/types/locations/conditions from the item form, "catalog entries") and `can_import` (Excel import). Both default false, never effective for a viewer role. Additive migration, no backfill needed.
- Effective capability of the guest = the flag on the membership that grants write access to the area (a flag on a parent area applies to its descendants, same inheritance as roles; an explicit editor membership is required).
- Item write schema accepts every non-sensitive field of the main form (`modelId`, `model`, `folio`, `warrantyExpiry`, `warrantyNotes`, custom values...). Still rejected with FIELD_NOT_ALLOWED: price/vendor/invoice/purchase date/acquisition origin/license/admin status/assignment/custody/area move on patch.
- `modelId` goes through `inventory-model-service.applyModelDefaults` exactly like the main route.
- Guest model/catalog creation reuses `inventory-model-service` and `inventory-catalog-service`, company scoped, audited as the guest.
- Import reuses `inventory-item-import-service` with a `guest` restriction option (sensitive columns removed from template/fields, rejected when mapped, baja words refused, `createMissing` only with the flag); same response shapes as the main routes.
- Branding: company `{ name, logoUrl, primaryColor }` in `/me` and the session exchange.
- Comments: not exposed. `EntityComment` needs a user author (FK to user profile) and the thread contains internal user data; a guest variant needs its own table. Left out and reported.

## Tasks (one commit each)
1. Plan + migration/schema (`can_create_models`, `can_import`).
2. Invitation side: invite body flags, `PATCH .../guests/:guestId`, list returns flags; scope exposes effective capabilities.
3. Guest items: full field set, model defaults, custom field defs, `/me` capabilities + branding.
4. Guest endpoints: models list/create, types, catalog entry creation, custom field values suggestions, check-identifiers.
5. Import service restriction option + guest import routes.
6. Isolation tests, docs, lint, suites.
