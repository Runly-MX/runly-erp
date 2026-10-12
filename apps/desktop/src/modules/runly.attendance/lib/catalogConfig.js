import { WEEKDAYS } from './attendanceLabels.js'
import { browserTimeZone, normalizeDays, suggestQuotaName, suggestShiftName, toleranceOptionsFor } from './formHelpers.js'

// Declarative description of each configuration catalog: form fields, table
// columns and Spanish copy. `ref` fields pick from another catalog.
// field.type: text | textarea | number | time | select | ref | days | timezone | location
//   number + stepper:true  -> [- n +] control (min/max honoured)
//   number + options       -> dropdown of presets, value coerced to a number
//   time                   -> 15-minute time dropdown (value stays "HH:MM")
//   location               -> one control owning address, latitude, longitude and radiusM
// field.autoName(form, lookups): suggested value used when a text field is left empty.
// field.defaultValue may be a function (evaluated per new form).

const GROUP_KINDS = [{ value: 'internal', label: 'Interno' }, { value: 'contractor', label: 'Contratista' }]
const dayList = (days) => (Array.isArray(days) && days.length ? WEEKDAYS.filter((d) => days.includes(d.value)).map((d) => d.label).join(', ') : 'Todos los días')

export const CATALOGS = {
  sites: {
    label: 'Sitios', singular: 'sitio', newLabel: 'Nuevo sitio', emptyTitle: 'Sin sitios',
    emptyDescription: 'Los sitios son las ubicaciones físicas donde se registra asistencia.',
    fields: [
      { key: 'name', label: 'Nombre', type: 'text', required: true, placeholder: 'Ej. Planta Norte' },
      { key: 'location', label: 'Ubicación', type: 'location' },
      { key: 'timezone', label: 'Zona horaria', type: 'timezone', defaultValue: browserTimeZone },
    ],
    columns: [{ key: 'name', header: 'Nombre' }, { key: 'address', header: 'Dirección' }, { key: 'timezone', header: 'Zona horaria' }],
  },
  groups: {
    label: 'Grupos', singular: 'grupo', newLabel: 'Nuevo grupo', emptyTitle: 'Sin grupos',
    emptyDescription: 'Agrupa al personal por área, cuadrilla o empresa contratista.',
    fields: [
      { key: 'name', label: 'Nombre', type: 'text', required: true },
      { key: 'kind', label: 'Tipo', type: 'select', options: GROUP_KINDS, defaultValue: 'internal' },
      { key: 'notes', label: 'Notas', type: 'textarea' },
    ],
    columns: [{ key: 'name', header: 'Nombre' }, { key: 'kind', header: 'Tipo', render: (r) => GROUP_KINDS.find((k) => k.value === r.kind)?.label ?? '—' }, { key: 'notes', header: 'Notas' }],
  },
  categories: {
    label: 'Categorías', singular: 'categoría', newLabel: 'Nueva categoría', emptyTitle: 'Sin categorías',
    emptyDescription: 'Las categorías clasifican al personal (por ejemplo, oficio o puesto).',
    fields: [{ key: 'name', label: 'Nombre', type: 'text', required: true }],
    columns: [{ key: 'name', header: 'Nombre' }],
  },
  shifts: {
    label: 'Turnos', singular: 'turno', newLabel: 'Nuevo turno', emptyTitle: 'Sin turnos',
    emptyDescription: 'Los turnos definen el horario esperado y la tolerancia de llegada.',
    fields: [
      { key: 'startTime', label: 'Hora de entrada', type: 'time', required: true, defaultValue: '08:00' },
      { key: 'endTime', label: 'Hora de salida', type: 'time', required: true, defaultValue: '17:00' },
      { key: 'days', label: 'Días', type: 'days', defaultValue: [1, 2, 3, 4, 5] },
      { key: 'graceMinutes', label: 'Tolerancia de llegada', type: 'number', defaultValue: 10, options: toleranceOptionsFor() },
      {
        key: 'name', label: 'Nombre', type: 'text', required: true, placeholder: 'Se genera con el horario',
        autoName: (form) => suggestShiftName(form.startTime, form.endTime),
      },
    ],
    columns: [
      { key: 'name', header: 'Nombre' },
      { key: 'schedule', header: 'Horario', render: (r) => `${r.startTime} – ${r.endTime}` },
      { key: 'days', header: 'Días', render: (r) => dayList(r.days) },
      { key: 'graceMinutes', header: 'Tolerancia', render: (r) => `${r.graceMinutes ?? 0} min` },
    ],
  },
  quotas: {
    label: 'Cuotas', singular: 'cuota', newLabel: 'Nueva cuota', emptyTitle: 'Sin cuotas',
    emptyDescription: 'Una cuota exige un mínimo de personas presentes para un grupo, categoría o sitio.',
    fields: [
      { key: 'groupId', label: 'Grupo', type: 'ref', ref: 'groups' },
      { key: 'categoryId', label: 'Categoría', type: 'ref', ref: 'categories' },
      { key: 'siteId', label: 'Sitio', type: 'ref', ref: 'sites' },
      { key: 'minCount', label: 'Mínimo de personas presentes', type: 'number', required: true, defaultValue: 1, stepper: true, min: 1, max: 9999 },
      { key: 'days', label: 'Días que aplica', type: 'days', defaultValue: [] },
      { key: 'name', label: 'Nombre', type: 'text', placeholder: 'Se genera con grupo, categoría y sitio', autoName: suggestQuotaName },
    ],
    columns: [
      { key: 'name', header: 'Cuota', render: (r, lk) => r.name || [lk.groups.get(r.groupId), lk.categories.get(r.categoryId), lk.sites.get(r.siteId)].filter(Boolean).join(' · ') || 'General' },
      { key: 'groupId', header: 'Grupo', render: (r, lk) => lk.groups.get(r.groupId) ?? '—' },
      { key: 'categoryId', header: 'Categoría', render: (r, lk) => lk.categories.get(r.categoryId) ?? '—' },
      { key: 'siteId', header: 'Sitio', render: (r, lk) => lk.sites.get(r.siteId) ?? '—' },
      { key: 'minCount', header: 'Mínimo' },
      { key: 'days', header: 'Días', render: (r) => dayList(r.days) },
    ],
  },
}

export const CATALOG_ORDER = ['sites', 'groups', 'categories', 'shifts', 'quotas']

// radiusM '' = "not chosen yet" (the location control applies the 200 m default once a point is set);
// null = explicitly unlimited.
const EMPTY_LOCATION = { address: '', latitude: null, longitude: null, radiusM: '' }

function emptyValue(f) {
  if (f.defaultValue !== undefined) {
    if (typeof f.defaultValue === 'function') return f.defaultValue()
    return Array.isArray(f.defaultValue) ? [...f.defaultValue] : f.defaultValue
  }
  if (f.type === 'days') return []
  if (f.type === 'ref') return null
  if (f.type === 'location') return { ...EMPTY_LOCATION }
  return ''
}

export function emptyForm(config) {
  return Object.fromEntries(config.fields.map((f) => [f.key, emptyValue(f)]))
}

export function formFromItem(config, item) {
  return Object.fromEntries(config.fields.map((f) => {
    if (f.type === 'location') {
      return [f.key, { address: item.address ?? '', latitude: item.latitude ?? null, longitude: item.longitude ?? null, radiusM: item.radiusM ?? null }]
    }
    const v = item[f.key]
    return [f.key, f.type === 'days' ? (Array.isArray(v) ? v : []) : f.type === 'ref' ? (v ?? null) : (v ?? '')]
  }))
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
const toNumberOrNull = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v))

// Returns { errors, payload }. Blank optional numbers become null so they can be cleared.
// `lookups` is optional; it only feeds name suggestions (field.autoName) that need related names.
export function validateCatalogForm(config, form, lookups) {
  const errors = {}
  const payload = {}
  for (const f of config.fields) {
    const raw = form[f.key]
    if (f.type === 'days') { payload[f.key] = normalizeDays(raw); continue }
    if (f.type === 'ref') { payload[f.key] = raw; continue }
    if (f.type === 'location') {
      const loc = raw ?? EMPTY_LOCATION
      const lat = toNumberOrNull(loc.latitude)
      const lng = toNumberOrNull(loc.longitude)
      const hasPoint = lat != null && lng != null
      payload.address = String(loc.address ?? '').trim() || null
      payload.latitude = hasPoint ? lat : null
      payload.longitude = hasPoint ? lng : null
      payload.radiusM = hasPoint ? toNumberOrNull(loc.radiusM) : null
      continue
    }
    let text = typeof raw === 'string' ? raw.trim() : raw
    if ((text === '' || text == null) && f.autoName) text = f.autoName(form, lookups) || ''
    if (f.required && (text === '' || text == null)) { errors[f.key] = 'Este campo es obligatorio.'; continue }
    if (f.type === 'time' && !HHMM.test(text)) { errors[f.key] = 'Elige una hora válida.'; continue }
    if (f.type === 'number') {
      if (text === '' || text == null) { payload[f.key] = f.required ? undefined : null; continue }
      if (Number.isNaN(Number(text))) { errors[f.key] = 'Debe ser un número.'; continue }
      payload[f.key] = Number(text)
      continue
    }
    payload[f.key] = text === '' ? null : text
  }
  return { errors, payload }
}
