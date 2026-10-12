import { WEEKDAYS } from './attendanceLabels.js'

// Declarative description of each configuration catalog: form fields, table
// columns and Spanish copy. `ref` fields pick from another catalog.
// field.type: text | textarea | number | time | select | ref | days

const GROUP_KINDS = [{ value: 'internal', label: 'Interno' }, { value: 'contractor', label: 'Contratista' }]
const dayList = (days) => (Array.isArray(days) && days.length ? WEEKDAYS.filter((d) => days.includes(d.value)).map((d) => d.label).join(', ') : 'Todos los días')

export const CATALOGS = {
  sites: {
    label: 'Sitios', singular: 'sitio', newLabel: 'Nuevo sitio', emptyTitle: 'Sin sitios',
    emptyDescription: 'Los sitios son las ubicaciones físicas donde se registra asistencia.',
    fields: [
      { key: 'name', label: 'Nombre', type: 'text', required: true },
      { key: 'address', label: 'Dirección', type: 'text' },
      { key: 'timezone', label: 'Zona horaria', type: 'text', placeholder: 'America/Mexico_City' },
      { key: 'latitude', label: 'Latitud', type: 'number' },
      { key: 'longitude', label: 'Longitud', type: 'number' },
      { key: 'radiusM', label: 'Radio permitido (metros)', type: 'number' },
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
      { key: 'name', label: 'Nombre', type: 'text', required: true },
      { key: 'startTime', label: 'Hora de entrada (HH:MM)', type: 'time', required: true, placeholder: '08:00' },
      { key: 'endTime', label: 'Hora de salida (HH:MM)', type: 'time', required: true, placeholder: '17:00' },
      { key: 'days', label: 'Días', type: 'days' },
      { key: 'graceMinutes', label: 'Tolerancia (minutos)', type: 'number', defaultValue: 10 },
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
      { key: 'name', label: 'Nombre', type: 'text', placeholder: 'Opcional' },
      { key: 'groupId', label: 'Grupo', type: 'ref', ref: 'groups' },
      { key: 'categoryId', label: 'Categoría', type: 'ref', ref: 'categories' },
      { key: 'siteId', label: 'Sitio', type: 'ref', ref: 'sites' },
      { key: 'minCount', label: 'Mínimo de personas presentes', type: 'number', required: true, defaultValue: 1 },
      { key: 'days', label: 'Días que aplica', type: 'days' },
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

export function emptyForm(config) {
  return Object.fromEntries(config.fields.map((f) => [f.key, f.defaultValue ?? (f.type === 'days' ? [] : f.type === 'ref' ? null : '')]))
}

export function formFromItem(config, item) {
  return Object.fromEntries(config.fields.map((f) => {
    const v = item[f.key]
    return [f.key, f.type === 'days' ? (Array.isArray(v) ? v : []) : f.type === 'ref' ? (v ?? null) : (v ?? '')]
  }))
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

// Returns { errors, payload }. Blank optional numbers become null so they can be cleared.
export function validateCatalogForm(config, form) {
  const errors = {}
  const payload = {}
  for (const f of config.fields) {
    const raw = form[f.key]
    if (f.type === 'days' || f.type === 'ref') { payload[f.key] = raw; continue }
    const text = typeof raw === 'string' ? raw.trim() : raw
    if (f.required && (text === '' || text == null)) { errors[f.key] = 'Este campo es obligatorio.'; continue }
    if (f.type === 'time' && !HHMM.test(text)) { errors[f.key] = 'Usa el formato HH:MM, por ejemplo 08:00.'; continue }
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
