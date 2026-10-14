// Pure mappers for the custom fields a sinabe item becomes in Runly: the
// sinabe CustomField catalog, the details JSON, the kept original identifiers
// and the N:M lists (conditions, verticals) that Runly stores as one value.
import { foldName } from './item.mjs'

export const FIELD_VALUE_MAX = 2000

// Fixed fields created by the migrator (global: no category).
export const SPECIAL_FIELDS = {
  conditions: { fieldKey: 'sinabe_condiciones', label: 'Condiciones (sinabe)' },
  activeNumber: { fieldKey: 'sinabe_numero_activo', label: 'Número de activo (sinabe)' },
  internalFolio: { fieldKey: 'sinabe_folio_interno', label: 'Folio interno (sinabe)' },
  vertical: { fieldKey: 'vertical', label: 'Vertical' },
  details: { fieldKey: 'sinabe_detalles', label: 'Detalles (sinabe)' },
}

const slug = (value) => foldName(value).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'campo'

export const customFieldKey = (sinabeFieldId) => `sinabe_cf_${sinabeFieldId}`
export function detailsFieldKey(key) {
  return `sinabe_d_${slug(key)}`.slice(0, 50)
}
const detailsLabel = (key) => `${String(key).trim().slice(0, 88)} (sinabe)`

export function fieldValue(value) {
  if (value === undefined || value === null) return null
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  const trimmed = text.trim()
  return trimmed ? trimmed.slice(0, FIELD_VALUE_MAX) : null
}

// Field definitions the whole dump needs: [{ fieldKey, label, enabled, sinabeId? }].
export function fieldDefinitions(source) {
  const defs = new Map()
  const add = (def) => { if (!defs.has(def.fieldKey)) defs.set(def.fieldKey, { enabled: true, ...def }) }
  for (const special of Object.values(SPECIAL_FIELDS)) {
    if (special === SPECIAL_FIELDS.details) continue
    add({ ...special })
  }
  for (const field of source.customFields) add({ fieldKey: customFieldKey(field.id), label: String(field.name ?? `Campo ${field.id}`).trim().slice(0, 100), enabled: field.enabled !== false, sinabeId: field.id })
  for (const inv of source.inventories) {
    const details = inv.details
    if (details == null) continue
    if (typeof details === 'object' && !Array.isArray(details)) {
      for (const key of Object.keys(details)) add({ fieldKey: detailsFieldKey(key), label: detailsLabel(key) })
    } else add({ ...SPECIAL_FIELDS.details })
  }
  return [...defs.values()]
}

// Values of one item: [{ fieldKey, value }] (empty values dropped).
// ctx: { conditionNames: string[] (already ordered), verticalNames: string[], customFieldRows: [{ customFieldId, value }] }
export function itemCustomValues(inv, ctx = {}) {
  const out = new Map()
  const put = (fieldKey, value) => {
    const text = fieldValue(value)
    if (text !== null) out.set(fieldKey, text)
  }
  put(SPECIAL_FIELDS.activeNumber.fieldKey, inv.activeNumber)
  put(SPECIAL_FIELDS.internalFolio.fieldKey, inv.internalFolio)
  if (ctx.conditionNames?.length) put(SPECIAL_FIELDS.conditions.fieldKey, ctx.conditionNames.join(', '))
  if (ctx.verticalNames?.length) put(SPECIAL_FIELDS.vertical.fieldKey, [...new Set(ctx.verticalNames)].sort((a, b) => a.localeCompare(b, 'es')).join(', '))
  for (const row of ctx.customFieldRows ?? []) put(customFieldKey(row.customFieldId), row.value)
  const details = inv.details
  if (details != null) {
    if (typeof details === 'object' && !Array.isArray(details)) {
      for (const [key, value] of Object.entries(details)) put(detailsFieldKey(key), value)
    } else put(SPECIAL_FIELDS.details.fieldKey, details)
  }
  return [...out.entries()].map(([fieldKey, value]) => ({ fieldKey, value }))
}
