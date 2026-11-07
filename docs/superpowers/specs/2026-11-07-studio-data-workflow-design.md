# Studio: data panel, dynamic code blocks and editable records

Follows `2026-11-07-studio-data-workflow-audit.md`.

## Objective

Make "one design, many records" a design-time workflow (Canva-style) instead of a
hidden step inside Descargar, and make dynamic QR / barcodes discoverable blocks.

## Behavior

### 1. Elementos: "Códigos dinámicos"
- New section in `ElementsLibrary` (searchable, draggable, click to add). Remove
  the "Códigos y campos" block from the Texto tab.
- Presets: QR enlace público, QR número de activo, QR número de serie, Código de
  barras número de activo, Código de barras folio.
- "Regla personalizada": template text field (`https://…/{{Folio}}`) + QR / Barras
  buttons. When a dataset is loaded its columns appear as chips that append
  `{{columna}}` to the rule.
- Codes are the existing `codeObject(kind, value)` vectors; no document format change.

### 2. Rail: "Datos" panel
- New rail item `data` (icon Table2) after Texto; phone bottom bar still fits.
- Empty: choose source (Archivo / Desde un módulo), same loaders as today.
- Loaded: source card (name, row count, change/remove), **Ver y editar registros**
  button, field mapping for the design's `{{campos}}` (unmapped ones flagged),
  "Insertar columna como" Texto / QR / Barras + column chips (click inserts on
  the page; disabled for viewers).
- The dataset is state of `DesignEditor` (survives closing Descargar and switching
  panels); it is never saved in the design.

### 3. Registros dialog
- `Dialog size="2xl"`, search, editable table (`Table` from `@runly/ui`, `Input`
  cells), 25 rows per page, delete row, add row, "Registros: N".
- Edits apply to the in-memory dataset only. `ids` (inventory print log) stay
  aligned when rows are deleted; new rows have id `null`.
- Row cap stays 500 (`BULK_ROWS`).

### 4. Descargar
- Dialog becomes `size="lg"`.
- The inline data section is replaced by a summary: "N versiones desde X",
  count of unmapped fields (warning), and **Editar datos** which closes the dialog
  and opens the Datos panel. Without a dataset: one line pointing to Datos.
- Export payload unchanged (`options.bulk`).

## Out of scope
Canvas preview of record N, saving the dataset with the design, row selection
checkboxes, photo-mode insertion from the Datos panel (photo field is still set in
the image inspector).

## Verification
Unit tests for the row helpers (delete keeps `ids` aligned, add row, search) and the
rule/preset list; `pnpm lint`; `pnpm build:web`; existing studio tests.
