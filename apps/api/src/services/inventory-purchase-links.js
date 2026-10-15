// Purchase order / invoice of an inventory item as first-class fields.
// The links are EntityRelation rows owned by runly.purchases (PURCHASED_IN for
// orders, INVOICED_ITEM for invoices). The item form sends `purchaseOrderId` /
// `purchaseInvoiceId`; changes are applied in the same transaction as the item
// write. An item has exactly one order and one invoice: setting or clearing a
// kind replaces/removes EVERY existing link of that kind (including legacy
// duplicates), atomically with the item write.
import { MODULE_KEY, supplierNames, writeAudit } from './purchases-shared.js'

export const PURCHASE_LINK_KINDS = {
  order: { field: 'purchaseOrderId', sourceType: 'purchase_order', relationType: 'PURCHASED_IN', model: 'purchaseOrder', path: '/purchases/orders' },
  invoice: { field: 'purchaseInvoiceId', sourceType: 'purchase_invoice', relationType: 'INVOICED_ITEM', model: 'purchaseInvoice', path: '/purchases/invoices' },
}
const KIND_KEYS = Object.keys(PURCHASE_LINK_KINDS)

const STATUS_LABELS = {
  DRAFT: 'Borrador', SUBMITTED: 'Enviada', PENDING_APPROVAL: 'Por aprobar', APPROVED: 'Aprobada', REJECTED: 'Rechazada', ORDERED: 'Ordenada',
  ISSUED: 'Emitida', PARTIALLY_RECEIVED: 'Recepción parcial', RECEIVED: 'Recibida', COMPLETED: 'Completada', PENDING: 'Por pagar',
  PARTIALLY_PAID: 'Pago parcial', PAID: 'Pagada', CLOSED: 'Cerrada', CANCELLED: 'Cancelada',
}

// Which links the payload asks to change: undefined = untouched, null/'' = clear.
export function requestedPurchaseLinks(body = {}) {
  const out = {}
  for (const kind of KIND_KEYS) {
    const value = body?.[PURCHASE_LINK_KINDS[kind].field]
    if (value === undefined) continue
    out[kind] = value === null || value === '' ? null : String(value)
  }
  return out
}

export function withoutPurchaseLinkFields(body = {}) {
  const copy = { ...body }
  for (const kind of KIND_KEYS) delete copy[PURCHASE_LINK_KINDS[kind].field]
  return copy
}

// Pure. current: { order: { relationId, documentId } | null, invoice: ... }.
// Returns the relation rows to delete and the documents to link.
export function planPurchaseLinkChanges(current = {}, desired = {}) {
  const remove = []
  const add = []
  for (const kind of KIND_KEYS) {
    if (!(kind in desired)) continue
    const target = desired[kind] ?? null
    const existing = current[kind] ?? null
    const ids = existing?.relationIds ?? (existing ? [existing.relationId] : [])
    if (target !== null && existing?.documentId === target) {
      // Same document shown: just drop any extra legacy links of this kind.
      remove.push(...ids.filter(id => id !== existing?.relationId))
      continue
    }
    remove.push(...ids)
    if (target) add.push({ kind, documentId: target })
  }
  return { remove, add }
}

// Newest relation of each kind for the item, with the document summary.
export async function loadPurchaseLinks(client, companyId, itemId) {
  const relations = await client.entityRelation.findMany({
    where: {
      companyId, sourceModule: MODULE_KEY, targetModule: 'runly.inventory', targetType: 'inventory_item', targetId: itemId,
      sourceType: { in: KIND_KEYS.map(kind => PURCHASE_LINK_KINDS[kind].sourceType) },
      relationType: { in: KIND_KEYS.map(kind => PURCHASE_LINK_KINDS[kind].relationType) },
    },
    orderBy: { createdAt: 'desc' },
  })
  const out = { order: null, invoice: null }
  for (const kind of KIND_KEYS) {
    const meta = PURCHASE_LINK_KINDS[kind]
    const rows = relations.filter(row => row.sourceType === meta.sourceType && row.relationType === meta.relationType)
    if (!rows.length) continue
    const docs = await client[meta.model].findMany({
      where: { companyId, id: { in: rows.map(row => row.sourceId) } },
      select: { id: true, number: true, status: true, supplierId: true },
    })
    const relation = rows.find(row => docs.some(doc => doc.id === row.sourceId))
    const relationIds = rows.map(row => row.id)
    const doc = relation && docs.find(entry => entry.id === relation.sourceId)
    if (!doc) {
      // Only dangling links: still expose them so a replace/clear removes them.
      out[kind] = { relationId: null, documentId: null, relationIds }
      continue
    }
    const names = await supplierNames(client, companyId, [doc.supplierId])
    out[kind] = {
      relationId: relation.id, relationIds, documentId: doc.id, id: doc.id, number: doc.number, status: doc.status, statusLabel: STATUS_LABELS[doc.status] ?? null,
      supplierName: names.get(doc.supplierId) ?? null, path: `${meta.path}/${doc.id}`,
    }
  }
  return out
}

// List columns: itemId -> { purchaseOrderNumber, purchaseInvoiceNumber } in two queries per page.
export async function loadPurchaseNumbersForItems(client, companyId, itemIds) {
  const out = new Map()
  if (!itemIds.length) return out
  const relations = await client.entityRelation.findMany({
    where: {
      companyId, sourceModule: MODULE_KEY, targetModule: 'runly.inventory', targetType: 'inventory_item', targetId: { in: itemIds },
      sourceType: { in: KIND_KEYS.map(kind => PURCHASE_LINK_KINDS[kind].sourceType) },
      relationType: { in: KIND_KEYS.map(kind => PURCHASE_LINK_KINDS[kind].relationType) },
    },
    orderBy: { createdAt: 'desc' },
  })
  for (const kind of KIND_KEYS) {
    const meta = PURCHASE_LINK_KINDS[kind]
    const rows = relations.filter(row => row.sourceType === meta.sourceType && row.relationType === meta.relationType)
    if (!rows.length) continue
    const docs = await client[meta.model].findMany({ where: { companyId, id: { in: [...new Set(rows.map(row => row.sourceId))] } }, select: { id: true, number: true } })
    const numbers = new Map(docs.map(doc => [doc.id, doc.number]))
    for (const row of rows) {
      const number = numbers.get(row.sourceId)
      const entry = out.get(row.targetId) ?? {}
      if (number && entry[`${kind}Number`] === undefined) out.set(row.targetId, { ...entry, [`${kind}Number`]: number })
    }
  }
  return new Map([...out].map(([id, value]) => [id, { purchaseOrderNumber: value.orderNumber ?? null, purchaseInvoiceNumber: value.invoiceNumber ?? null }]))
}

// Fields merged into the item detail/form payload.
export function purchaseLinkFields(links) {
  return {
    purchaseOrderId: links.order?.id ?? null,
    purchaseInvoiceId: links.invoice?.id ?? null,
    purchaseOrderLink: links.order?.id ? stripIds(links.order) : null,
    purchaseInvoiceLink: links.invoice?.id ? stripIds(links.invoice) : null,
  }
}
const stripIds = ({ relationId: _relationId, relationIds: _relationIds, documentId: _documentId, ...rest }) => rest

// Validates the request and returns `{ afterWrite }` (null when nothing to do).
// `fail(message, status)` throws the caller's error type.
export async function preparePurchaseLinks({ prisma, companyId, actorId, itemId = null, body, canManage, fail }) {
  const desired = requestedPurchaseLinks(body)
  if (!Object.keys(desired).length) return { afterWrite: null }
  const current = itemId ? await loadPurchaseLinks(prisma, companyId, itemId) : { order: null, invoice: null }
  const plan = planPurchaseLinkChanges(current, desired)
  if (!plan.remove.length && !plan.add.length) return { afterWrite: null }
  if (!canManage) throw fail('No tienes permiso para relacionar compras con este activo.', 403)
  for (const { kind, documentId } of plan.add) {
    const meta = PURCHASE_LINK_KINDS[kind]
    const row = await prisma[meta.model].findFirst({ where: { id: documentId, companyId }, select: { id: true, status: true } })
    if (!row) throw fail('El documento de compra no existe o pertenece a otra empresa.', 404)
    if (row.status === 'CANCELLED') throw fail('El documento de compra está cancelado.', 409)
  }
  const afterWrite = async (tx, item) => {
    const live = await loadPurchaseLinks(tx, companyId, item.id)
    const { remove, add } = planPurchaseLinkChanges(live, desired)
    if (remove.length) await tx.entityRelation.deleteMany({ where: { id: { in: remove }, companyId } })
    if (add.length) {
      await tx.entityRelation.createMany({
        data: add.map(({ kind, documentId }) => ({
          companyId, sourceModule: MODULE_KEY, sourceType: PURCHASE_LINK_KINDS[kind].sourceType, sourceId: documentId,
          targetModule: 'runly.inventory', targetType: 'inventory_item', targetId: item.id,
          relationType: PURCHASE_LINK_KINDS[kind].relationType, origin: 'MANUAL', createdById: actorId || null,
        })),
        skipDuplicates: true,
      })
    }
    await writeAudit(tx, {
      companyId, actorId, entityType: 'entity_relation', entityId: item.id, action: 'purchase.relation.item_form',
      metadata: { itemId: item.id, removed: remove, added: add },
    })
  }
  return { afterWrite }
}

// Runs the item-write hooks one after the other inside the same transaction.
export function composeAfterWrite(...hooks) {
  const list = hooks.filter(Boolean)
  if (!list.length) return null
  return async (tx, item) => { for (const hook of list) await hook(tx, item) }
}
