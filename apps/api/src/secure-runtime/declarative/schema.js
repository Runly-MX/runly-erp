// Declarative module definition v1 (experimental). Pure data, validated with
// strict schemas: unknown keys are rejected, nothing in it is ever executed as
// code. Expressions are JSON trees checked by expressions.js.
import { z } from 'zod'
import { checkExpression } from './expressions.js'

export const DECLARATIVE_SCHEMA = 'runly.declarative/v1'
const ident = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/)
const text = (max = 120) => z.string().trim().min(1).max(max)
const expr = z.record(z.string(), z.unknown())
export const CAPABILITIES = ['records.read', 'records.write', 'relations.resolve', 'files.describe', 'files.attach', 'notifications.publish', 'events.emit']
export const RELATION_TARGETS = { 'runly.contacts:contact': { label: 'Contacto' } }

const field = z.strictObject({
  key: ident,
  type: z.enum(['text', 'longtext', 'number', 'date', 'boolean', 'enum', 'relation', 'user']),
  label: text(),
  required: z.boolean().optional(),
  // Text length or numeric upper bound; payloads stay capped at 16 KB by the gateway.
  max: z.number().finite().positive().max(1e12).optional(),
  min: z.number().finite().optional(),
  options: z.array(z.strictObject({ value: ident, label: text() })).max(50).optional(),
  target: z.enum(Object.keys(RELATION_TARGETS)).optional(),
  readOnly: z.boolean().optional(),
})

const automationStep = z.union([
  z.strictObject({ set: z.strictObject({ field: ident, value: expr }) }),
  z.strictObject({ notify: z.strictObject({ toField: ident, title: text(140), body: text(500).optional() }) }),
  z.strictObject({ emit: z.string().regex(/^[a-z][a-z0-9_.]{2,80}$/) }),
])

const entity = z.strictObject({
  key: ident,
  label: text(),
  pluralLabel: text(),
  fields: z.array(field).min(1).max(60),
  validations: z.array(z.strictObject({ rule: expr, message: text(200) })).max(20).optional(),
  states: z.strictObject({
    field: ident,
    initial: ident,
    values: z.array(z.strictObject({ value: ident, label: text() })).min(2).max(12),
    transitions: z.array(z.strictObject({ action: ident, label: text(), from: z.array(ident).min(1), to: ident, permission: ident, when: expr.optional() })).max(20),
  }).optional(),
  automations: z.array(z.strictObject({ key: ident, on: z.string().regex(/^transition:[a-z][a-z0-9_]*$/), steps: z.array(automationStep).min(1).max(5) })).max(10).optional(),
  views: z.strictObject({
    list: z.strictObject({ columns: z.array(ident).min(1).max(12) }),
    form: z.strictObject({ sections: z.array(z.strictObject({ title: text(), fields: z.array(ident).min(1) })).min(1).max(8) }),
    detail: z.strictObject({ fields: z.array(ident).min(1) }),
  }),
})

export const declarativeModuleSchema = z.strictObject({
  schema: z.literal(DECLARATIVE_SCHEMA),
  key: z.string().regex(/^custom\.[a-z][a-z0-9_]{1,40}$/),
  name: text(),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  permissions: z.record(ident, z.string().regex(/^[a-z][a-z0-9_.]{2,80}$/)),
  capabilities: z.array(z.enum(CAPABILITIES)).max(CAPABILITIES.length),
  events: z.strictObject({ emits: z.array(z.string().regex(/^[a-z][a-z0-9_.]{2,80}$/)).max(20) }).optional(),
  entities: z.array(entity).min(1).max(10),
  extensions: z.strictObject({
    backend: z.array(z.strictObject({ key: ident, handler: z.string().regex(/^backend\/[a-z0-9_-]+\.mjs$/), capabilities: z.array(z.enum(CAPABILITIES)), timeoutMs: z.number().int().min(100).max(10_000) })).max(5).optional(),
    frontend: z.array(z.strictObject({ key: ident, entry: z.string().regex(/^frontend\/[a-z0-9_-]+\.js$/), capabilities: z.array(z.enum(CAPABILITIES)) })).max(5).optional(),
  }).optional(),
})

export class DefinitionError extends Error {
  constructor(issues) { super('Definición declarativa inválida.'); this.name = 'DefinitionError'; this.code = 'DECLARATIVE_DEFINITION_INVALID'; this.issues = issues }
}

// Full load-time validation: schema, then cross references and expressions.
export function loadDeclarativeModule(raw) {
  const parsed = declarativeModuleSchema.safeParse(raw)
  if (!parsed.success) throw new DefinitionError(parsed.error.issues.slice(0, 20).map((i) => ({ path: i.path.join('.'), message: i.message })))
  const def = parsed.data
  const issues = []
  const declaredCaps = new Set(def.capabilities)
  for (const ext of [...(def.extensions?.backend ?? []), ...(def.extensions?.frontend ?? [])]) {
    for (const cap of ext.capabilities) if (!declaredCaps.has(cap)) issues.push({ path: `extensions.${ext.key}`, message: `Capacidad no declarada por el módulo: ${cap}` })
  }
  for (const ent of def.entities) {
    const fields = new Map(ent.fields.map((f) => [f.key, f]))
    if (fields.size !== ent.fields.length) issues.push({ path: `entities.${ent.key}.fields`, message: 'Campos duplicados.' })
    const ref = (key, path) => { if (!fields.has(key)) issues.push({ path, message: `Campo inexistente: ${key}` }) }
    for (const f of ent.fields) {
      if (f.type === 'enum' && !f.options?.length) issues.push({ path: `entities.${ent.key}.${f.key}`, message: 'Un enum necesita opciones.' })
      if (f.type === 'relation' && !f.target) issues.push({ path: `entities.${ent.key}.${f.key}`, message: 'Una relación necesita destino.' })
    }
    ent.views.list.columns.forEach((k) => ref(k, `entities.${ent.key}.views.list`))
    ent.views.form.sections.forEach((s) => s.fields.forEach((k) => ref(k, `entities.${ent.key}.views.form`)))
    ent.views.detail.fields.forEach((k) => ref(k, `entities.${ent.key}.views.detail`))
    const keySet = new Set(fields.keys())
    const check = (node, path) => { try { checkExpression(node, { fields: keySet }) } catch (error) { issues.push({ path, message: error.message }) } }
    ent.validations?.forEach((v, i) => check(v.rule, `entities.${ent.key}.validations.${i}`))
    if (ent.states) {
      const values = new Set(ent.states.values.map((v) => v.value))
      ref(ent.states.field, `entities.${ent.key}.states.field`)
      if (!values.has(ent.states.initial)) issues.push({ path: `entities.${ent.key}.states.initial`, message: 'Estado inicial inexistente.' })
      for (const t of ent.states.transitions) {
        if (!values.has(t.to) || t.from.some((s) => !values.has(s))) issues.push({ path: `entities.${ent.key}.states.${t.action}`, message: 'Transición con estados inexistentes.' })
        if (!Object.hasOwn(def.permissions, t.permission)) issues.push({ path: `entities.${ent.key}.states.${t.action}`, message: `Permiso no declarado: ${t.permission}` })
        if (t.when) check(t.when, `entities.${ent.key}.states.${t.action}.when`)
      }
    }
    for (const a of ent.automations ?? []) {
      const action = a.on.slice('transition:'.length)
      if (!ent.states?.transitions.some((t) => t.action === action)) issues.push({ path: `entities.${ent.key}.automations.${a.key}`, message: `Transición inexistente: ${action}` })
      for (const step of a.steps) {
        if (step.set) { ref(step.set.field, `entities.${ent.key}.automations.${a.key}`); check(step.set.value, `entities.${ent.key}.automations.${a.key}.set`) }
        if (step.notify && fields.get(step.notify.toField)?.type !== 'user') issues.push({ path: `entities.${ent.key}.automations.${a.key}`, message: 'notify.toField debe ser un campo de tipo user.' })
        if (step.emit && !def.events?.emits.includes(step.emit)) issues.push({ path: `entities.${ent.key}.automations.${a.key}`, message: `Evento no declarado: ${step.emit}` })
      }
    }
  }
  for (const action of ['read', 'create', 'update']) if (!Object.hasOwn(def.permissions, action)) issues.push({ path: 'permissions', message: `Falta el permiso ${action}.` })
  if (issues.length) throw new DefinitionError(issues)
  return Object.freeze(def)
}
