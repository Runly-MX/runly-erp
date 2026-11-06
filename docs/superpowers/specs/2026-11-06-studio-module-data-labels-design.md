# Studio: module data sources, QR/barcode elements and label sizes

Builds on `2026-11-06-studio-bulk-create-design.md` (phases 1-2 of the
"etiquetas desde Studio" roadmap; ZPL, printers, HR/contacts come later).

## Objective

Design labels (and any batch piece) in Studio fed by live Runly data instead of
a spreadsheet: pick a module, filter its records, map its fields to `{{campo}}`
placeholders, and export the batch. QR codes and Code 128 barcodes are design
elements whose content can be a field.

## Module data sources (API)

- Registry `apps/api/src/routes/studio/studio-data-providers.js`. Each provider:
  `key`, `label`, `permission`, `filters(companyId)`, `rows(c, filters)` returning
  `{ headers, rows, total, truncated }`, the same shape as the spreadsheet parse.
- `GET /studio/data-sources` lists only providers whose permission the user has
  (admins see all), with their filter definitions.
- `POST /studio/data-sources/:key/rows` `{ filters }` returns at most 500 rows.
- Data is read at export time with the exporter's permissions and module scope,
  and is never stored in the design.
- Providers:
  - **Inventario** (`inventory.item.read`, inventory area scope): Nombre,
    Número de activo, Folio, Modelo, Marca, Categoría, Número de serie, Número de
    parte, Ubicación, Área, Responsable, Estado. Filters: search text, location,
    "Solo sin etiqueta". With `inventory.label.print` it also returns
    **Enlace público** (the same public link the inventory QR labels use; tokens
    are created lazily in one batch).
  - **Flota** (`fleet.vehicles.read`): Placa, Número económico, Marca, Modelo,
    Tipo, Año, Color, Estado, Conductor. Filter: search text.
- Headers are Spanish labels; `{{numero de activo}}` matches "Número de activo"
  (case/accent-insensitive, as in the spreadsheet flow).

## QR and barcode elements

- A `vector` object with `code: { kind: 'qr' | 'code128', value }` (value up to
  500 characters, may contain `{{campo}}`). Its `geometry` is generated from the
  value (QR modules or Code 128 bars as path data), so the existing renderer,
  thumbnails, packages and realtime sync handle it unchanged.
- Insert panel: "Código QR" and "Código de barras". Selection controls: a
  "Contenido" field that regenerates the geometry.
- Batch export regenerates the geometry per row with the filled value; placeholders
  are listed as fields like text placeholders.
- Code 128 encodes printable ASCII (code set B); other characters are replaced
  with `?` and a hint says so.

## Label sizes

Page presets in mm at 300 ppp (pixels = mm / 25.4 × 300): 50 × 25, 62 × 29,
100 × 50, 2" × 1", 4" × 6". Exporting a PDF at 300 ppp keeps the physical size.

## Out of scope (next phases)

ZPL export and direct printing, print log, HR/contacts providers, photo per row,
labels-per-sheet imposition, saving the data source with the design.

## Verification

Unit: providers (row shaping, permissions filter), QR/Code 128 geometry and
checksum, field detection and fill for codes. Build + lint.
