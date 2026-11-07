# Studio: audit of the data / dynamic-codes workflow

Date: 2026-11-07. Scope: how a user connects module or spreadsheet data to a
Studio design and prints one label per record.

## Findings

| # | Finding | Evidence | Impact |
|---|---------|----------|--------|
| 1 | Dynamic QR / barcode blocks live in the **Texto** tab, under "Códigos y campos". | `InsertPanels.jsx` `TextPanel` (`CODES`) | A QR is not text; users look in Elementos. Hard to discover. |
| 2 | Only two fixed presets (`{{Enlace público}}`, `{{Número de activo}}`); no way to build a code from a rule (`https://x/{{Folio}}`) without placing it and editing the inspector. | `CODES` constant, `CodeContentField` | "Dynamic QR from rules" is not expressible from the library. |
| 3 | The whole data flow (source, mapping, insert columns) is inside **Descargar**, a `size="md"` dialog. Data is a late, hidden step after the design is done. | `ExportDialog.jsx` `BulkDataSection` | Users do not find it; the design cannot be built with the data in view. |
| 4 | The dataset lives in `ExportDialog` local state: closing the dialog loses it. | `useState(bulk)` in `ExportDialog` | Re-upload / re-query on every download attempt. |
| 5 | No way to **see** the records, only "N filas" and one "Ej." value per field. | `BulkDataSection` | Cannot verify what will print. |
| 6 | Records cannot be corrected, removed or added; the only fix is editing the source and reloading. | no editing code exists | Bad flow for "print these 7 labels, fix one typo". |
| 7 | Inserting a column creates only a text box; QR / barcode / photo need extra manual steps. | `insertField` | Slow for label design. |
| 8 | Unmapped fields silently print empty. | `rowValues` | Wrong labels without warning. |
| 9 | Export dialog is narrow and stacks type cards, data, options and result in one scroll. | `DialogContent size="md"` | The reported "angosto / oculto" feeling. |

## What already works (keep)

`{{campo}}` substitution, `fillDocument`, module providers (`/studio/data-sources`),
CSV/XLSX parsing, ZIP/PDF/ZPL outputs, inventory print log, remembered module
source. The export pipeline consumes `options.bulk = { rows, mapping, source, ids, images }`
and is not changed.

## Canva reference (Bulk create)

Canva puts data in a **side panel** ("Bulk create"): connect data, see the table,
click a column to drop it as a field on the page, then "Continue" to generate.
Data is a first-class editing step, visible while designing; generating is the end.

## Direction

1. Dynamic codes become **Elementos** blocks with rules.
2. Data gets its own rail panel **Datos** (connect, map, insert as text/QR/barcode).
3. A wide **Registros** dialog shows and edits the records.
4. **Descargar** only summarizes the dataset and links back to Datos.
