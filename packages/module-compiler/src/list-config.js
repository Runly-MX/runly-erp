// Declarative presentation of an entity's generated TABLE (entity.list).
// Everything here maps onto what RunlyTable renders and what the generated
// list route serves; nothing is accepted that the runtime would ignore.
// Without `list` the generated table keeps its legacy shape (first 5 fields).

const IDENTIFIER = /^[a-z][a-z0-9_]*$/
export const LIST_MAX_COLUMNS = 8
export const LIST_MAX_FILTERS = 4
export const LIST_VIEW_MODES = ['table', 'cards', 'grid']
export const LIST_SORT_SYSTEM_FIELDS = ['created_at', 'updated_at']
// Per field type: the formats a column may use (first one is the default).
export const LIST_FORMATS = Object.freeze({
  decimal: ['currency', 'number'],
  number: ['number', 'currency'],
  date: ['date', 'datetime'],
  datetime: ['datetime', 'date'],
})
const NOT_SORTABLE = new Set(['relation', 'file', 'json', 'multiselect', 'richtext', 'markdown'])
const NOT_COLUMN = new Set(['json'])

const diagnostic = (path, code, message) => ({ path, code, message, severity: 'error' })
const fieldKey = (field) => field.key ?? field.name
const isRelation = (field) => field.type === 'relation'
export const isListImageField = (field) => field?.type === 'file' && field.accept === 'image'

export function listFormatOptions(field) {
  return LIST_FORMATS[field?.type] ?? []
}

export function validateEntityList(entity, base, errors) {
  const list = entity.list
  if (list === undefined) return
  if (!list || typeof list !== 'object' || Array.isArray(list)) { errors.push(diagnostic(`${base}.list`, 'INVALID_LIST', 'list must be an object.')); return }
  const fields = new Map((entity.fields ?? []).map((field) => [fieldKey(field), field]))
  const need = (name, path, accept) => {
    const field = fields.get(name)
    if (!IDENTIFIER.test(name ?? '') || !field) { errors.push(diagnostic(path, 'LIST_UNKNOWN_FIELD', `"${name}" is not a field of this entity.`)); return null }
    if (accept && !accept(field)) { errors.push(diagnostic(path, 'LIST_FIELD_TYPE', `"${name}" (${field.type}) cannot be used here.`)); return null }
    return field
  }
  if (list.primaryField !== undefined) need(list.primaryField, `${base}.list.primaryField`, (field) => !NOT_COLUMN.has(field.type) && field.type !== 'file')
  if (list.subtitleField !== undefined) need(list.subtitleField, `${base}.list.subtitleField`, (field) => !NOT_COLUMN.has(field.type) && field.type !== 'file')
  if (list.statusField !== undefined) need(list.statusField, `${base}.list.statusField`, (field) => field.type === 'select')
  if (list.imageField !== undefined) need(list.imageField, `${base}.list.imageField`, isListImageField)
  if (list.defaultView !== undefined && !LIST_VIEW_MODES.includes(list.defaultView)) errors.push(diagnostic(`${base}.list.defaultView`, 'LIST_INVALID_VIEW', `defaultView must be ${LIST_VIEW_MODES.join(', ')}.`))
  if (list.columns !== undefined) {
    if (!Array.isArray(list.columns) || !list.columns.length || list.columns.length > LIST_MAX_COLUMNS) errors.push(diagnostic(`${base}.list.columns`, 'LIST_COLUMNS_RANGE', `columns needs 1 to ${LIST_MAX_COLUMNS} entries.`))
    else {
      const seen = new Set()
      list.columns.forEach((column, index) => {
        const path = `${base}.list.columns[${index}]`
        const field = need(column?.field, `${path}.field`, (candidate) => !NOT_COLUMN.has(candidate.type))
        if (seen.has(column?.field)) errors.push(diagnostic(`${path}.field`, 'LIST_DUPLICATE_COLUMN', `Column "${column.field}" is repeated.`))
        seen.add(column?.field)
        if (column?.format !== undefined && field && !listFormatOptions(field).includes(column.format)) errors.push(diagnostic(`${path}.format`, 'LIST_INVALID_FORMAT', `Format "${column.format}" does not apply to ${field.type}.`))
      })
    }
  }
  if (list.filters !== undefined) {
    // The generated list route only filters by select values.
    if (!Array.isArray(list.filters) || list.filters.length > LIST_MAX_FILTERS) errors.push(diagnostic(`${base}.list.filters`, 'LIST_FILTERS_RANGE', `filters accepts up to ${LIST_MAX_FILTERS} select fields.`))
    else list.filters.forEach((name, index) => need(name, `${base}.list.filters[${index}]`, (field) => field.type === 'select'))
  }
  if (list.defaultSort !== undefined) {
    const sort = list.defaultSort
    const path = `${base}.list.defaultSort`
    if (!sort || typeof sort !== 'object' || !['asc', 'desc'].includes(sort.direction)) errors.push(diagnostic(`${path}.direction`, 'LIST_INVALID_SORT', 'direction must be asc or desc.'))
    if (!LIST_SORT_SYSTEM_FIELDS.includes(sort?.field)) need(sort?.field, `${path}.field`, (field) => !NOT_SORTABLE.has(field.type))
  }
}

// Columns RunlyTable receives, as plain objects (views.js serializes them).
export function listColumns(entity, helpers) {
  const fields = new Map(entity.fields.map((field) => [field.name, field]))
  const list = entity.list ?? {}
  const names = list.columns?.map((column) => column.field) ?? entity.fields.slice(0, 5).map((field) => field.name)
  const formats = new Map((list.columns ?? []).map((column) => [column.field, column.format]))
  // The image and the primary field always show, even when not picked as columns.
  const ordered = [...(list.imageField && !names.includes(list.imageField) ? [list.imageField] : []), ...(list.primaryField && !names.includes(list.primaryField) ? [list.primaryField] : []), ...names]
  return ordered.map((name) => helpers.column(fields.get(name), formats.get(name), list))
}

export function listSchemaExtras(entity) {
  const list = entity.list
  if (!list) return {}
  const fields = new Map(entity.fields.map((field) => [field.name, field]))
  const extras = {}
  if (list.primaryField) extras.primaryField = list.primaryField
  if (list.subtitleField) extras.subtitleField = list.subtitleField
  if (list.statusField) extras.statusField = list.statusField
  if (list.defaultView) extras.defaultViewMode = list.defaultView
  if (list.filters?.length) {
    extras.filters = list.filters.map((name) => ({
      field: name, label: fields.get(name).label || name, type: 'select',
      options: (fields.get(name).options ?? []).map((option) => (typeof option === 'string' ? { value: option, label: option } : option)),
    }))
  }
  return extras
}

// SQL ORDER BY for the generated list function; identifiers are validated
// against the entity's own fields, so they are safe to inline.
export function listOrderBy(entity) {
  const sort = entity.list?.defaultSort
  if (!sort) return 't.created_at DESC'
  const direction = sort.direction === 'asc' ? 'ASC' : 'DESC'
  return `t.${sort.field} ${direction} NULLS LAST, t.created_at DESC`
}
