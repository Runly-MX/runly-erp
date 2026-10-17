// Converts between the builder page document ({ regions, blocks } keyed by id,
// see @raulbellosom/atlas-web-builder) and a nested "sections" form that an
// external assistant can write: [{ type, props, children: { slot: [...] } }].
// Validation is strict and catalog-driven (block-catalog.json): unknown block
// types, unknown props, invalid select values and unsafe URLs are rejected with
// path-precise messages so the assistant can correct its own output.
import { createRequire } from 'node:module'

const catalog = createRequire(import.meta.url)('./block-catalog.json')

export const BLOCK_CATALOG = catalog
export const MAX_BLOCKS = 300
const MAX_DEPTH = 6
const TEXT_LIMITS = { text: 2000, textarea: 8000, 'rich-text': 20000 }
const SAFE_HREF = /^(https?:\/\/|mailto:|tel:|\/(?!\/)|#)/i
const UNSAFE_TEXT = /javascript:|vbscript:|data:text\/html|expression\s*\(/i
const UNSAFE_HTML = /<\s*\/?\s*(script|iframe|object|embed|style|link|meta|form|base)\b|\son[a-z]+\s*=|javascript:|vbscript:|data:text\/html/i
const SITE_GROUPS = { website: [], landing: [], blog: [], ecommerce: ['ecommerce'], bookings: ['bookings'], restaurant: ['restaurant'] }

const byType = new Map(catalog.blocks.map(block => [block.type, block]))

export class PageDocumentError extends Error {
  constructor(problems) {
    super(`Página inválida: ${problems.slice(0, 12).join('; ')}${problems.length > 12 ? ` (+${problems.length - 12} más)` : ''}`)
    this.code = 'invalid_page'
    this.status = 422
    this.problems = problems
  }
}

// Blocks offered for a site type; the public renderer accepts all of them.
export function blocksForSite(siteType) {
  const groups = new Set(['base', 'universal', ...(SITE_GROUPS[siteType] ?? ['ecommerce', 'bookings', 'restaurant'])])
  return catalog.blocks.filter(block => groups.has(block.group))
}

const safeUrl = (value, { image = false } = {}) => value === '' || (image ? /^(https:\/\/|\/(?!\/))/i : SAFE_HREF).test(value)

function checkBackground(value, path, problems) {
  if (value === null || value === '') return
  if (typeof value === 'string') {
    if (!/^[a-zA-Z][\w-]{0,40}$/.test(value)) problems.push(`${path}: token de color inválido`)
    return
  }
  if (typeof value !== 'object' || Array.isArray(value) || !['color', 'gradient', 'image'].includes(value.kind)) {
    problems.push(`${path}: usa { kind: "color"|"gradient"|"image", ... }`)
    return
  }
  for (const [key, inner] of Object.entries(value)) {
    if (typeof inner === 'number' ? !Number.isFinite(inner) : typeof inner !== 'string' && typeof inner !== 'boolean') problems.push(`${path}.${key}: valor inválido`)
    else if (typeof inner === 'string' && (inner.length > 2048 || UNSAFE_TEXT.test(inner) || /[<>;{}]|url\s*\(/i.test(inner))) problems.push(`${path}.${key}: valor no permitido`)
  }
  if (value.kind === 'image' && !(typeof value.url === 'string' && safeUrl(value.url, { image: true }))) problems.push(`${path}.url: se requiere una imagen https`)
}

function checkProp(field, value, path, problems) {
  switch (field.type) {
    case 'select':
      if (!field.options?.includes(String(value))) problems.push(`${path}: "${value}" no es una opción (${field.options?.join(', ')})`)
      return
    case 'toggle':
      if (typeof value !== 'boolean') problems.push(`${path}: se espera true/false`)
      return
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value) || (field.min !== undefined && value < field.min) || (field.max !== undefined && value > field.max)) problems.push(`${path}: número inválido`)
      return
    case 'background':
      checkBackground(value, path, problems)
      return
    case 'link':
    case 'image':
      if (typeof value !== 'string' || value.length > 2048 || !safeUrl(value, { image: field.type === 'image' })) problems.push(`${path}: ${field.type === 'image' ? 'imagen https o ruta /' : 'enlace https, mailto:, tel:, /ruta o #ancla'}`)
      return
    default: {
      const limit = TEXT_LIMITS[field.type] ?? 2000
      if (typeof value !== 'string') problems.push(`${path}: se espera texto`)
      else if (value.length > limit) problems.push(`${path}: máximo ${limit} caracteres`)
      else if ((field.type === 'rich-text' ? UNSAFE_HTML : UNSAFE_TEXT).test(value)) problems.push(`${path}: contenido no permitido`)
    }
  }
}

// sections -> builder document. IDs are deterministic (DFS order) so the same
// input always yields the same document: MCP proposals are fingerprinted and
// re-prepared on approval and commit.
export function sectionsToDocument({ id, slug, title, sections }) {
  const problems = [], blocks = {}
  let count = 0
  function visit(section, path, depth) {
    if (!section || typeof section !== 'object' || Array.isArray(section)) { problems.push(`${path}: se espera un objeto { type, props }`); return null }
    const definition = byType.get(section.type)
    if (!definition) { problems.push(`${path}.type: bloque desconocido "${section.type}"`); return null }
    if (depth > MAX_DEPTH) { problems.push(`${path}: anidación máxima ${MAX_DEPTH}`); return null }
    if (++count > MAX_BLOCKS) { if (count === MAX_BLOCKS + 1) problems.push(`máximo ${MAX_BLOCKS} bloques por página`); return null }
    const blockId = `b${count}`
    const props = section.props ?? {}
    if (typeof props !== 'object' || Array.isArray(props)) problems.push(`${path}.props: se espera un objeto`)
    else for (const [key, value] of Object.entries(props)) {
      const field = definition.fields[key]
      if (!field) problems.push(`${path}.props.${key}: no existe en ${definition.type} (usa: ${Object.keys(definition.fields).join(', ')})`)
      else if (value !== null && value !== undefined) checkProp(field, value, `${path}.props.${key}`, problems)
    }
    const block = { id: blockId, type: definition.type, props: { ...definition.defaultProps, ...(typeof props === 'object' && !Array.isArray(props) ? Object.fromEntries(Object.entries(props).filter(([, value]) => value !== null && value !== undefined)) : {}) } }
    blocks[blockId] = block
    const children = section.children ?? {}
    if (Object.keys(children).length && !definition.slots.length) problems.push(`${path}.children: ${definition.type} no admite bloques hijos`)
    else if (definition.slots.length) {
      block.children = Object.fromEntries(definition.slots.map(slot => [slot, []]))
      for (const [slot, list] of Object.entries(children)) {
        if (!definition.slots.includes(slot)) { problems.push(`${path}.children.${slot}: slot inválido (usa: ${definition.slots.join(', ')})`); continue }
        if (!Array.isArray(list)) { problems.push(`${path}.children.${slot}: se espera una lista`); continue }
        list.forEach((child, index) => { const childId = visit(child, `${path}.children.${slot}[${index}]`, depth + 1); if (childId) block.children[slot].push(childId) })
      }
    }
    return blockId
  }
  if (!Array.isArray(sections) || !sections.length) problems.push('sections: se requiere al menos una sección')
  const rootIds = (Array.isArray(sections) ? sections : []).map((section, index) => visit(section, `sections[${index}]`, 1)).filter(Boolean)
  if (problems.length) throw new PageDocumentError(problems)
  return { id, slug, title, visibility: 'public', regions: { main: { children: rootIds } }, blocks, schemaVersion: catalog.schemaVersion }
}

// builder document (string or object) -> sections, for reading and editing.
export function documentToSections(document) {
  let doc = document
  if (typeof doc === 'string') { try { doc = JSON.parse(doc) } catch { return [] } }
  if (!doc || typeof doc !== 'object') return []
  const blocks = doc.blocks ?? {}
  const roots = doc.regions?.main?.children ?? doc.rootIds ?? []
  const seen = new Set()
  function visit(id) {
    const block = blocks[id]
    if (!block || seen.has(id)) return null
    seen.add(id)
    const section = { type: block.type, props: block.props ?? {} }
    const slots = Object.entries(block.children ?? {}).filter(([, list]) => Array.isArray(list) && list.length)
    if (slots.length) section.children = Object.fromEntries(slots.map(([slot, list]) => [slot, list.map(visit).filter(Boolean)]))
    return section
  }
  return roots.map(visit).filter(Boolean)
}
