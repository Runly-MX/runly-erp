import { findActivePreset, summarizeRange } from './date-range-shared.js'

// Pure helpers behind FilterMenu / ActiveFilterChips. A filter spec is
// { key, label, type: 'select'|'multiselect'|'daterange'|'toggle'|'combobox',
//   options?, fromKey?, toKey? }; the value is a flat object keyed by spec.key
// (or fromKey/toKey for date ranges).

export function filterType(filter) {
  return filter.type ?? 'select'
}

export function emptyValueFor(filter) {
  const type = filterType(filter)
  if (type === 'daterange') return { [filter.fromKey]: '', [filter.toKey]: '' }
  if (type === 'multiselect') return { [filter.key]: [] }
  if (type === 'toggle') return { [filter.key]: false }
  return { [filter.key]: '' }
}

export function isFilterActive(filter, value = {}) {
  const type = filterType(filter)
  if (type === 'daterange') return Boolean(value[filter.fromKey] || value[filter.toKey])
  if (type === 'multiselect') return Array.isArray(value[filter.key]) && value[filter.key].length > 0
  if (type === 'toggle') return value[filter.key] === true
  const current = value[filter.key]
  return current !== undefined && current !== null && current !== ''
}

export function countActiveFilters(filters = [], value = {}) {
  return filters.filter((f) => isFilterActive(f, value)).length
}

function optionLabel(filter, optionValue) {
  return (filter.options ?? []).find((o) => String(o.value) === String(optionValue))?.label ?? String(optionValue)
}

// Short text for the current value of one filter ('' when inactive).
export function summarizeFilter(filter, value = {}) {
  if (!isFilterActive(filter, value)) return ''
  const type = filterType(filter)
  if (type === 'daterange') {
    const from = value[filter.fromKey] || ''
    const to = value[filter.toKey] || ''
    return findActivePreset(from, to)?.label ?? summarizeRange(from, to)
  }
  if (type === 'toggle') return 'Sí'
  if (type === 'multiselect') {
    const picked = value[filter.key]
    if (picked.length === 1) return optionLabel(filter, picked[0])
    return `${optionLabel(filter, picked[0])} +${picked.length - 1}`
  }
  return optionLabel(filter, value[filter.key])
}

// Patch object (to spread into the value) that clears every filter.
export function clearAllPatch(filters = []) {
  return filters.reduce((acc, f) => Object.assign(acc, emptyValueFor(f)), {})
}

// One entry per active filter for ActiveFilterChips.
export function buildChips(filters = [], value = {}) {
  return filters
    .filter((f) => isFilterActive(f, value))
    .map((f) => ({ key: f.key, label: f.label, text: summarizeFilter(f, value), patch: emptyValueFor(f) }))
}
