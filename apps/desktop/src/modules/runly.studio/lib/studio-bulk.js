import { documentPages } from '../../../../../shared/studio/pages.js'
import { codeGeometry } from './studio-codes.js'
import { FILE_ID } from '../../../../../shared/studio/document.js'

// Bulk create: text boxes carry {{campo}} placeholders; each spreadsheet row
// fills them in a copy of the document. The saved design is never touched.
export const BULK_ROWS = 500, BULK_PDF_PAGES = 200
const FIELD = /\{\{\s*([^{}]{1,60}?)\s*\}\}/g
export const fieldKey = value => String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase().replace(/\s+/g, ' ')

// Unique field names in document order (first spelling wins).
export function designFields(document) {
  const seen = new Map()
  for (const scene of document ? documentPages(document) : []) for (const object of scene.objects) {
    if (object.imageField && !seen.has(fieldKey(object.imageField))) seen.set(fieldKey(object.imageField), object.imageField)
    const source = object.type === 'text' ? object.text : object.code?.value
    if (typeof source !== 'string') continue
    for (const [, name] of source.matchAll(FIELD)) if (!seen.has(fieldKey(name))) seen.set(fieldKey(name), name)
  }
  return [...seen.values()]
}

const fill = (source, values) => source.replace(FIELD, (_, name) => values[fieldKey(name)] ?? '')
// Codes regenerate their geometry from the filled value (a too-long value fails that row's export).
const fillObject = (object, values) => {
  if (object.type === 'text') return { ...object, text: fill(object.text, values) }
  // A row without a photo keeps the design's placeholder image.
  if (object.imageField) { const id = values[fieldKey(object.imageField)]; return FILE_ID.test(id ?? '') ? { ...object, fileAssetId: id.toLowerCase() } : object }
  if (!object.code?.value.includes('{{')) return object
  const value = fill(object.code.value, values)
  return { ...object, code: { ...object.code, value }, geometry: codeGeometry(object.code.kind, value) }
}
const fillScene = (scene, values) => ({ ...scene, objects: scene.objects.map(object => fillObject(object, values)) })

// values: { [fieldKey]: text }
export function fillDocument(document, values) {
  const filled = fillScene(document, values)
  return document.additionalPages ? { ...filled, additionalPages: document.additionalPages.map(scene => fillScene(scene, values)) } : filled
}

// field -> header with the same normalized name, or '' (left empty).
export function autoMapping(fields, headers) {
  return Object.fromEntries(fields.map(field => [field, headers.find(header => fieldKey(header) === fieldKey(field)) ?? '']))
}

export function rowValues(row, mapping) {
  return Object.fromEntries(Object.entries(mapping).map(([field, header]) => [fieldKey(field), header ? String(row[header] ?? '') : '']))
}

// Labels per letter sheet (laser printers): 10 mm margins, 3 mm gaps. null when one does not fit.
export const LETTER_MM = { width: 215.9, height: 279.4 }
export function sheetGrid(label, { margin = 10, gap = 3 } = {}) {
  const fit = (sheet, size) => Math.floor((sheet - 2 * margin + gap) / (size + gap))
  const columns = fit(LETTER_MM.width, label.width), rows = fit(LETTER_MM.height, label.height)
  if (columns < 1 || rows < 1) return null
  const cell = index => ({ page: Math.floor(index / (columns * rows)), x: margin + (index % columns) * (label.width + gap), y: margin + Math.floor((index % (columns * rows)) / columns) * (label.height + gap) })
  return { columns, rows, perSheet: columns * rows, cell }
}

// Record editing (Registros dialog). `ids` (inventory print log) stay aligned with `rows`.
export const removeRow = (data, index) => ({ ...data, rows: data.rows.filter((_, i) => i !== index), ids: data.ids ? data.ids.filter((_, i) => i !== index) : data.ids })
export const addRow = data => data.rows.length >= BULK_ROWS ? data
  : { ...data, rows: [...data.rows, Object.fromEntries(data.headers.map(header => [header, '']))], ids: data.ids ? [...data.ids, null] : data.ids }
export const setCell = (data, index, header, value) => ({ ...data, rows: data.rows.map((row, i) => (i === index ? { ...row, [header]: value } : row)) })
// Indexes (into data.rows) of the rows containing the query in any cell.
export function searchRows(data, query) {
  const needle = fieldKey(query)
  return data.rows.flatMap((row, index) => (!needle || Object.values(row).some(cell => fieldKey(cell).includes(needle)) ? [index] : []))
}
