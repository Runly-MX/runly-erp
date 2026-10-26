const LIST_PATH = '/app/m/runly.inventory/inventory'

// List URL filtered by "<custom field> = <value>" (API param customField = "<fieldId>::<value>").
export function customFieldFilterUrl(field, value) {
  const params = new URLSearchParams({ customField: `${field.id}::${String(value).trim()}`, customFieldLabel: field.label ?? '' })
  return `${LIST_PATH}?${params}`
}

// Splits the customField URL value back into the value shown in the filter chip.
export function customFieldValueLabel(raw) {
  const at = String(raw ?? '').indexOf('::')
  return at < 0 ? String(raw ?? '') : String(raw).slice(at + 2)
}
