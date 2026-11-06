# Studio: crear en lote desde CSV/Excel

## Objective

Generate many versions of one Studio design from a spreadsheet (certificates,
badges, labels, invitations): every row of a CSV/XLSX replaces the design's
variable fields, and the download produces one image per row (ZIP) or one PDF
with every row. The saved design is never modified.

## Behavior

- **Variable fields**: any text box can contain `{{campo}}` placeholders
  (several per box, mixed with fixed text). Field names are trimmed and matched
  case/accent-insensitively against the spreadsheet headers.
- **Data source**: in "Descargar", section "Datos para varias versiones" accepts
  `.csv` or `.xlsx` (first sheet, first row = headers, up to 500 rows, 2 MB).
  The API parses it (`POST /studio/data-sources/parse`, `studio.view`); nothing
  is stored.
- **Mapping**: each detected field gets a column (auto-matched by name, editable
  with `SelectField`; "Dejar vacío" is allowed). Columns can also be inserted into
  the active page as a new text box `{{columna}}` ("Insertar") when the user can edit.
- **Output**:
  - PNG/JPG: active page, one file per row, packed in a `.zip`
    (`<n>-<first mapped value>.png`).
  - PDF: the selected pages for every row, in row order, physical size from the
    chosen design resolution, rendered at 300 ppp as JPEG, RGB, no bleed or crop
    marks (built in the browser with jsPDF; the CMYK print job keeps its 24-page
    limit). At most 200 PDF pages per download.
- Rows with empty values render the placeholder as empty text.
- The export keeps the existing guarantees: credits review of the exact scene,
  revision check before/after, abort, sanitized errors, image authorization per
  render.

## Out of scope

Image fields (photo per row), saving the data source with the design, charts,
server-side batch rendering, CMYK/bleed in batch PDFs.

## Verification

- Unit: placeholder detection, substitution, auto-mapping, CSV/XLSX parsing.
- Build: `pnpm build:web`, lint.
