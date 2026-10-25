// Builder home widgets (definition.homeWidgets): a count or a short list of an
// entity's records on the Home board of everyone who can read the entity. Compiles to
// the manifest `homeWidgets` contract (packages/module-engine/src/manifest-integrations.js)
// that the API reads to answer GET /home-widgets. Spec
// docs/superpowers/specs/2026-10-26-my-work-and-widget-contributions-design.md.
//
//   homeWidgets: [{ key: 'abiertas', label: 'Órdenes abiertas', entity: 'orden', kind: 'count' | 'list',
//                   when?: { field: 'estado', op: 'not_equals', value: 'cerrada' } | [..],
//                   titleField?: 'folio', detailField?: 'cliente',
//                   sort?: { field: 'fecha', dir: 'asc' | 'desc' }, limit?: 5 }]
import { HOME_WIDGETS_MAX, HOME_WIDGET_KINDS, HOME_WIDGET_OPS } from '@runly/module-engine/browser'
import { moduleSlug, permKey } from './templates/helpers.js'

const KEY = /^[a-z][a-z0-9_]{1,40}$/
const NUMBER_TYPES = new Set(['number', 'decimal'])
const SHOWABLE_TYPES = new Set(['text', 'textarea', 'email', 'phone', 'select', 'number', 'decimal', 'date', 'datetime', 'boolean'])
const COMPARABLE_TYPES = new Set([...SHOWABLE_TYPES].filter((type) => type !== 'textarea'))

const fieldKey = (field) => field.key ?? field.name
const entityKey = (entity) => entity.key ?? entity.name
const conditionsOf = (when) => (when === undefined || when === null ? [] : Array.isArray(when) ? when : [when])
const diagnostic = (path, code, message) => ({ path, code, message, severity: 'error' })

export function validateDefinitionHomeWidgets(definition, permissionKeys, errors) {
  const list = definition.homeWidgets
  if (list === undefined || list === null) return
  if (!Array.isArray(list)) { errors.push(diagnostic('homeWidgets', 'HOME_WIDGETS_INVALID', 'homeWidgets must be an array.')); return }
  if (list.length > HOME_WIDGETS_MAX) errors.push(diagnostic('homeWidgets', 'HOME_WIDGETS_TOO_MANY', `At most ${HOME_WIDGETS_MAX} home widgets.`))
  const entities = new Map((definition.entities ?? []).map((entity) => [entityKey(entity), entity]))
  const seen = new Set()
  list.forEach((widget, index) => {
    const base = `homeWidgets[${index}]`
    if (!widget || typeof widget !== 'object') { errors.push(diagnostic(base, 'HOME_WIDGET_INVALID', 'Widget must be an object.')); return }
    if (!KEY.test(widget.key ?? '')) errors.push(diagnostic(`${base}.key`, 'HOME_WIDGET_KEY_INVALID', 'Key must be 2-41 lowercase letters, digits or underscores.'))
    else if (seen.has(widget.key)) errors.push(diagnostic(`${base}.key`, 'HOME_WIDGET_DUPLICATE', `Duplicate widget "${widget.key}".`))
    seen.add(widget.key)
    if (typeof widget.label !== 'string' || !widget.label.trim() || widget.label.length > 60) errors.push(diagnostic(`${base}.label`, 'REQUIRED', 'Label is required (max 60 characters).'))
    if (!HOME_WIDGET_KINDS.includes(widget.kind)) errors.push(diagnostic(`${base}.kind`, 'HOME_WIDGET_KIND_INVALID', `Kind must be one of ${HOME_WIDGET_KINDS.join(', ')}.`))
    const entity = entities.get(widget.entity)
    if (!entity) { errors.push(diagnostic(`${base}.entity`, 'HOME_WIDGET_ENTITY_NOT_FOUND', `Entity "${widget.entity}" does not exist.`)); return }
    if (widget.permission !== undefined && !permissionKeys.has(widget.permission)) errors.push(diagnostic(`${base}.permission`, 'HOME_WIDGET_PERMISSION_NOT_FOUND', `Permission "${widget.permission}" is not declared by this module.`))
    const fields = new Map((entity.fields ?? []).map((field) => [fieldKey(field), field]))
    const need = (name, value, allowed, required = false) => {
      if (value === undefined || value === null) { if (required) errors.push(diagnostic(`${base}.${name}`, 'REQUIRED', `${name} is required for a list.`)); return null }
      const field = fields.get(value)
      if (!field) errors.push(diagnostic(`${base}.${name}`, 'HOME_WIDGET_FIELD_NOT_FOUND', `Field "${value}" does not exist in "${widget.entity}".`))
      else if (!allowed.has(field.type)) errors.push(diagnostic(`${base}.${name}`, 'HOME_WIDGET_FIELD_TYPE_UNSUPPORTED', `Field type "${field.type}" cannot be used here.`))
      return field
    }
    if (widget.kind === 'list') {
      need('titleField', widget.titleField, SHOWABLE_TYPES, true)
      need('detailField', widget.detailField, SHOWABLE_TYPES)
      if (widget.sort !== undefined) {
        need('sort.field', widget.sort?.field, COMPARABLE_TYPES, true)
        if (!['asc', 'desc'].includes(widget.sort?.dir ?? 'desc')) errors.push(diagnostic(`${base}.sort.dir`, 'HOME_WIDGET_SORT_INVALID', 'Sort direction must be asc or desc.'))
      }
      if (widget.limit !== undefined && !(Number.isInteger(widget.limit) && widget.limit >= 1 && widget.limit <= 10)) errors.push(diagnostic(`${base}.limit`, 'HOME_WIDGET_LIMIT_INVALID', 'Limit must be 1 to 10.'))
    }
    const conditions = conditionsOf(widget.when)
    if (conditions.length > 5) errors.push(diagnostic(`${base}.when`, 'HOME_WIDGET_CONDITION_INVALID', 'At most 5 conditions.'))
    conditions.forEach((condition, at) => {
      const path = `${base}.when${Array.isArray(widget.when) ? `[${at}]` : ''}`
      if (!condition || typeof condition !== 'object') { errors.push(diagnostic(path, 'HOME_WIDGET_CONDITION_INVALID', 'Condition must be an object.')); return }
      const field = need('when.field', condition.field, COMPARABLE_TYPES, true)
      if (!HOME_WIDGET_OPS.includes(condition.op)) errors.push(diagnostic(`${path}.op`, 'HOME_WIDGET_CONDITION_INVALID', `Condition must be one of ${HOME_WIDGET_OPS.join(', ')}.`))
      if (['equals', 'not_equals'].includes(condition.op) && !['string', 'number', 'boolean'].includes(typeof condition.value)) errors.push(diagnostic(`${path}.value`, 'HOME_WIDGET_CONDITION_INVALID', `"${condition.op}" needs a text, number or boolean value.`))
      if (condition.op === 'contains' && (typeof condition.value !== 'string' || !condition.value)) errors.push(diagnostic(`${path}.value`, 'HOME_WIDGET_CONDITION_INVALID', '"contains" needs a text value.'))
      if (['gt', 'lt'].includes(condition.op)) {
        if (!Number.isFinite(condition.value)) errors.push(diagnostic(`${path}.value`, 'HOME_WIDGET_CONDITION_INVALID', `"${condition.op}" needs a number.`))
        if (field && !NUMBER_TYPES.has(field.type)) errors.push(diagnostic(`${path}.field`, 'HOME_WIDGET_CONDITION_INVALID', `"${condition.op}" only works on number fields.`))
      }
    })
  })
}

export function manifestHomeWidgets(config) {
  const slug = moduleSlug(config.key)
  return (config.homeWidgets ?? []).map((widget) => {
    const conditions = conditionsOf(widget.when).map((condition) => ({ field: condition.field, op: condition.op, ...(condition.value !== undefined ? { value: condition.value } : {}) }))
    return {
      key: widget.key,
      label: widget.label.trim(),
      kind: widget.kind,
      model: widget.entity,
      permission: widget.permission ?? permKey(slug, widget.entity, 'read'),
      ...(conditions.length ? { where: conditions } : {}),
      ...(widget.kind === 'list' ? {
        titleField: widget.titleField,
        ...(widget.detailField ? { detailField: widget.detailField } : {}),
        sortField: widget.sort?.field ?? 'created_at',
        sortDir: widget.sort?.dir ?? 'desc',
        limit: widget.limit ?? 5,
      } : {}),
    }
  })
}
