// One purchase order and one invoice per inventory item (a document may still
// cover many items). The rule is per item and per relation type, and counts
// only live documents: a cancelled order or invoice keeps its relation as
// history but no longer occupies the item's slot.
import { MODULE_KEY } from './purchases-shared.js'

export const UNIQUE_ITEM_RELATIONS = {
  PURCHASED_IN: { noun: 'orden de compra', field: 'Orden de compra', model: 'purchaseOrder' },
  INVOICED_ITEM: { noun: 'factura', field: 'Factura', model: 'purchaseInvoice' },
}

export const isUniqueItemRelation = relationType => relationType in UNIQUE_ITEM_RELATIONS

export function duplicateLinkMessage(relationType, count = 1) {
  const meta = UNIQUE_ITEM_RELATIONS[relationType]
  if (count > 1) return `${count} equipos ya tienen ${meta.noun === 'factura' ? 'una factura' : 'una orden de compra'}: cámbiala desde el campo ${meta.field} de cada equipo.`
  return `Este equipo ya tiene ${meta.noun === 'factura' ? 'una factura' : 'una orden de compra'}: cámbiala desde el campo ${meta.field}.`
}

// Ids (of `documentIds`) whose document of the relation's kind is live.
export async function liveDocumentIds(client, companyId, relationType, documentIds) {
  const ids = [...new Set((documentIds ?? []).filter(Boolean))]
  if (!ids.length || !isUniqueItemRelation(relationType)) return new Set()
  const rows = await client[UNIQUE_ITEM_RELATIONS[relationType].model].findMany({
    where: { companyId, id: { in: ids }, status: { not: 'CANCELLED' } },
    select: { id: true },
  })
  return new Set(rows.map(row => row.id))
}

// Item ids (of `itemIds`) that already carry a `relationType` link from a
// live document other than `documentId`.
export async function itemsWithOtherDocument(client, companyId, relationType, itemIds, documentId = null) {
  if (!isUniqueItemRelation(relationType) || !itemIds?.length) return []
  const rows = await client.entityRelation.findMany({
    where: {
      companyId, sourceModule: MODULE_KEY, targetModule: 'runly.inventory', targetType: 'inventory_item',
      relationType, targetId: { in: itemIds }, ...(documentId ? { sourceId: { not: documentId } } : {}),
    },
    select: { targetId: true, sourceId: true },
  })
  if (!rows.length) return []
  const live = await liveDocumentIds(client, companyId, relationType, rows.map(row => row.sourceId))
  return [...new Set(rows.filter(row => live.has(row.sourceId)).map(row => row.targetId))]
}

// Throws `fail(message, 409)` when any item already has another live document of that kind.
export async function assertItemsFreeOfKind(client, companyId, relationType, itemIds, documentId, fail) {
  const taken = await itemsWithOtherDocument(client, companyId, relationType, itemIds, documentId)
  if (taken.length) throw fail(duplicateLinkMessage(relationType, taken.length), 409, 'ITEM_LINK_EXISTS')
}

// Serialises link writes of the same items and kind inside a transaction, so
// two documents linking one item at once cannot both pass the check. Locks are
// taken in a stable order in one statement (no deadlock between batches).
export async function lockItemLinks(tx, companyId, relationType, itemIds) {
  const keys = [...new Set((itemIds ?? []).filter(Boolean))].map(id => `inv-link:${companyId}:${relationType}:${id}`).sort()
  if (!keys.length || !isUniqueItemRelation(relationType)) return
  await tx.$queryRaw`SELECT count(pg_advisory_xact_lock(hashtext(k)))::int AS locked FROM (SELECT unnest(${keys}::text[]) AS k ORDER BY 1) AS ordered`
}

// The check that counts: lock, then re-read inside the transaction.
export async function assertItemsFreeInTx(tx, companyId, relationType, itemIds, documentId, fail) {
  await lockItemLinks(tx, companyId, relationType, itemIds)
  await assertItemsFreeOfKind(tx, companyId, relationType, itemIds, documentId, fail)
}

// Pure. rows: [{ relationType, targetId, sourceId }] -> items with more than one
// link of a kind (distinct documents), for the read-only diagnostic.
export function findDuplicateLinks(rows = []) {
  const groups = new Map()
  for (const row of rows) {
    if (!isUniqueItemRelation(row.relationType)) continue
    const key = `${row.targetId}:${row.relationType}`
    if (!groups.has(key)) groups.set(key, { itemId: row.targetId, relationType: row.relationType, documentIds: new Set() })
    groups.get(key).documentIds.add(row.sourceId)
  }
  return [...groups.values()].filter(g => g.documentIds.size > 1).map(g => ({ ...g, documentIds: [...g.documentIds] }))
}

// Read-only: lists items that currently have several orders or invoices.
export async function reportDuplicateItemLinks(client, companyId) {
  const rows = await client.entityRelation.findMany({
    where: { companyId, sourceModule: MODULE_KEY, targetType: 'inventory_item', relationType: { in: Object.keys(UNIQUE_ITEM_RELATIONS) } },
    select: { relationType: true, targetId: true, sourceId: true },
  })
  return findDuplicateLinks(rows)
}
