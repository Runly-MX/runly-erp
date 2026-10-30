// An invoice that bills an order pulls its inventory items into that order:
// relating an item to the invoice also relates it to the invoice's order, and
// billing an invoice from an order does the same for the items it already has.
// Items that already carry another order are left alone and counted as skipped.
// Receives the transaction client explicitly.
import { MODULE_KEY, writeAudit } from './purchases-shared.js'
import { liveDocumentIds } from './inventory-purchase-uniqueness.js'

export async function orderOfInvoice(client, companyId, invoiceId) {
  const relation = await client.entityRelation.findFirst({
    where: { companyId, sourceModule: MODULE_KEY, sourceType: 'purchase_invoice', sourceId: invoiceId, targetType: 'purchase_order', relationType: 'BILLED_FROM' },
    orderBy: { createdAt: 'desc' },
    select: { targetId: true },
  })
  return relation?.targetId ?? null
}

export async function invoiceItemIds(client, companyId, invoiceId) {
  const rows = await client.entityRelation.findMany({
    where: { companyId, sourceModule: MODULE_KEY, sourceType: 'purchase_invoice', sourceId: invoiceId, targetType: 'inventory_item', relationType: 'INVOICED_ITEM' },
    select: { targetId: true },
  })
  return rows.map(row => row.targetId)
}

// Returns { orderId, linked, skipped } (orderId null when the invoice has no order).
export async function linkItemsToInvoiceOrder(tx, { companyId, actorId, invoiceId, itemIds, orderId = null }) {
  const targetOrderId = orderId ?? await orderOfInvoice(tx, companyId, invoiceId)
  const ids = [...new Set(itemIds ?? [])]
  if (!targetOrderId || !ids.length) return { orderId: targetOrderId, linked: 0, skipped: 0 }
  const existing = await tx.entityRelation.findMany({
    where: { companyId, sourceModule: MODULE_KEY, sourceType: 'purchase_order', targetType: 'inventory_item', relationType: 'PURCHASED_IN', targetId: { in: ids } },
    select: { targetId: true, sourceId: true },
  })
  // Only live orders count: an item whose order was cancelled can take the invoice's order.
  const live = await liveDocumentIds(tx, companyId, 'PURCHASED_IN', existing.map(row => row.sourceId))
  const withOrder = new Map(existing.filter(row => live.has(row.sourceId)).map(row => [row.targetId, row.sourceId]))
  const pending = ids.filter(id => !withOrder.has(id))
  const skipped = ids.filter(id => withOrder.has(id) && withOrder.get(id) !== targetOrderId).length
  if (pending.length) {
    await tx.entityRelation.createMany({
      data: pending.map(targetId => ({
        companyId, sourceModule: MODULE_KEY, sourceType: 'purchase_order', sourceId: targetOrderId,
        targetModule: 'runly.inventory', targetType: 'inventory_item', targetId,
        relationType: 'PURCHASED_IN', origin: 'AUTOMATIC', createdById: actorId || null,
      })),
      skipDuplicates: true,
    })
    await writeAudit(tx, {
      companyId, actorId, entityType: 'purchase_invoice', entityId: invoiceId, action: 'purchase.relation.order_from_invoice',
      metadata: { orderId: targetOrderId, itemIds: pending },
    })
  }
  return { orderId: targetOrderId, linked: pending.length, skipped }
}
