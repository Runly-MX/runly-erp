# Inventory: one flow to change custody (Resguardo)

Spec + plan (short). Date: 2026-10-15.

## Decision
Changing who holds an item goes through a Resguardo (document with folio). The item panel no longer assigns or returns directly. `POST /inventory/items/:id/assign|return` stay as internal/automation endpoints (MirAI, integrations).

## Changes
1. Item panel: "Asignar" / "Devolver" navigate to the custody list with `?new=1&kind=&employee=&items=` which opens the create sheet prefilled. The sheet passes `itemIds` to the create call (server already validates them). Pure helper `lib/custody-links.js` builds/parses the link.
2. Complete without signature: `POST /inventory/custodies/:id/complete` with `allowUnsigned: true` now requires `unsignedReason` (min 10 chars) and permission `inventory.custody.complete_unsigned` (admins implicit). The reason is stored in `inv_custody.unsigned_reason` (migration, nullable column), written to the audit entry and shown in the detail as a "Completado sin firma" badge. The document renders blank signature boxes (no image is ever fabricated). Pure helper `unsignedCompletionDecision` in `inventory-custody-helpers.js`.
3. "Asignaciones" tab becomes "Quién tiene qué": read-only; default filter active; each row links to its resguardo (`custody { id, folio, status }` added to `GET /inventory/assignments` through `inv_custody_item.assignment_id`), or shows "Sin resguardo".
4. Docs: docs/ai-context/rme3-runtime-capabilities.md inventory note.

## Verification
node --test (helpers + custody-links), lint, vite build.
