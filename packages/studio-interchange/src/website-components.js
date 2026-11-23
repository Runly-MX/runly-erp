// Synced components for Website documents (spec 2026-11-23-website-synced-components-design.md, stage 2B-1).
// Pure and safe on hostile input: nothing here throws, evaluates or touches the network. A component is a portable
// section tree defined once per site; pages reference it with a `ComponentRefBlock` and publish the expanded tree.
export const COMPONENT_REF_TYPE = 'ComponentRefBlock'
export const COMPONENT_LIMITS = Object.freeze({ components: 50, overridePaths: 50, overrideProps: 10, valueLength: 2000, blocks: 300, depth: 6 })
// Overrides may change content, never structure: only these field types can be overridden.
export const OVERRIDABLE_FIELD_TYPES = Object.freeze(['text', 'textarea', 'link', 'image'])

const ID = /^[a-z][a-z0-9-]{0,39}$/
const PROP = /^[A-Za-z][A-Za-z0-9]{0,40}$/
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const error = (code, message, path) => ({ code, message, ...(path ? { path } : {}) })

// Predicate for `resolveComponents`: overridable only when the catalog says the prop is a content field.
export const overridableFromCatalog = (catalog) => {
  const blocks = new Map((catalog?.blocks ?? []).map((block) => [block.type, block]))
  return (type, prop) => OVERRIDABLE_FIELD_TYPES.includes(blocks.get(type)?.fields?.[prop]?.type)
}

function walk(section, visit, depth = 1) {
  if (!isObject(section) || depth > COMPONENT_LIMITS.depth + 1) return false
  if (!visit(section, depth)) return false
  for (const list of isObject(section.children) ? Object.values(section.children) : []) {
    if (!Array.isArray(list)) return false
    for (const child of list) if (!walk(child, visit, depth + 1)) return false
  }
  return true
}

/** Structural check of the site-level `components` map. Returns a list of errors (empty = valid). */
export function validateComponentDefinitions(components) {
  if (components === undefined) return []
  if (!isObject(components)) return [error('component_invalid', 'components debe ser un objeto.')]
  const errors = [], ids = Object.keys(components)
  if (ids.length > COMPONENT_LIMITS.components) errors.push(error('component_limit', `Máximo ${COMPONENT_LIMITS.components} componentes.`))
  for (const id of ids) {
    const at = `components.${id.slice(0, 40)}`, def = components[id]
    if (!ID.test(id)) { errors.push(error('component_id_invalid', 'Identificador de componente no válido.', at)); continue }
    if (!isObject(def) || typeof def.name !== 'string' || !def.name.trim() || def.name.length > 80 || Object.keys(def).some((key) => !['name', 'section'].includes(key))) { errors.push(error('component_invalid', 'Un componente necesita name (1-80) y section.', at)); continue }
    let count = 0, nested = false
    const ok = walk(def.section, (node) => { count += 1; if (typeof node.type !== 'string') return false; if (node.type === COMPONENT_REF_TYPE) nested = true; return count <= COMPONENT_LIMITS.blocks })
    if (!ok) errors.push(error('component_invalid', `La sección del componente no es válida o supera ${COMPONENT_LIMITS.blocks} bloques/${COMPONENT_LIMITS.depth} niveles.`, at))
    else if (nested) errors.push(error('component_ref_nested', 'Un componente no puede contener otros componentes.', at))
  }
  return errors
}

function locate(root, path) {
  if (typeof path !== 'string') return null
  const parts = path.split('/')
  if (parts[0] !== 'root' || parts.length % 2 === 0) return null
  let node = root
  for (let i = 1; i < parts.length; i += 2) {
    const slot = parts[i], index = Number(parts[i + 1])
    if (!isObject(node.children) || !Object.hasOwn(node.children, slot) || !Array.isArray(node.children[slot]) || !Number.isInteger(index) || String(index) !== parts[i + 1]) return null
    node = node.children[slot][index]
    if (!isObject(node)) return null
  }
  return node
}

function applyOverrides(root, overrides, overridable, at, errors) {
  if (overrides === undefined) return
  if (!isObject(overrides) || Object.keys(overrides).length > COMPONENT_LIMITS.overridePaths) { errors.push(error('component_override_invalid', 'overrides no es válido.', at)); return }
  for (const [path, props] of Object.entries(overrides)) {
    const node = locate(root, path), where = `${at}.overrides.${String(path).slice(0, 60)}`
    if (!node || !isObject(props) || Object.keys(props).length > COMPONENT_LIMITS.overrideProps) { errors.push(error('component_override_invalid', 'Ruta o valores de override no válidos.', where)); continue }
    for (const [prop, value] of Object.entries(props)) {
      if (!PROP.test(prop) || typeof value !== 'string' || value.length > COMPONENT_LIMITS.valueLength || !overridable(node.type, prop)) { errors.push(error('component_override_invalid', `No se puede sobrescribir "${String(prop).slice(0, 40)}".`, `${where}.${String(prop).slice(0, 40)}`)); continue }
      node.props = { ...(isObject(node.props) ? node.props : {}), [prop]: value }
    }
  }
}

const sizeOf = (section) => { let n = 0; walk(section, () => { n += 1; return true }); return n }

/**
 * Expands every ComponentRefBlock of a page's portable sections.
 * Returns { sections, errors }: a reference that cannot be resolved is dropped (and reported), never half-expanded.
 * `overridable(type, prop)` decides which props a page may override; without it nothing can be overridden.
 */
export function resolveComponents(sections, components = {}, { overridable = () => false, maxBlocks = COMPONENT_LIMITS.blocks } = {}) {
  const errors = []
  if (!Array.isArray(sections)) return { sections: [], errors: [error('component_invalid', 'sections debe ser una lista.')] }
  const defs = isObject(components) ? components : {}
  let total = 0, limited = false
  function expand(list, path) {
    const out = []
    for (const [index, node] of list.entries()) {
      const at = `${path}[${index}]`
      if (!isObject(node)) { out.push(node); continue }
      if (node.type === COMPONENT_REF_TYPE) {
        const props = isObject(node.props) ? node.props : {}, id = props.componentId
        if (typeof id !== 'string' || !ID.test(id)) { errors.push(error('component_id_invalid', 'Identificador de componente no válido.', at)); continue }
        if (!Object.hasOwn(defs, id) || !isObject(defs[id]) || validateComponentDefinitions({ [id]: defs[id] }).length) { errors.push(error('component_missing', `El componente "${id}" no existe o no es válido.`, at)); continue }
        const clone = structuredClone(defs[id].section), cost = sizeOf(clone)
        if (total + cost > maxBlocks) { if (!limited) errors.push(error('component_limit', `La página supera ${maxBlocks} bloques al expandir componentes.`, at)); limited = true; continue }
        applyOverrides(clone, props.overrides, overridable, at, errors)
        total += cost
        out.push(clone)
        continue
      }
      total += 1
      const copy = { ...node }
      if (isObject(node.children)) copy.children = Object.fromEntries(Object.entries(node.children).map(([slot, nodes]) => [slot, Array.isArray(nodes) ? expand(nodes, `${at}.children.${slot}`) : nodes]))
      out.push(copy)
    }
    return out
  }
  return { sections: expand(structuredClone(sections), 'sections'), errors }
}

/**
 * Same expansion for an Atlas Page (`regions` + flat `blocks` map), used by hosts that store pages in that shape
 * (ERP drafts and releases). Mirrors the renderer resolver in Atlas; returns `{ page, errors }`, never mutates
 * the input, and returns the same object when the page has no reference.
 */
export function resolvePageComponents(page, components = {}, { overridable = () => false, maxBlocks = COMPONENT_LIMITS.blocks } = {}) {
  const errors = []
  if (!isObject(page) || !isObject(page.blocks) || !isObject(page.regions)) return { page, errors }
  if (!Object.values(page.blocks).some((block) => block?.type === COMPONENT_REF_TYPE)) return { page, errors }
  const defs = isObject(components) ? components : {}
  const blocks = {}
  let total = 0, limited = false, serial = 0
  function instantiate(section, prefix) {
    const id = `${prefix}~${++serial}`, children = {}
    for (const [slot, list] of Object.entries(isObject(section.children) ? section.children : {})) children[slot] = list.map((child) => instantiate(child, prefix))
    blocks[id] = { id, type: section.type, props: isObject(section.props) ? section.props : {}, ...(Object.keys(children).length ? { children } : {}) }
    return id
  }
  function expandIds(ids, path) {
    const out = []
    for (const [index, id] of (Array.isArray(ids) ? ids : []).entries()) {
      const block = page.blocks[id], at = `${path}[${index}]`
      if (!isObject(block)) { out.push(id); continue }
      if (block.type === COMPONENT_REF_TYPE) {
        const props = isObject(block.props) ? block.props : {}, componentId = props.componentId
        if (typeof componentId !== 'string' || !ID.test(componentId)) { errors.push(error('component_id_invalid', 'Identificador de componente no válido.', at)); continue }
        if (!Object.hasOwn(defs, componentId) || !isObject(defs[componentId]) || validateComponentDefinitions({ [componentId]: defs[componentId] }).length) { errors.push(error('component_missing', `El componente "${componentId}" no existe o no es válido.`, at)); continue }
        const clone = structuredClone(defs[componentId].section), cost = sizeOf(clone)
        if (total + cost > maxBlocks) { if (!limited) errors.push(error('component_limit', `La página supera ${maxBlocks} bloques al expandir componentes.`, at)); limited = true; continue }
        applyOverrides(clone, props.overrides, overridable, at, errors)
        total += cost
        out.push(instantiate(clone, id))
        continue
      }
      total += 1
      const copy = { ...block }
      if (isObject(block.children)) copy.children = Object.fromEntries(Object.entries(block.children).map(([slot, list]) => [slot, expandIds(list, `${at}.children.${slot}`)]))
      blocks[id] = copy
      out.push(id)
    }
    return out
  }
  const regions = Object.fromEntries(Object.entries(page.regions).map(([name, region]) => [name, { ...region, children: expandIds(region?.children, `regions.${name}`) }]))
  return { page: { ...page, regions, blocks }, errors }
}

/** Which pages reference each component (for "in use" checks before a definition is removed). */
export function componentUsage(pages) {
  const usage = {}
  for (const { id, page } of pages) for (const block of Object.values(isObject(page?.blocks) ? page.blocks : {})) {
    const componentId = block?.type === COMPONENT_REF_TYPE ? block.props?.componentId : null
    if (typeof componentId === 'string') (usage[componentId] ??= new Set()).add(id)
  }
  return Object.fromEntries(Object.entries(usage).map(([componentId, ids]) => [componentId, [...ids]]))
}

/** Catalog check of component definitions (block types and prop names). */
export function componentCatalogErrors(components, catalog) {
  if (!isObject(components)) return []
  const blocks = new Map((catalog?.blocks ?? []).map((block) => [block.type, block])), errors = []
  const check = (section, path, depth = 0) => {
    if (!isObject(section) || depth > COMPONENT_LIMITS.depth + 1) return
    const definition = blocks.get(section.type)
    if (!definition) { errors.push(error('block_unknown', `Bloque no permitido "${String(section.type).slice(0, 60)}".`, `${path}.type`)); return }
    for (const name of Object.keys(isObject(section.props) ? section.props : {})) if (!Object.hasOwn(definition.fields ?? {}, name)) errors.push(error('prop_unknown', `La propiedad "${name.slice(0, 40)}" no existe en ${definition.type}.`, `${path}.props.${name.slice(0, 40)}`))
    for (const [slot, list] of Object.entries(isObject(section.children) ? section.children : {})) if (Array.isArray(list)) list.forEach((child, index) => check(child, `${path}.children.${slot}[${index}]`, depth + 1))
  }
  for (const [id, definition] of Object.entries(components)) check(definition?.section, `components.${id.slice(0, 40)}.section`)
  return errors
}
