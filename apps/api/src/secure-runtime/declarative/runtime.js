// Declarative runtime: pure functions over a loaded definition (schema.js).
// Validates record input, applies state transitions and returns automation
// effects for the gateway to perform. No I/O, no user code.
import { evaluateExpression } from './expressions.js'

export class RecordError extends Error {
  constructor(code, message, details = null) { super(message); this.name = 'RecordError'; this.code = code; this.status = code === 'FORBIDDEN' ? 403 : 422; this.details = details }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE = /^\d{4}-\d{2}-\d{2}$/

export function entityOf(def, key) {
  const entity = def.entities.find((e) => e.key === key)
  if (!entity) throw new RecordError('ENTITY_UNKNOWN', 'Entidad desconocida.')
  return entity
}

function coerce(field, value) {
  if (value === null || value === undefined || value === '') return null
  switch (field.type) {
    case 'text': case 'longtext': {
      if (typeof value !== 'string') throw new RecordError('FIELD_INVALID', `${field.label}: se esperaba texto.`)
      const max = field.max ?? (field.type === 'text' ? 200 : 5000)
      if (value.length > max) throw new RecordError('FIELD_INVALID', `${field.label}: máximo ${max} caracteres.`)
      return value
    }
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value)) throw new RecordError('FIELD_INVALID', `${field.label}: se esperaba un número.`)
      if (field.min !== undefined && value < field.min) throw new RecordError('FIELD_INVALID', `${field.label}: mínimo ${field.min}.`)
      if (field.max !== undefined && value > field.max) throw new RecordError('FIELD_INVALID', `${field.label}: máximo ${field.max}.`)
      return value
    }
    case 'date': if (typeof value !== 'string' || !DATE.test(value)) throw new RecordError('FIELD_INVALID', `${field.label}: fecha AAAA-MM-DD.`); return value
    case 'boolean': if (typeof value !== 'boolean') throw new RecordError('FIELD_INVALID', `${field.label}: se esperaba sí/no.`); return value
    case 'enum': if (!field.options.some((o) => o.value === value)) throw new RecordError('FIELD_INVALID', `${field.label}: opción no válida.`); return value
    case 'relation': case 'user': if (typeof value !== 'string' || !UUID.test(value)) throw new RecordError('FIELD_INVALID', `${field.label}: referencia no válida.`); return value.toLowerCase()
    default: throw new RecordError('FIELD_INVALID', 'Tipo no soportado.')
  }
}

// mode: 'create' | 'update'. Returns the complete next data object.
export function prepareRecord(entity, input, { mode, current = {} }) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new RecordError('INPUT_INVALID', 'Datos inválidos.')
  const fields = new Map(entity.fields.map((f) => [f.key, f]))
  const stateField = entity.states?.field
  const next = mode === 'create' ? {} : { ...current }
  for (const [key, value] of Object.entries(input)) {
    const field = fields.get(key)
    if (!field) throw new RecordError('FIELD_UNKNOWN', `Campo desconocido: ${String(key).slice(0, 40)}`)
    if (key === stateField) throw new RecordError('STATE_READ_ONLY', 'El estado solo cambia mediante una acción.')
    if (field.readOnly) throw new RecordError('FIELD_READ_ONLY', `${field.label} no se puede editar.`)
    next[key] = coerce(field, value)
  }
  if (mode === 'create' && stateField) next[stateField] = entity.states.initial
  for (const field of entity.fields) if (field.required && (next[field.key] === null || next[field.key] === undefined)) throw new RecordError('FIELD_REQUIRED', `${field.label} es obligatorio.`)
  for (const rule of entity.validations ?? []) if (evaluateExpression(rule.rule, next) !== true) throw new RecordError('VALIDATION_FAILED', rule.message)
  return next
}

// Returns { data, effects } where effects are { notify | emit } to perform.
export function applyTransition(def, entity, record, action, { grantedPermissions }) {
  const transition = entity.states?.transitions.find((t) => t.action === action)
  if (!transition) throw new RecordError('ACTION_UNKNOWN', 'Acción desconocida.')
  const permissionKey = def.permissions[transition.permission]
  if (!grantedPermissions.has(permissionKey)) throw new RecordError('FORBIDDEN', 'No tienes permiso para esta acción.')
  const state = record[entity.states.field]
  if (!transition.from.includes(state)) throw new RecordError('TRANSITION_NOT_ALLOWED', `No se puede ${transition.label.toLowerCase()} desde este estado.`)
  if (transition.when && evaluateExpression(transition.when, record) !== true) throw new RecordError('TRANSITION_CONDITION', 'No se cumplen las condiciones de la acción.')
  const data = { ...record, [entity.states.field]: transition.to }
  const effects = []
  for (const automation of entity.automations ?? []) {
    if (automation.on !== `transition:${action}`) continue
    for (const step of automation.steps) {
      if (step.set) data[step.set.field] = coerce(entity.fields.find((f) => f.key === step.set.field), evaluateExpression(step.set.value, data))
      if (step.notify) effects.push({ notify: { to: data[step.notify.toField], title: step.notify.title, body: step.notify.body ?? null } })
      if (step.emit) effects.push({ emit: step.emit })
    }
  }
  return { data, effects, transition }
}

// Native rendering: the same blueprint shapes RunlyTable / RunlyForm /
// RunlyDetail already render (docs/08_blueprints.md), so declarative screens
// use Runly UI directly, without an iframe.
export function toBlueprints(def, entity) {
  const fields = new Map(entity.fields.map((f) => [f.key, f]))
  const uiType = (f) => ({ text: 'text', longtext: 'textarea', number: 'number', date: 'date', boolean: 'boolean', enum: 'select', relation: 'relation', user: 'user' })[f.type]
  const fieldSpec = (key) => {
    const f = fields.get(key)
    return { key, label: f.label, type: uiType(f), required: Boolean(f.required), readOnly: Boolean(f.readOnly) || key === entity.states?.field, ...(f.options ? { options: f.options } : {}), ...(f.target ? { relation: { target: f.target } } : {}) }
  }
  return {
    table: { kind: 'TABLE', key: `${def.key}.${entity.key}.list`, entity: entity.key, columns: entity.views.list.columns.map(fieldSpec) },
    form: { kind: 'FORM', key: `${def.key}.${entity.key}.form`, entity: entity.key, sections: entity.views.form.sections.map((s) => ({ title: s.title, fields: s.fields.map(fieldSpec) })) },
    detail: { kind: 'ENTITY', key: `${def.key}.${entity.key}.detail`, entity: entity.key, fields: entity.views.detail.fields.map(fieldSpec),
      actions: (entity.states?.transitions ?? []).map((t) => ({ key: t.action, label: t.label, from: t.from, permission: def.permissions[t.permission] })) },
  }
}
