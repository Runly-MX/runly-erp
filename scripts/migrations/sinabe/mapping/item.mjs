// Pure mappers for sinabe Inventory rows: administrative status + dates,
// condition priority and the asset tag decision. No I/O; every decision that
// loses or bends data returns a warning code (never the data itself).

export const DEFAULT_TIMEZONE = 'America/Mexico_City'
export const STATUS_MAP = { ALTA: 'registered', PROPUESTA: 'deregistration_proposed', BAJA: 'deregistered' }

const formatters = new Map()
// Calendar day (YYYY-MM-DD) of an instant in the source timezone (sinabe stores UTC).
export function dayOf(date, timeZone = DEFAULT_TIMEZONE) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null
  if (!formatters.has(timeZone)) formatters.set(timeZone, new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }))
  return formatters.get(timeZone).format(date)
}

// -> { adminStatus, registeredAt, deregisteredAt, deregistrationReason, warnings[] } (dates as YYYY-MM-DD)
export function mapStatus(inv, { timeZone = DEFAULT_TIMEZONE } = {}) {
  const warnings = []
  const raw = String(inv.status ?? '').trim().toUpperCase()
  let adminStatus = STATUS_MAP[raw]
  if (!adminStatus) { adminStatus = 'registered'; warnings.push('STATUS_UNKNOWN') }
  let registeredAt = dayOf(inv.altaDate, timeZone)
  if (!registeredAt) {
    registeredAt = dayOf(inv.createdAt, timeZone)
    warnings.push('ALTA_DATE_FROM_CREATED_AT')
  }
  let deregisteredAt = null
  if (adminStatus === 'deregistered') {
    deregisteredAt = dayOf(inv.bajaDate, timeZone)
    if (!deregisteredAt) {
      deregisteredAt = dayOf(inv.updatedAt, timeZone) ?? dayOf(inv.createdAt, timeZone)
      warnings.push('BAJA_DATE_FROM_UPDATED_AT')
    }
    if (registeredAt && deregisteredAt && deregisteredAt < registeredAt) {
      deregisteredAt = registeredAt
      warnings.push('BAJA_BEFORE_ALTA')
    }
  } else if (inv.bajaDate) {
    warnings.push('BAJA_DATE_IGNORED')
  }
  const deregistrationReason = adminStatus === 'deregistered' || adminStatus === 'deregistration_proposed' ? 'other' : null
  return { adminStatus, registeredAt, deregisteredAt, deregistrationReason, warnings }
}

// Highest priority first; names compared without accents/case.
export const CONDITION_PRIORITY = ['Descompuesto', 'En Reparación', 'En Mantenimiento', 'Usado', 'Semi Nuevo', 'Nuevo']
export const foldName = (value) => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
const PRIORITY_INDEX = new Map(CONDITION_PRIORITY.map((name, index) => [foldName(name), index]))

// names: condition names of one item -> { primary, list } (list = every name, by priority then alphabetical).
export function pickCondition(names) {
  const unique = [...new Map((names ?? []).filter((n) => String(n ?? '').trim()).map((n) => [foldName(n), String(n).trim()])).values()]
  const rank = (name) => PRIORITY_INDEX.get(foldName(name)) ?? CONDITION_PRIORITY.length
  unique.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, 'es'))
  return { primary: unique[0] ?? null, list: unique }
}

export const ASSET_TAG_MAX = 100
const clean = (value) => {
  const text = value == null ? '' : String(value).trim()
  return text || null
}
const countBy = (values) => {
  const counts = new Map()
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1)
  return counts
}

// Asset tag per inventory id. It is NEVER invented: an item without a usable
// activeNumber simply has no asset number (InvItem.assetTag is optional). The
// original value (and the folio) always stay in their sinabe custom fields.
// Uniqueness only matters among ENABLED items (case/space-insensitive), as in
// Runly: logically deleted items keep their number. Among enabled duplicates the
// most "alive" one keeps the number (ALTA > PROPUESTA > BAJA, then oldest); the
// others get no number (ASSET_NUMBER_DUPLICATE). Numbers over 100 chars are not
// stored (ASSET_NUMBER_TOO_LONG). Returns Map<id, { assetTag|null, origin, warnings[] }>.
const STATUS_RANK = { ALTA: 0, PROPUESTA: 1, BAJA: 2 }
const timeOf = (inv) => inv.createdAt?.getTime?.() ?? 0
export function decideAssetTags(inventories) {
  const out = new Map()
  const groups = new Map()
  for (const inv of inventories) {
    const active = clean(inv.activeNumber)
    if (!active) { out.set(inv.id, { assetTag: null, origin: 'none', warnings: ['ASSET_NUMBER_EMPTY'] }); continue }
    if (active.length > ASSET_TAG_MAX) { out.set(inv.id, { assetTag: null, origin: 'none', warnings: ['ASSET_NUMBER_TOO_LONG'] }); continue }
    if (inv.enabled === false) { out.set(inv.id, { assetTag: active, origin: 'activeNumber', warnings: [] }); continue }
    const key = active.toLowerCase()
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(inv)
  }
  for (const rows of groups.values()) {
    rows.sort((a, b) => (STATUS_RANK[a.status] ?? 3) - (STATUS_RANK[b.status] ?? 3) || timeOf(a) - timeOf(b) || String(a.id).localeCompare(String(b.id)))
    rows.forEach((inv, index) => {
      if (index === 0) out.set(inv.id, { assetTag: clean(inv.activeNumber), origin: 'activeNumber', warnings: [] })
      else out.set(inv.id, { assetTag: null, origin: 'none', warnings: ['ASSET_NUMBER_DUPLICATE'] })
    })
  }
  return out
}

// Display name like the inventory UI's auto name: "<tipo> <marca> <modelo>".
export function itemName({ typeName, brandName, modelName, assetTag, serialNumber }) {
  const parts = [typeName, brandName, modelName].map(clean).filter(Boolean)
  return (parts.join(' ') || `Activo ${clean(assetTag) ?? clean(serialNumber) ?? ''}`.trim()).slice(0, 255)
}
