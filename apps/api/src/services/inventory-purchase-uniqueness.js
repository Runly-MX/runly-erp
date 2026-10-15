// One purchase order and one invoice per inventory item (a document may still
// cover many items). The rule is per item and per relation type.
import { MODULE_KEY } from './purchases-shared.js'

export const UNIQUE_ITEM_RELATIONS = {
  PURCHASED_IN: { noun: 'orden de compra', field: 'Orden de compra' },
  INVOICED_ITEM: { noun: 'factura', field: 'Factura' },
}

export const isUniqueItemRelation = relationType => relationType in UNIQUE_ITEM_RELATIONS

export function duplicateLinkMessage(relationType, count = 1) {
  const meta = UNIQUE_ITEM_RELATIONS[relationType]
  if (count > 1) return `${count} equipos ya tienen ${meta.noun === 'factura' ? 'una factura' : 'una orden de compra'}: cámbiala desde el campo ${meta.field} de cada equipo.`
  return `Este equipo ya tiene ${meta.noun === 'factura' ? 'una factura' : 'una orden de compra'}: cámbiala desde el campo ${meta.field}.`
}

// Item ids (of `itemIds`) that already carry a `relationType` link from a
// document other than `documentId`.
export async function itemsWithOtherDocument(client, companyId, relationType, itemIds, documentId = null) {
  if (!isUniqueItemRelation(relationType) || !itemIds?.length) return []
  const rows = await client.entityRelation.findMany({
    where: {
      companyId, sourceModule: MODULE_KEY, targetModule: 'runly.inventory', targetType: 'inventory_item',
      relationType, targetId: { in: itemIds }, ...(documentId ? { sourceId: { not: documentId } } : {}),
    },
    select: { targetId: true },
  })
  return [...new Set(rows.map(row => row.targetId))]
}

// Throws `fail(message, 409)` when any item already has another document of that kind.
export async function assertItemsFreeOfKind(client, companyId, relationType, itemIds, documentId, fail) {
  const taken = await itemsWithOtherDocument(client, companyId, relationType, itemIds, documentId)
  if (taken.length) throw fail(duplicateLinkMessage(relationType, taken.length), 409, 'ITEM_LINK_EXISTS')
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
