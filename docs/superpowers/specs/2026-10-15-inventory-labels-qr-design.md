# Inventory: folio, QR labels, public page and scan kiosk

Date: 2026-10-15. Status: design, pending review.

## Goal

Let a company identify every inventory item with a stable folio, print QR labels
(Zebra ZD/DS via ZPL, any other printer via PDF/PNG), track which items already
have a label, open a public item page from the QR, and scan QRs in bulk from a
kiosk screen. Delivered in four phases; phases 1-3 need no physical printer.

## Phase 1 - Folio (foundation)

### Format

The folio keeps the nomenclature already used in sinabe: `TYPE-BRAND-MODEL-N`,
for example `TEL-CIS-CP7-158` (telephone, Cisco, CP7821, consecutive 158).

- `InvItem.folio`: `VarChar(100)`, nullable at the column level, unique per
  company among enabled items (partial unique index, same pattern as
  `assetTag`). Immutable once set except by an explicit admin edit.
- Folio is independent from `assetTag` (company-assigned, optional) and from
  `serialNumber` (optional, may repeat). Every item gets a folio, with or
  without serial.
- Prefix source: new optional `code` (2-6 uppercase alphanumerics) on
  `InvType`, `InvBrand` and `InvModel`. When `code` is empty the generator
  derives it: first 3 letters of the name for type and brand, first 3 alphanumeric
  characters for the model. Codes are editable in the catalogs screen
  (Types / Brands / Models panels); changing a code never rewrites existing
  folios.
- Consecutive: per company and per prefix (`TEL-CIS-CP7`), `max(existing)+1`,
  allocated atomically from a counter table `inv_folio_counter
  (company_id, prefix, last_value)` updated with `INSERT ... ON CONFLICT DO
  UPDATE ... RETURNING`, never read-then-write. Padding is not enforced
  (`158`, not `000158`) to match migrated data.
- Missing type, brand or model: that segment is skipped, and an item with none
  of them uses prefix `INV`.
- Assigned server-side on item create (and on the first save that gives a
  previously unclassified item a type/brand/model is NOT re-folioed). Manual
  folio entry is accepted when unique, which also covers imports.

### Migration of existing data

1. Prisma migration (forward only): add `inv_item.folio`, the partial unique
   index, `code` columns, and `inv_folio_counter`. No backfill in SQL.
2. Backfill script `scripts/migrations/inventory-folio-backfill.mjs`
   (dry-run by default, `--apply` to write, prints counts only, never secrets):
   1. For every item with a custom value on field key `sinabe_folio_interno`
      and a non-empty value: normalize (trim, uppercase, collapse spaces); if
      unique within the company, set it as `folio`. Duplicates and empties are
      listed in the report and fall through to step 2.
   2. Items still without folio get a generated one in `created_at` order.
   3. Seed `inv_folio_counter`: for each folio matching `^(.*)-(\d+)$`, set
      `last_value = max(N)` for that prefix, so new folios continue after the
      migrated ones (`TEL-CIS-CP7-159`). This runs before step 2.
   4. The original `Folio interno (sinabe)` custom value is kept untouched as
      provenance; it can be hidden from the form afterwards.
   Idempotent: items that already have a folio are skipped.
3. Sinabe migrator (`mapping/item.mjs`, `mapping/custom-fields.mjs`,
   `migrate-items.mjs`): map `internalFolio` straight to `folio` (still also
   writing the custom field), report duplicates, and seed the counters at the
   end of the items stage. Existing README and mapping tests are updated.
4. Importers (`InventoryItemImportDialog`, `legacy-import`) accept a `folio`
   column.

## Phase 2 - Labels and printing

### Data

- `inv_label_template`: company, name, width/height mm, dpi, layout
  (`qr-left` | `qr-top` | `text-only`), ordered visible fields, QR options
  (error correction, quiet zone, content mode), logo, default flag.
- `inv_label_printer`: company, name, format (`zpl` | `pdf` | `png`), dpi,
  transport (`browser` | `network` | `bluetooth` | `file`), address, default
  template, media width/height.
- `inv_label_print`: item, template, printer, quantity, user, timestamp.
  Source of truth for "labeled", "last printed" and reprint history.

### QR content

Default content is the public URL `/app/p/inv/<token>` (token from phase 3), so
the code stays valid when data changes and exposes nothing on its own. Serial,
model and the other fields are printed as text, selected per template. An
optional "embedded data" mode encodes `folio|serial|model` as plain text for
offline use, with an on-screen warning that it can go stale.

### Rendering

One layout model (JSON) in `packages/` shared by API and UI, rendered to:
ZPL (Zebra ZD/DS), PDF (exact page size, any printer through the system
dialog) and PNG (preview, other thermal printers). Presets: 50x25, 60x40,
100x50 mm, plus custom size. Quantity is per queue row, with "apply to all".

### UI (`runly.inventory`, "Etiquetas")

- Entry points: module navigation tab, bulk action "Imprimir etiquetas" in the
  item list, and an "Etiqueta / QR" section in the item detail.
- Desktop: three panels (queue, live preview, template and printer settings).
- Mobile: same content in steps with a fixed bottom bar (Cola, Vista previa,
  Ajustes, Imprimir); preview stays pinned above the settings.
- Item detail: QR preview, state ("Impresa el ..., N veces"), print/reprint,
  "Ver con detalles" (large QR, copy link).
- Item list: label state column and "Sin etiquetar" filter.
- Built only from `@runly/ui` (Sheet, Dialog with DialogHeader icon, SelectField,
  RunlyTable, ConfirmDialog, PageHeader, EmptyState). All text in Spanish.

## Phase 3 - Public page and kiosk

- Public page `/app/p/inv/<token>`: no login, opaque revocable token per item,
  shows photo, name, folio, status and location; company setting controls extra
  fields (costs and holder hidden by default). Buttons "Ver detalles" and
  "Editar" go to the private route through login and return. A signed-in user
  with permission is offered the direct detail link.
- Kiosk ("Escanear"): full-screen camera scan with `@zxing/browser`, continuous
  mode, feedback on each read, duplicate detection, match by token, folio,
  serial or asset tag, session list with export to CSV/XLSX and bulk actions
  (print labels, create custody, change status/location). USB/Bluetooth
  keyboard-wedge scanners work through a focused input.

## Phase 4 - Direct printing

- Network ZPL (port 9100) through the API/installer; `.zpl` download.
- APK Bluetooth: extend `native-device` with `bluetooth.print(deviceId, bytes)`
  over SPP/RFCOMM (Kotlin next to `DeviceAccess.kt`). Highest risk phase: needs
  the real printer to verify; ZPL and PDF cover printing meanwhile.

## Testing

Focused tests only: folio allocation and prefix derivation, backfill dry-run
and counter seeding, ZPL/PDF layout output, public token resolution and
revocation. Backfill verified in dry-run against the Test company before
`--apply`.

## Open items

- Exact Zebra model and transport (decides phase 4 priority only).
- Company-level folio prefix override is not included (YAGNI) unless asked.
