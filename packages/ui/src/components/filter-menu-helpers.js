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

function findOption(filter, optionValue) {
  return (filter.options ?? []).find((o) => String(o.value) === String(optionValue))
}

function optionLabel(filter, optionValue) {
  return findOption(filter, optionValue)?.label ?? String(optionValue)
}

// Short text for the current value of one filter ('' when inactive).
// `full` lists every picked option of a multiselect (chips); otherwise "First +N" (compact rows).
export function summarizeFilter(filter, value = {}, { full = false } = {}) {
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
    if (full || picked.length === 1) return picked.map((v) => optionLabel(filter, v)).join(', ')
    return `${optionLabel(filter, picked[0])} +${picked.length - 1}`
  }
  return optionLabel(filter, value[filter.key])
}

// Patch object (to spread into the value) that clears every filter.
export function clearAllPatch(filters = []) {
  return filters.reduce((acc, f) => Object.assign(acc, emptyValueFor(f)), {})
}

// One entry per active filter for ActiveFilterChips.
// Icon/color of the single picked option (chips show it only when exactly one is picked).
function chipOption(filter, value) {
  const type = filterType(filter)
  if (type === 'select' || type === 'combobox') return findOption(filter, value[filter.key])
  if (type === 'multiselect' && value[filter.key]?.length === 1) return findOption(filter, value[filter.key][0])
  return null
}

// One entry per active filter for ActiveFilterChips.
export function buildChips(filters = [], value = {}) {
  return filters
    .filter((f) => isFilterActive(f, value))
    .map((f) => {
      const option = chipOption(f, value)
      return {
        key: f.key, label: f.label, text: summarizeFilter(f, value, { full: true }), patch: emptyValueFor(f),
        icon: f.icon ?? null, optionIcon: option?.icon ?? null, optionColor: option?.color ?? null,
      }
    })
}
