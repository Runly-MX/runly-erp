// Manifest `consumes` and `events` (spec 2026-10-03-rme3-module-platform-v2 §15.3):
//
//   consumes: { 'runly.inventory': ['items.read', 'items.search'] }
//   events: { subscribes: ['inventory.item.updated'] }
//
// Shape only: which services exist and which events are published is owned
// by the API (module-services/service-catalog.js, domain-events/events.js).

const MODULE_KEY_RE = /^[a-z][a-z0-9]*\.[a-z][a-z0-9_]*$/
const SERVICE_RE = /^[a-z][a-zA-Z]*\.[a-z][a-zA-Z]*$/
const EVENT_RE = /^[a-z]+\.[a-z_]+\.[a-z_]+$/
const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const SCHEDULE_EVERY = ['hour', 'day', 'week', 'month']
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

// manifest.schedules (Builder schedule automations): [{ key, every, at?, weekday?, day? }]
function validateSchedules(manifest, errors) {
  if (manifest?.schedules === undefined) return
  if (!Array.isArray(manifest.schedules)) { errors.push('schedules must be an array'); return }
  for (const item of manifest.schedules) {
    if (!isPlainObject(item) || !/^[a-z][a-z0-9_]{1,40}$/.test(String(item.key ?? ''))) { errors.push('schedules: every item needs a snake_case key'); continue }
    if (!SCHEDULE_EVERY.includes(item.every)) errors.push(`schedules.${item.key}: every must be one of ${SCHEDULE_EVERY.join(', ')}`)
    if (item.every !== 'hour' && !TIME_RE.test(String(item.at ?? ''))) errors.push(`schedules.${item.key}: at must look like "08:00"`)
    if (item.every === 'week' && !(Number.isInteger(item.weekday) && item.weekday >= 0 && item.weekday <= 6)) errors.push(`schedules.${item.key}: weekday must be 0-6`)
    if (item.every === 'month' && !(Number.isInteger(item.day) && item.day >= 1 && item.day <= 28)) errors.push(`schedules.${item.key}: day must be 1-28`)
  }
}

export const DOCUMENT_KIND_FIELD_TYPES = Object.freeze(['text', 'number', 'date'])
export const DOCUMENT_KIND_FORMATS = Object.freeze(['docx', 'xlsx', 'pptx', 'pdf'])
const DOCUMENT_KIND_NAME_RE = /^[a-z][a-z0-9_]{1,40}$/
const DOCUMENT_KIND_TAG_RE = /^[a-z][a-z0-9_]{0,60}$/
export const DOCUMENT_KINDS_MAX = 10
export const HOME_WIDGETS_MAX = 5
export const HOME_WIDGET_KINDS = Object.freeze(['count', 'list'])
export const HOME_WIDGET_OPS = Object.freeze(['equals', 'not_equals', 'contains', 'gt', 'lt', 'filled'])
const HOME_WIDGET_KEY_RE = /^[a-z][a-z0-9_]{1,40}$/
const COLUMN_RE = /^[a-z][a-z0-9_]{0,62}$/
export const DOCUMENT_KIND_FIELDS_MAX = 60

// manifest.documentKinds (a module offers a document type to Runly Documents):
//   [{ name: 'invoice', label: 'Factura', model: 'invoice', permission: 'x.invoice.read',
//      formats?: ['docx','pdf'], fields: [{ tag: 'number', label: 'Número', type: 'text' }] }]
// Each `tag` is a column (field) of `model`; the API registers the kind as
// `<moduleKey>.<name>` while the module is installed and enabled.
function validateDocumentKinds(manifest, errors) {
  const list = manifest?.documentKinds
  if (list === undefined) return
  if (!Array.isArray(list)) { errors.push('documentKinds must be an array'); return }
  if (list.length > DOCUMENT_KINDS_MAX) errors.push(`documentKinds: at most ${DOCUMENT_KINDS_MAX} kinds`)
  const names = new Set()
  list.forEach((kind, index) => {
    const base = `documentKinds[${index}]`
    if (!isPlainObject(kind)) { errors.push(`${base} must be an object`); return }
    if (!DOCUMENT_KIND_NAME_RE.test(String(kind.name ?? ''))) errors.push(`${base}.name must be snake_case (2-41 chars)`)
    else if (names.has(kind.name)) errors.push(`${base}.name "${kind.name}" is duplicated`)
    names.add(kind.name)
    if (typeof kind.label !== 'string' || !kind.label.trim() || kind.label.length > 80) errors.push(`${base}.label is required (max 80 chars)`)
    if (!DOCUMENT_KIND_NAME_RE.test(String(kind.model ?? ''))) errors.push(`${base}.model must be the snake_case name of a model of this module`)
    if (typeof kind.permission !== 'string' || !kind.permission.trim()) errors.push(`${base}.permission is required`)
    if (kind.formats !== undefined && (!Array.isArray(kind.formats) || !kind.formats.length || kind.formats.some((f) => !DOCUMENT_KIND_FORMATS.includes(f)))) {
      errors.push(`${base}.formats must be a non-empty subset of ${DOCUMENT_KIND_FORMATS.join(', ')}`)
    }
    if (!Array.isArray(kind.fields) || !kind.fields.length) { errors.push(`${base}.fields must be a non-empty array`); return }
    if (kind.fields.length > DOCUMENT_KIND_FIELDS_MAX) errors.push(`${base}.fields: at most ${DOCUMENT_KIND_FIELDS_MAX} fields`)
    const tags = new Set()
    kind.fields.forEach((field, fieldIndex) => {
      const at = `${base}.fields[${fieldIndex}]`
      if (!isPlainObject(field) || !DOCUMENT_KIND_TAG_RE.test(String(field.tag ?? ''))) { errors.push(`${at}.tag must be a snake_case field name`); return }
      if (tags.has(field.tag)) errors.push(`${at}.tag "${field.tag}" is duplicated`)
      tags.add(field.tag)
      if (typeof field.label !== 'string' || !field.label.trim()) errors.push(`${at}.label is required`)
      if (!DOCUMENT_KIND_FIELD_TYPES.includes(field.type)) errors.push(`${at}.type must be one of ${DOCUMENT_KIND_FIELD_TYPES.join(', ')}`)
    })
  })
}

// manifest.homeWidgets (a module puts a count or a short list on Home):
//   [{ key, label, kind: 'count'|'list', model, permission, where?: [{ field, op, value? }],
//      titleField?, detailField?, sortField?, sortDir?, limit? }]
// Field names are columns of `model`; the API builds the query from them, so they are
// validated here as plain identifiers and again against the real table when it runs.
function validateHomeWidgets(manifest, errors) {
  const list = manifest?.homeWidgets
  if (list === undefined) return
  if (!Array.isArray(list)) { errors.push('homeWidgets must be an array'); return }
  if (list.length > HOME_WIDGETS_MAX) errors.push(`homeWidgets: at most ${HOME_WIDGETS_MAX} widgets`)
  const keys = new Set()
  list.forEach((widget, index) => {
    const base = `homeWidgets[${index}]`
    if (!isPlainObject(widget)) { errors.push(`${base} must be an object`); return }
    if (!HOME_WIDGET_KEY_RE.test(String(widget.key ?? ''))) errors.push(`${base}.key must be snake_case (2-41 chars)`)
    else if (keys.has(widget.key)) errors.push(`${base}.key "${widget.key}" is duplicated`)
    keys.add(widget.key)
    if (typeof widget.label !== 'string' || !widget.label.trim() || widget.label.length > 60) errors.push(`${base}.label is required (max 60 chars)`)
    if (!HOME_WIDGET_KINDS.includes(widget.kind)) errors.push(`${base}.kind must be one of ${HOME_WIDGET_KINDS.join(', ')}`)
    if (!HOME_WIDGET_KEY_RE.test(String(widget.model ?? ''))) errors.push(`${base}.model must be the snake_case name of a model of this module`)
    if (typeof widget.permission !== 'string' || !widget.permission.trim()) errors.push(`${base}.permission is required`)
    for (const name of ['titleField', 'detailField', 'sortField']) if (widget[name] !== undefined && !COLUMN_RE.test(String(widget[name]))) errors.push(`${base}.${name} must be a column name`)
    if (widget.kind === 'list' && !widget.titleField) errors.push(`${base}.titleField is required for a list`)
    if (widget.sortDir !== undefined && !['asc', 'desc'].includes(widget.sortDir)) errors.push(`${base}.sortDir must be asc or desc`)
    if (widget.limit !== undefined && !(Number.isInteger(widget.limit) && widget.limit >= 1 && widget.limit <= 10)) errors.push(`${base}.limit must be 1-10`)
    if (widget.where !== undefined) {
      if (!Array.isArray(widget.where) || widget.where.length > 5) { errors.push(`${base}.where must be a list of at most 5 conditions`); return }
      widget.where.forEach((condition, at) => {
        if (!isPlainObject(condition) || !COLUMN_RE.test(String(condition.field ?? '')) || !HOME_WIDGET_OPS.includes(condition.op)) errors.push(`${base}.where[${at}] needs a column field and an op (${HOME_WIDGET_OPS.join(', ')})`)
        else if (condition.op !== 'filled' && !['string', 'number', 'boolean'].includes(typeof condition.value)) errors.push(`${base}.where[${at}].value must be text, number or boolean`)
      })
    }
  })
}

export function validateIntegrations(manifest, errors) {
  validateSchedules(manifest, errors)
  validateHomeWidgets(manifest, errors)
  validateDocumentKinds(manifest, errors)
  if (manifest?.consumes !== undefined) {
    if (!isPlainObject(manifest.consumes)) errors.push('consumes must be an object { moduleKey: [service, ...] }')
    else {
      for (const [moduleKey, services] of Object.entries(manifest.consumes)) {
        if (!MODULE_KEY_RE.test(moduleKey)) errors.push(`consumes: "${moduleKey}" is not a module key`)
        if (!Array.isArray(services) || !services.length) errors.push(`consumes.${moduleKey} must be a non-empty array`)
        else for (const service of services) if (!SERVICE_RE.test(String(service))) errors.push(`consumes.${moduleKey}: "${service}" must look like "items.read"`)
      }
    }
  }
  if (manifest?.events !== undefined) {
    if (!isPlainObject(manifest.events)) errors.push('events must be an object { subscribes: [...] }')
    else if (manifest.events.subscribes !== undefined) {
      if (!Array.isArray(manifest.events.subscribes)) errors.push('events.subscribes must be an array')
      else for (const event of manifest.events.subscribes) if (!EVENT_RE.test(String(event))) errors.push(`events.subscribes: "${event}" must look like "inventory.item.updated"`)
    }
  }
}
