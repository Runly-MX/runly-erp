// Builder ModuleDefinition v1 -> runly.declarative/v1 converter (experimental,
// F1B Stage 3). Pure data transformation: it reads the stored JSON definition
// and never imports or runs module code. Every element is reported as
// preserved, transformed (meaning kept, representation changed), review
// (cannot be represented safely or changes meaning: not converted) or
// unsupported. Nothing is dropped without a report entry.
import { normalizeModuleDefinition } from '@runly/module-compiler'
import { loadDeclarativeModule, DECLARATIVE_SCHEMA, RELATION_TARGETS } from './declarative/schema.js'

export const CLASSIFICATIONS = ['FULLY_DECLARATIVE', 'DECLARATIVE_WITH_REVIEW', 'HYBRID_REQUIRED', 'LEGACY_TRUSTED', 'QUARANTINED', 'UNSUPPORTED']

const SAME = { text: 'text', textarea: 'longtext', number: 'number', boolean: 'boolean', date: 'date', datetime: 'datetime', email: 'email', phone: 'phone' }
// Builder external relation keys (module-compiler external-relations.js) the declarative runtime can resolve.
const EXTERNAL = { contact: 'runly.contacts:contact' }
const TRANSFORMED = {
  markdown: ['longtext', 'Markdown se muestra como texto largo: el formato no se renderiza.'],
  richtext: ['longtext', 'El texto enriquecido se muestra como texto largo: el formato no se renderiza.'],
  decimal: ['number', 'Decimal pasa a número: revisa la precisión requerida.'],
  select: ['enum', null],
}
const NOT_REPRESENTABLE = { multiselect: 'Selección múltiple no existe en declarative/v1.', file: 'Los archivos por campo siguen con sus rutas de archivos existentes.', json: 'Un campo JSON libre no se puede validar de forma declarativa.', color: 'El campo de color no tiene validación declarativa todavía.' }

// definition: the Builder project's stored JSON (project.definition).
export function convertModuleDefinition(raw) {
  const report = []
  const add = (path, kind, detail) => report.push({ path, kind, detail })
  let def
  try { def = normalizeModuleDefinition(raw) } catch (error) { return { classification: 'UNSUPPORTED', declarative: null, report: [{ path: '', kind: 'unsupported', detail: `Definición ilegible: ${error.message}` }] } }
  const slug = def.key.slice('custom.'.length)
  add('key', 'preserved', def.key)
  const declarative = { schema: DECLARATIVE_SCHEMA, key: def.key, name: def.name, version: def.version, permissions: {}, capabilities: ['records.read', 'records.write', 'relations.resolve'], entities: [] }
  const permsByEntity = new Map()
  for (const p of def.permissions ?? []) {
    if (!p.entity || !p.action) { add(`permissions.${p.key}`, 'review', 'Permiso sin entidad o acción: no se convierte.'); continue }
    if (!permsByEntity.has(p.entity)) permsByEntity.set(p.entity, {})
    permsByEntity.get(p.entity)[p.action] = p.key
    add(`permissions.${p.key}`, p.action === 'delete' ? 'review' : 'preserved', p.action === 'delete' ? 'La baja lógica no existe aún en declarative/v1; el permiso se conserva pero no hay operación que lo use.' : `${p.entity}.${p.action}`)
  }
  for (const entity of def.entities) {
    const base = `entities.${entity.key}`
    if (entity.companyScoped === false) add(base, 'unsupported', 'Entidad sin company_id: el aislamiento por empresa no se puede garantizar.')
    if (entity.softDelete === false) add(`${base}.softDelete`, 'unsupported', 'Entidad sin borrado lógico (enabled): no se convierte.')
    const fields = []
    for (const f of entity.fields) {
      const path = `${base}.fields.${f.key}`
      const out = { key: f.key, label: f.label ?? f.key }
      if (f.required) out.required = true
      if (SAME[f.type]) out.type = SAME[f.type]
      else if (TRANSFORMED[f.type]) { out.type = TRANSFORMED[f.type][0]; if (TRANSFORMED[f.type][1]) add(path, 'transformed', TRANSFORMED[f.type][1]) }
      else if (f.type === 'relation') {
        out.type = 'relation'
        if (f.targetEntity) out.target = `entity:${f.targetEntity}`
        else if (f.targetExternal && Object.hasOwn(RELATION_TARGETS, EXTERNAL[f.targetExternal] ?? f.targetExternal)) out.target = EXTERNAL[f.targetExternal] ?? f.targetExternal
        else { add(path, 'review', `Relación a ${f.targetExternal ?? f.targetModel ?? 'destino desconocido'} no está en la lista permitida; el dato se conserva en la tabla y no se edita desde el runtime declarativo.${f.required ? ' Es obligatoria: no se podrán crear registros desde el runtime declarativo.' : ''}`); continue }
      } else { add(path, 'review', `${NOT_REPRESENTABLE[f.type] ?? `Tipo ${f.type} no soportado.`}${f.required ? ' Es obligatorio: no se podrán crear registros desde el runtime declarativo.' : ''}`); continue }
      if (out.type === 'enum') {
        if (!f.options?.length) { add(path, 'review', 'Selección sin opciones.'); continue }
        const bad = f.options.filter((o) => !/^[A-Za-z0-9_][A-Za-z0-9_-]{0,63}$/.test(String(o.value)))
        if (bad.length) { add(path, 'review', `Valores de opción no representables: ${bad.map((o) => o.value).join(', ').slice(0, 120)}`); continue }
        out.options = f.options.map((o) => ({ value: String(o.value), label: String(o.label ?? o.value) }))
      }
      if (f.default !== undefined) out.default = f.default
      if (f.type !== 'select' && !TRANSFORMED[f.type]) add(path, 'preserved', out.type)
      else if (f.type === 'select') add(path, 'preserved', 'enum')
      fields.push(out)
    }
    if (!fields.length) { add(base, 'unsupported', 'Ningún campo representable.'); continue }
    const perms = permsByEntity.get(entity.key) ?? {}
    const columns = (entity.list?.columns ?? fields.map((f) => f.key)).filter((k) => fields.some((f) => f.key === k)).slice(0, 12)
    if (entity.layout) add(`${base}.layout`, 'review', 'El diseño de formulario por secciones del Builder se aproxima a una sola sección; revisa el orden.')
    declarative.entities.push({ key: entity.key, label: entity.label, pluralLabel: entity.pluralLabel, table: `${slug}_${entity.key}`, permissions: perms, fields,
      views: { list: { columns: columns.length ? columns : [fields[0].key] }, form: { sections: [{ title: entity.label, fields: fields.filter((f) => !f.readOnly).map((f) => f.key) }] }, detail: { fields: fields.map((f) => f.key) } } })
    add(`${base}.table`, 'preserved', `${slug}_${entity.key} (los datos se leen y escriben en su tabla actual)`)
  }
  for (const view of def.views ?? []) if (!view.generated) add(`views.${view.key}`, 'review', `Vista ${view.kind} personalizada: no se convierte todavía.`)
  declarative.navigation = (def.navigation ?? []).flatMap((n) => {
    const entityKey = def.entities.find((e) => n.page === `${slug}.${e.key}.page` || n.permission === permsByEntity.get(e.key)?.read)?.key
    if (!entityKey || !declarative.entities.some((e) => e.key === entityKey)) { add(`navigation.${n.label}`, 'review', 'Entrada de navegación sin entidad convertida.'); return [] }
    add(`navigation.${n.label}`, 'preserved', entityKey)
    return [{ label: n.label, entity: entityKey, permission: n.permission }]
  })
  for (const a of def.automations ?? []) add(`automations.${a.key ?? a.id ?? a.name}`, 'review', 'Automatización del Builder: no se convierte automáticamente (disparadores y pasos distintos); sigue en el runtime actual.')
  for (const k of ['publicLinks', 'connections', 'documentKinds', 'homeWidgets']) for (const item of def[k] ?? []) add(`${k}.${item.key ?? item.id ?? ''}`, 'review', `${k} no tiene equivalente declarativo todavía.`)
  const hybrid = Boolean(def.extensions?.files?.length || def.extensions?.views?.length)
  if (hybrid) add('extensions', 'review', 'Pantallas o vistas con código: requieren el runtime aislado (frame/backend).')
  add('companySettings', 'preserved', 'company_module y permisos por empresa no cambian: se identifican por la clave del módulo.')
  if (report.some((r) => r.kind === 'unsupported') || !declarative.entities.length) return { classification: 'UNSUPPORTED', declarative: null, report }
  let loaded
  try { loaded = loadDeclarativeModule(declarative) } catch (error) { return { classification: 'UNSUPPORTED', declarative: null, report: [...report, ...(error.issues ?? [{ path: '', message: error.message }]).map((i) => ({ path: i.path, kind: 'unsupported', detail: i.message }))] } }
  const classification = hybrid ? 'HYBRID_REQUIRED' : report.some((r) => r.kind === 'review' || r.kind === 'transformed') ? 'DECLARATIVE_WITH_REVIEW' : 'FULLY_DECLARATIVE'
  return { classification, declarative: loaded, report }
}

// Modules without a Builder definition: only their trust state can classify them.
export function classifyWithoutDefinition({ trustState }) {
  return trustState === 'trusted' ? 'LEGACY_TRUSTED' : 'QUARANTINED'
}
