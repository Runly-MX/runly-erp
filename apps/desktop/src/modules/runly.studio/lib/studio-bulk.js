import { documentPages } from '../../../../../shared/studio/pages.js'

// Bulk create: text boxes carry {{campo}} placeholders; each spreadsheet row
// fills them in a copy of the document. The saved design is never touched.
export const BULK_ROWS = 500, BULK_PDF_PAGES = 200
const FIELD = /\{\{\s*([^{}]{1,60}?)\s*\}\}/g
export const fieldKey = value => String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase().replace(/\s+/g, ' ')

// Unique field names in document order (first spelling wins).
export function designFields(document) {
  const seen = new Map()
  for (const scene of document ? documentPages(document) : []) for (const object of scene.objects) {
    if (object.type !== 'text') continue
    for (const [, name] of object.text.matchAll(FIELD)) if (!seen.has(fieldKey(name))) seen.set(fieldKey(name), name)
  }
  return [...seen.values()]
}

const fillScene = (scene, values) => ({ ...scene, objects: scene.objects.map(object => object.type === 'text'
  ? { ...object, text: object.text.replace(FIELD, (_, name) => values[fieldKey(name)] ?? '') } : object) })

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
