// Representative pilot selection: instead of "the first 50 items", picks whole
// completed custody records (so they can be imported), items with invoice and
// purchase order, items with many files, and fills with a mix of statuses.
// Also lists the upload keys the pilot needs, so only those files have to be
// copied from the sinabe server (rsync --files-from) instead of the whole tree.
import { normalizeUploadKey } from './paths.mjs'
import { buildScope } from './mapping/index.mjs'
import { invoiceFiles } from './migrate-purchases.mjs'
import { mapCustodyStatus } from './mapping/custody.mjs'

export function pickPilot(model, size = 50) {
  const chosen = new Set()
  const byId = new Map(model.inventories.map((inv) => [inv.id, inv]))
  const room = () => size - chosen.size
  const add = (id) => { if (byId.has(id) && !chosen.has(id) && room() > 0) chosen.add(id) }

  // 1. Whole completed custody records, up to ~40% of the pilot.
  for (const record of model.custodyRecords) {
    if (mapCustodyStatus(record.status) !== 'COMPLETED') continue
    const ids = [...new Set((model.custodyItemsByRecord.get(record.id) ?? []).map((row) => row.inventoryId))].filter((id) => byId.has(id))
    const fresh = ids.filter((id) => !chosen.has(id)).length
    if (fresh && chosen.size + fresh <= Math.floor(size * 0.4)) ids.forEach(add)
  }
  // 2. Items with invoice / purchase order, 2 invoices and 2 orders at most beyond custody picks.
  let invoices = 0, orders = 0
  for (const inv of model.inventories) {
    if (inv.invoiceId && model.invoices.has(inv.invoiceId) && invoices < 8 && !chosen.has(inv.id)) { add(inv.id); invoices++ }
    else if (inv.purchaseOrderId && model.purchaseOrders.has(inv.purchaseOrderId) && orders < 5 && !chosen.has(inv.id)) { add(inv.id); orders++ }
  }
  // 3. Items with the most attachments.
  const heavy = [...model.inventories].map((inv) => [inv, model.mapItem(inv).attachments.length]).sort((a, b) => b[1] - a[1]).slice(0, 5)
  for (const [inv] of heavy) add(inv.id)
  // 4. Fill round-robin by admin status (ALTA / BAJA / PROPUESTA) so every state is seen.
  const groups = new Map()
  for (const inv of model.inventories) {
    const status = String(inv.status ?? inv.adminStatus ?? '')
    if (!groups.has(status)) groups.set(status, [])
    groups.get(status).push(inv.id)
  }
  const queues = [...groups.values()]
  for (let i = 0; room() > 0 && queues.some((q) => q.length); i++) {
    const q = queues[i % queues.length]
    while (q.length && chosen.has(q[0])) q.shift()
    if (q.length) add(q.shift())
  }
  return [...chosen]
}

// Upload keys (relative to the uploads folder) needed by a set of items.
export function pilotFileKeys(model, itemIds) {
  const ids = new Set(itemIds ?? [])
  const keys = new Set()
  // itemIds null = the whole migration (every invoice, every custody record).
  const scope = buildScope(model, itemIds)
  for (const inv of scope.items) for (const attachment of model.mapItem(inv).attachments) keys.add(attachment.key)
  for (const id of scope.invoiceIds) for (const file of invoiceFiles(model.invoices.get(id))) keys.add(file.key)
  for (const record of model.custodyRecords) {
    if (itemIds && !(model.custodyItemsByRecord.get(record.id) ?? []).every((row) => ids.has(row.inventoryId))) continue
    for (const text of [model.filesById.get(record.fileId)?.url, record.receiverSignature, record.delivererSignature]) {
      const key = text && !String(text).startsWith('data:') ? normalizeUploadKey(text) : null
      if (key) keys.add(key)
    }
  }
  return [...keys].sort()
}
