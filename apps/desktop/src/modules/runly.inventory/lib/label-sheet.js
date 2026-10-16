// Letter-sheet ("hoja carta en cuadrícula") math for the Etiquetas studio.
// Mirrors apps/api/src/services/inventory-labels/layout.js normalizeSheet and
// pdf.js sheetCells: the grid is centred horizontally and starts at the top
// margin. The API validates again; this keeps the preview and the hints honest.
export const LETTER = { widthMm: 215.9, heightMm: 279.4 }
export const DEFAULT_SHEET = { columns: 3, rows: 6, gapMm: 3, marginMm: 8, guides: false }
export const SHEET_LIMITS = {
  columns: { min: 1, max: 20 },
  rows: { min: 1, max: 40 },
  gapMm: { min: 0, max: 30 },
  marginMm: { min: 0, max: 50 },
}

const clamp = (value, { min, max }, fallback, integer = false) => {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  const out = Math.min(max, Math.max(min, n))
  return integer ? Math.round(out) : out
}

export function clampSheet(raw = {}) {
  const s = { ...DEFAULT_SHEET, ...(raw ?? {}) }
  return {
    columns: clamp(s.columns, SHEET_LIMITS.columns, DEFAULT_SHEET.columns, true),
    rows: clamp(s.rows, SHEET_LIMITS.rows, DEFAULT_SHEET.rows, true),
    gapMm: clamp(s.gapMm, SHEET_LIMITS.gapMm, DEFAULT_SHEET.gapMm),
    marginMm: clamp(s.marginMm, SHEET_LIMITS.marginMm, DEFAULT_SHEET.marginMm),
    guides: Boolean(s.guides),
  }
}

// Largest grid that fits the letter page for a label size, gap and margin.
export function maxGrid(widthMm, heightMm, gapMm = 0, marginMm = 0) {
  const w = Number(widthMm)
  const h = Number(heightMm)
  if (!(w > 0) || !(h > 0)) return { columns: 0, rows: 0 }
  const fit = (page, size) => Math.max(0, Math.floor((page - 2 * marginMm + gapMm) / (size + gapMm) + 1e-9))
  return {
    columns: Math.min(SHEET_LIMITS.columns.max, fit(LETTER.widthMm, w)),
    rows: Math.min(SHEET_LIMITS.rows.max, fit(LETTER.heightMm, h)),
  }
}

// -> { fits, reason, perPage, usedWidthMm, usedHeightMm, max }
export function sheetFit(sheet, widthMm, heightMm) {
  const s = clampSheet(sheet)
  const w = Number(widthMm)
  const h = Number(heightMm)
  const usedWidthMm = s.columns * w + (s.columns - 1) * s.gapMm + 2 * s.marginMm
  const usedHeightMm = s.rows * h + (s.rows - 1) * s.gapMm + 2 * s.marginMm
  const max = maxGrid(w, h, s.gapMm, s.marginMm)
  let reason = null
  if (usedWidthMm > LETTER.widthMm + 0.01) reason = `Caben máximo ${max.columns} ${max.columns === 1 ? 'columna' : 'columnas'} a lo ancho.`
  else if (usedHeightMm > LETTER.heightMm + 0.01) reason = `Caben máximo ${max.rows} ${max.rows === 1 ? 'fila' : 'filas'} a lo alto.`
  return { fits: !reason, reason, perPage: s.columns * s.rows, usedWidthMm, usedHeightMm, max }
}

// Same grid as the API with the largest columns/rows that fit.
export function autoSheet(sheet, widthMm, heightMm) {
  const s = clampSheet(sheet)
  const max = maxGrid(widthMm, heightMm, s.gapMm, s.marginMm)
  return { ...s, columns: Math.max(1, max.columns), rows: Math.max(1, max.rows) }
}

export function sheetCells(sheet, widthMm, heightMm) {
  const s = clampSheet(sheet)
  const gridW = s.columns * widthMm + (s.columns - 1) * s.gapMm
  const x0 = (LETTER.widthMm - gridW) / 2
  const cells = []
  for (let row = 0; row < s.rows; row += 1) {
    for (let col = 0; col < s.columns; col += 1) {
      cells.push({ x: x0 + col * (widthMm + s.gapMm), y: s.marginMm + row * (heightMm + s.gapMm) })
    }
  }
  return cells
}

export const sheetPages = (labelCount, perPage) => (perPage > 0 && labelCount > 0 ? Math.ceil(labelCount / perPage) : 0)
