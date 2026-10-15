// Detail view of an item's custom fields: only fields that carry a value.
// An unchecked boolean is stored as "false" whenever the form is saved, so it
// is indistinguishable from "never filled in" and counts as empty here.
export function hasCustomFieldValue(entry) {
  if (!entry?.field) return false
  const value = entry.value
  if (value === null || value === undefined) return false
  const text = String(value).trim()
  if (text === '') return false
  if (entry.field.fieldType === 'boolean' && text.toLowerCase() === 'false') return false
  return true
}

export function filledCustomValues(customValues) {
  return (Array.isArray(customValues) ? customValues : []).filter(hasCustomFieldValue)
}
