// Builder document kinds (definition.documentKinds): an entity offered to
// Runly Documents as a template kind, so users upload Word / Excel / PowerPoint /
// PDF forms for it and fill them from a record. Compiles to the manifest
// `documentKinds` contract (packages/module-engine/src/manifest-integrations.js).
//
//   documentKinds: [{ name: 'invoice', label: 'Factura', entity: 'invoice',
//                     permission?: <read permission of the entity by default>,
//                     formats?: ['docx', 'pdf'], fields?: ['number', 'total'] }]
import { DOCUMENT_KINDS_MAX, DOCUMENT_KIND_FORMATS } from '@runly/module-engine/browser'
import { moduleSlug, permKey } from './templates/helpers.js'

const NAME = /^[a-z][a-z0-9_]{1,40}$/
const NUMBER_TYPES = new Set(['number', 'decimal'])
const DATE_TYPES = new Set(['date', 'datetime'])
const TEXT_TYPES = new Set(['text', 'textarea', 'markdown', 'email', 'phone', 'select', 'boolean'])

const fieldKey = (field) => field.key ?? field.name
const entityKey = (entity) => entity.key ?? entity.name

function diagnostic(path, code, message) {
  return { path, code, message, severity: 'error' }
}

export function documentKindFieldType(field) {
  if (NUMBER_TYPES.has(field.type)) return 'number'
  if (DATE_TYPES.has(field.type)) return 'date'
  if (TEXT_TYPES.has(field.type)) return 'text'
  return null
}

export function validateDefinitionDocumentKinds(definition, permissionKeys, errors) {
  const list = definition.documentKinds
  if (list === undefined || list === null) return
  if (!Array.isArray(list)) { errors.push(diagnostic('documentKinds', 'DOCUMENT_KINDS_INVALID', 'documentKinds must be an array.')); return }
  if (list.length > DOCUMENT_KINDS_MAX) errors.push(diagnostic('documentKinds', 'DOCUMENT_KINDS_TOO_MANY', `At most ${DOCUMENT_KINDS_MAX} document kinds.`))
  const entities = new Map((definition.entities ?? []).map((entity) => [entityKey(entity), entity]))
  const seen = new Set()
  list.forEach((kind, index) => {
    const base = `documentKinds[${index}]`
    if (!kind || typeof kind !== 'object') { errors.push(diagnostic(base, 'DOCUMENT_KIND_INVALID', 'Document kind must be an object.')); return }
    if (!NAME.test(kind.name ?? '')) errors.push(diagnostic(`${base}.name`, 'DOCUMENT_KIND_NAME_INVALID', 'Name must be 2-41 lowercase letters, digits or underscores.'))
    else if (seen.has(kind.name)) errors.push(diagnostic(`${base}.name`, 'DOCUMENT_KIND_DUPLICATE', `Duplicate document kind "${kind.name}".`))
    seen.add(kind.name)
    if (typeof kind.label !== 'string' || !kind.label.trim() || kind.label.length > 80) errors.push(diagnostic(`${base}.label`, 'REQUIRED', 'Label is required (max 80 characters).'))
    const entity = entities.get(kind.entity)
    if (!entity) { errors.push(diagnostic(`${base}.entity`, 'DOCUMENT_KIND_ENTITY_NOT_FOUND', `Entity "${kind.entity}" does not exist.`)); return }
    if (kind.permission !== undefined && !permissionKeys.has(kind.permission)) errors.push(diagnostic(`${base}.permission`, 'DOCUMENT_KIND_PERMISSION_NOT_FOUND', `Permission "${kind.permission}" is not declared by this module.`))
    if (kind.formats !== undefined && (!Array.isArray(kind.formats) || !kind.formats.length || kind.formats.some((f) => !DOCUMENT_KIND_FORMATS.includes(f)))) {
      errors.push(diagnostic(`${base}.formats`, 'DOCUMENT_KIND_FORMATS_INVALID', `Formats must be a non-empty subset of ${DOCUMENT_KIND_FORMATS.join(', ')}.`))
    }
    const fields = new Map((entity.fields ?? []).map((field) => [fieldKey(field), field]))
    if (kind.fields !== undefined) {
      if (!Array.isArray(kind.fields) || !kind.fields.length) errors.push(diagnostic(`${base}.fields`, 'DOCUMENT_KIND_FIELDS_INVALID', 'Fields must be a non-empty list of field keys.'))
      else kind.fields.forEach((key, fieldIndex) => {
        const field = fields.get(key)
        if (!field) errors.push(diagnostic(`${base}.fields[${fieldIndex}]`, 'DOCUMENT_KIND_FIELD_NOT_FOUND', `Field "${key}" does not exist in "${kind.entity}".`))
        else if (!documentKindFieldType(field)) errors.push(diagnostic(`${base}.fields[${fieldIndex}]`, 'DOCUMENT_KIND_FIELD_TYPE_UNSUPPORTED', `Field type "${field.type}" cannot be used in a document.`))
      })
    } else if (![...fields.values()].some((field) => documentKindFieldType(field))) {
      errors.push(diagnostic(`${base}.entity`, 'DOCUMENT_KIND_NO_FIELDS', `Entity "${kind.entity}" has no field usable in a document.`))
    }
  })
}

// definition.documentKinds -> manifest.documentKinds.
export function manifestDocumentKinds(config) {
  const slug = moduleSlug(config.key)
  const entities = new Map((config.entities ?? []).map((entity) => [entityKey(entity), entity]))
  return (config.documentKinds ?? []).map((kind) => {
    const entity = entities.get(kind.entity)
    const wanted = kind.fields ? new Set(kind.fields) : null
    const fields = (entity.fields ?? [])
      .filter((field) => (wanted ? wanted.has(fieldKey(field)) : true) && documentKindFieldType(field))
      .map((field) => ({ tag: fieldKey(field), label: field.label ?? fieldKey(field), type: documentKindFieldType(field) }))
    return {
      name: kind.name,
      label: kind.label,
      model: entityKey(entity),
      permission: kind.permission ?? permKey(slug, entityKey(entity), 'read'),
      ...(kind.formats ? { formats: kind.formats } : {}),
      fields,
    }
  })
}
