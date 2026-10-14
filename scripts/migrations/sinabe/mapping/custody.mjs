// Pure mappers for sinabe custody records (resguardos).

export const CUSTODY_STATUS_MAP = { COMPLETADO: 'COMPLETED', BORRADOR: 'DRAFT', CANCELADO: 'CANCELLED' }

export function mapCustodyStatus(status) {
  return CUSTODY_STATUS_MAP[String(status ?? '').trim().toUpperCase()] ?? null
}

const time = (record) => (record.date ?? record.createdAt)?.getTime?.() ?? 0

// Migratable records (enabled, known status) in date order (ties by createdAt, id).
export function orderCustodyRecords(records) {
  return records
    .filter((record) => record.enabled !== false && mapCustodyStatus(record.status))
    .sort((a, b) => time(a) - time(b) || (a.createdAt?.getTime?.() ?? 0) - (b.createdAt?.getTime?.() ?? 0) || String(a.id).localeCompare(String(b.id)))
}

// Map<inventoryId, recordId> of the latest COMPLETED record per item.
export function latestCompletedByItem(orderedRecords, itemsByRecord) {
  const latest = new Map()
  for (const record of orderedRecords) {
    if (mapCustodyStatus(record.status) !== 'COMPLETED') continue
    for (const row of itemsByRecord.get(record.id) ?? []) latest.set(row.inventoryId, record.id)
  }
  return latest
}

// 'all': the record is the latest COMPLETED one for every item (applyAssignments);
// 'partial': only for some items (those get a dated open assignment instead);
// 'none': history only.
export function assignmentMode(record, rows, latest) {
  if (mapCustodyStatus(record.status) !== 'COMPLETED' || !rows.length) return { mode: 'none', itemIds: [] }
  const mine = rows.filter((row) => latest.get(row.inventoryId) === record.id).map((row) => row.inventoryId)
  if (!mine.length) return { mode: 'none', itemIds: [] }
  return { mode: mine.length === rows.length ? 'all' : 'partial', itemIds: mine }
}

// CustodyItem -> snapshot override for mergeLegacySnapshot (what the signed paper said).
export function custodySnapshot(row) {
  const pick = (value) => (value == null || String(value).trim() === '' ? undefined : String(value))
  const snapshot = {
    typeBrand: pick(row.typeBrand), model: pick(row.model), serialNumber: pick(row.serialNumber),
    assetTag: pick(row.assetNumber), invoiceNumber: pick(row.invoiceNumber), features: pick(row.features),
  }
  return Object.fromEntries(Object.entries(snapshot).filter(([, value]) => value !== undefined))
}

// Duplicate inventory rows inside one record collapse to the first one.
export function uniqueCustodyRows(rows) {
  const seen = new Set()
  return rows.filter((row) => (row.inventoryId && !seen.has(row.inventoryId) ? (seen.add(row.inventoryId), true) : false))
}
