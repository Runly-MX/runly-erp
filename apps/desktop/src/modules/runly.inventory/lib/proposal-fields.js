// Values of an item form that can be sent to review when the item already exists in a folder the user
// cannot open. Mirrors PROPOSABLE_FIELDS of services/inventory-proposal-service.js (the API re-checks it).
const PLAIN = [
  { key: 'name', label: 'Nombre' },
  { key: 'model', label: 'Modelo' },
  { key: 'partNumber', label: 'Número de parte' },
  { key: 'warrantyExpiry', label: 'Vencimiento de garantía' },
  { key: 'warrantyNotes', label: 'Notas de garantía' },
  { key: 'notes', label: 'Notas' },
]
const RELATIONS = [
  { key: 'categoryId', label: 'Tipo', list: 'categories' },
  { key: 'brandId', label: 'Marca', list: 'brands' },
  { key: 'locationId', label: 'Ubicación', list: 'locations' },
  { key: 'conditionId', label: 'Condición', list: 'conditions' },
]

const text = (v) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v))

// -> [{ key, label, value, display }] in a stable order, only for the values that were filled in.
// `lookups` = { categories, brands, locations, conditions } as lists of { id, name } (names show to the reviewer).
export function buildProposalFields(values = {}, lookups = {}) {
  const fields = []
  for (const def of PLAIN.slice(0, 2)) if (text(values[def.key])) fields.push({ ...def, value: text(values[def.key]), display: text(values[def.key]) })
  for (const def of RELATIONS.slice(0, 2)) {
    const value = text(values[def.key])
    if (value) fields.push({ key: def.key, label: def.label, value, display: lookups[def.list]?.find((r) => r.id === value)?.name ?? value })
  }
  for (const def of PLAIN.slice(2, 3)) if (text(values[def.key])) fields.push({ ...def, value: text(values[def.key]), display: text(values[def.key]) })
  for (const def of RELATIONS.slice(2)) {
    const value = text(values[def.key])
    if (value) fields.push({ key: def.key, label: def.label, value, display: lookups[def.list]?.find((r) => r.id === value)?.name ?? value })
  }
  for (const def of PLAIN.slice(3)) if (text(values[def.key])) fields.push({ ...def, value: text(values[def.key]).slice(0, def.key === 'warrantyExpiry' ? 10 : undefined), display: text(values[def.key]) })
  return fields
}

// Selected fields -> the API body. Relation fields carry the name the proposer saw, for the reviewer.
export function buildProposalBody({ kind, matched, fields, selected, message }) {
  const changes = {}
  if (kind === 'change') {
    for (const f of fields) {
      if (!selected.has(f.key)) continue
      changes[f.key] = f.key.endsWith('Id') ? { value: f.value, label: f.display } : { value: f.value }
    }
  }
  return { kind, matchedField: matched.field, matchedValue: matched.value, changes, ...(message?.trim() ? { message: message.trim() } : {}) }
}
