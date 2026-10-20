// Pure helpers: what a supplier may do, per folder and overall. The API enforces the same rules
// (403 CAPABILITY_REQUIRED); this only decides which controls the portal shows.
import { areaPathLabel } from './area-tree.js'

const none = { canCreateModels: false, canImport: false }

// Effective capabilities for a folder (areaId) or, without one, for the guest overall.
export function capabilitiesFor(me, areaId = null) {
  if (!me) return none
  if (areaId) {
    const area = (me.areas ?? []).find((a) => a.id === areaId)
    return area ? { canCreateModels: Boolean(area.canWrite && area.canCreateModels), canImport: Boolean(area.canWrite && area.canImport) } : none
  }
  return { canCreateModels: Boolean(me.capabilities?.canCreateModels), canImport: Boolean(me.capabilities?.canImport) }
}

// Folders the guest can register items in (editor role).
export const writableAreas = (me) => (me?.areas ?? []).filter((a) => a.canWrite)

// Destination options of the Excel import: writable folders where importing is enabled.
export function importAreaOptions(me) {
  const areas = me?.areas ?? []
  return areas.filter((a) => a.canWrite && a.canImport).map((a) => ({ value: a.id, label: areaPathLabel(areas, a.id) }))
}

// Two-letter tile for the company when there is no logo.
export function companyInitials(name) {
  const words = String(name ?? '').trim().split(/\s+/).filter(Boolean)
  if (!words.length) return 'IN'
  return (words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0]).toUpperCase()
}

// Inline warning for a duplicate serial / asset number. `hit` is an item, or `{ restricted: true }` when the
// duplicate lives in a folder the supplier cannot open. No link: suppliers cannot reach the main app.
export function identifierConflictMessage(field, hit) {
  if (!hit) return null
  const label = field === 'serialNumber' ? 'número de serie' : 'número de activo'
  if (hit.restricted) return `Ya existe un item activo con este ${label}.`
  return `Ya existe un item activo con este ${label}${hit.name ? `: ${hit.name}` : ''}.`
}
