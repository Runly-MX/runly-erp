// runly.purchases relations: single/bulk create, delete, invoice propagation
// preview/inheritance and the "Relacionar existente" document search.
import {
  KINDS, MODULE_KEY, PurchasesServiceError, broadcast, dateKey, notFound, num, pagination, plain, supplierNames, writeAudit, cleanText,
} from './purchases-shared.js'
import { PURCHASE_ENTITY_TYPES } from './purchase-relation-hydration.js'
import { assertItemsFreeOfKind, isUniqueItemRelation, itemsWithOtherDocument } from './inventory-purchase-uniqueness.js'
import { invoiceItemIds, linkItemsToInvoiceOrder } from './purchase-relation-cascade.js'

const ITEM_RELATION_TYPE = {
  purchase_order: 'PURCHASED_IN',
  purchase_invoice: 'INVOICED_ITEM',
  purchase_case: 'ACQUIRED_IN',
  purchase_receipt: 'RECEIVED_IN',
  purchase_request: 'REQUESTED_IN',
  purchase_quote: 'QUOTED_IN',
}

export function defaultRelationType(sourceType, targetType) {
  if (targetType === 'inventory_item') return ITEM_RELATION_TYPE[sourceType] ?? 'RELATED'
  if (sourceType === 'purchase_invoice' && targetType === 'purchase_order') return 'BILLED_FROM'
  if (sourceType === 'purchase_case') return 'CONTAINS'
  return 'RELATED'
}

const conflict = (message, status, code) => new PurchasesServiceError(message, status, code)
const moduleForType = type => (type === 'inventory_item' ? 'runly.inventory' : MODULE_KEY)

// Copies the inventory relations of the given orders onto an invoice
// (origin INHERITED). Receives the transaction client explicitly.
export async function inheritFromOrders(tx, { companyId, actorId, invoiceId, orderIds }) {
  if (!orderIds?.length) return 0
  const inherited = await tx.entityRelation.findMany({
    where: { companyId, sourceModule: MODULE_KEY, sourceType: 'purchase_order', sourceId: { in: orderIds }, targetType: 'inventory_item' },
  })
  if (!inherited.length) return 0
  // An item keeps a single invoice: skip the ones already invoiced by another document.
  const invoiced = new Set(await itemsWithOtherDocument(tx, companyId, 'INVOICED_ITEM', inherited.map(relation => relation.targetId), invoiceId))
  const eligible = inherited.filter(relation => !invoiced.has(relation.targetId))
  if (!eligible.length) return 0
  const result = await tx.entityRelation.createMany({
    data: eligible.map(relation => ({
      companyId, sourceModule: MODULE_KEY, sourceType: 'purchase_invoice', sourceId: invoiceId,
      targetModule: 'runly.inventory', targetType: 'inventory_item', targetId: relation.targetId,
      relationType: 'INVOICED_ITEM', origin: 'INHERITED', sourceRelationId: relation.id, createdById: actorId || null,
    })),
    skipDuplicates: true,
  })
  return result.count
}

export function createPurchaseRelationsService({ prisma, broadcaster, workflowService }) {
  async function assertEndpoint(companyId, type, id) {
    if (!id) throw new PurchasesServiceError('La relación está incompleta.')
    if (type === 'inventory_item') {
      const row = await prisma.invItem.findFirst({ where: { id, companyId, enabled: true }, select: { id: true } })
      if (!row) throw notFound('El inventario no existe o pertenece a otra empresa.')
      return
    }
    const kind = Object.keys(KINDS).find(key => KINDS[key].entityType === type)
    if (!kind) throw new PurchasesServiceError('El tipo de entidad todavía no admite relaciones de compra.', 400, 'VALIDATION')
    const row = await prisma[KINDS[kind].model].findFirst({ where: { id, companyId }, select: { id: true } })
    if (!row) throw notFound('La entidad no existe o pertenece a otra empresa.')
  }

  async function assertInventoryCapability(companyId, ...types) {
    if (types.includes('inventory_item')) await workflowService.assertCapability(companyId, 'inventoryRelations')
  }

  async function createRelation(companyId, actorId, input = {}) {
    const sourceType = input.sourceType
    const targetType = input.targetType
    if (!sourceType || !targetType || !input.sourceId || !input.targetId) throw new PurchasesServiceError('La relación está incompleta.')
    if (!PURCHASE_ENTITY_TYPES.includes(sourceType) && !PURCHASE_ENTITY_TYPES.includes(targetType)) {
      throw new PurchasesServiceError('Al menos un extremo de la relación debe ser un documento de compra.')
    }
    if (sourceType === targetType && input.sourceId === input.targetId) throw new PurchasesServiceError('Una entidad no puede relacionarse consigo misma.')
    await assertInventoryCapability(companyId, sourceType, targetType)
    await assertEndpoint(companyId, sourceType, input.sourceId)
    await assertEndpoint(companyId, targetType, input.targetId)
    const data = {
      companyId,
      sourceModule: moduleForType(sourceType), sourceType, sourceId: input.sourceId,
      targetModule: moduleForType(targetType), targetType, targetId: input.targetId,
      relationType: cleanText(input.relationType, 80) || defaultRelationType(sourceType, targetType),
      origin: ['MANUAL', 'INHERITED', 'AUTOMATIC'].includes(input.origin) ? input.origin : 'MANUAL',
      metadata: input.metadata ?? undefined,
      createdById: actorId || null,
    }
    const existing = await prisma.entityRelation.findFirst({
      where: { companyId, sourceModule: data.sourceModule, sourceType, sourceId: data.sourceId, targetModule: data.targetModule, targetType, targetId: data.targetId, relationType: data.relationType },
    })
    if (existing) return existing
    if (data.relationType === 'BILLED_FROM' && sourceType === 'purchase_invoice' && targetType === 'purchase_order') {
      const other = await prisma.entityRelation.findFirst({ where: { companyId, sourceModule: MODULE_KEY, sourceType, sourceId: data.sourceId, targetType, relationType: 'BILLED_FROM' } })
      if (other) throw conflict('La factura ya está relacionada con otra orden de compra.', 409, 'INVOICE_HAS_ORDER')
    }
    const singleLink = isUniqueItemRelation(data.relationType) && targetType === 'inventory_item'
    // `replace: true` ("Cambiar" in the item card) swaps the item's current document atomically.
    const replace = singleLink && input.replace === true
    if (singleLink && !replace) await assertItemsFreeOfKind(prisma, companyId, data.relationType, [data.targetId], data.sourceId, conflict)
    let cascade = null
    const relation = await prisma.$transaction(async tx => {
      if (replace) {
        const removed = await tx.entityRelation.deleteMany({
          where: { companyId, sourceModule: MODULE_KEY, targetModule: 'runly.inventory', targetType, targetId: data.targetId, relationType: data.relationType, sourceId: { not: data.sourceId } },
        })
        if (removed.count) await writeAudit(tx, { companyId, actorId, entityType: 'entity_relation', entityId: data.targetId, action: 'purchase.relation.replaced', metadata: { relationType: data.relationType, removed: removed.count } })
      }
      const value = await tx.entityRelation.create({ data })
      await writeAudit(tx, { companyId, actorId, entityType: 'entity_relation', entityId: value.id, action: 'purchase.relation.created', after: value })
      if (data.relationType === 'INVOICED_ITEM' && targetType === 'inventory_item') {
        cascade = await linkItemsToInvoiceOrder(tx, { companyId, actorId, invoiceId: data.sourceId, itemIds: [data.targetId] })
      } else if (data.relationType === 'BILLED_FROM' && sourceType === 'purchase_invoice' && targetType === 'purchase_order') {
        cascade = await linkItemsToInvoiceOrder(tx, { companyId, actorId, invoiceId: data.sourceId, itemIds: await invoiceItemIds(tx, companyId, data.sourceId), orderId: data.targetId })
      }
      return value
    })
    await broadcast(broadcaster, companyId, 'purchase.relation.created', { relationId: relation.id, sourceType, sourceId: relation.sourceId, targetType, targetId: relation.targetId })
    return cascade?.linked || cascade?.skipped ? { ...relation, cascade } : relation
  }

  async function bulkRelate(companyId, actorId, input = {}) {
    const { sourceType, sourceId } = input
    const targetType = input.targetType || 'inventory_item'
    if (targetType !== 'inventory_item') throw new PurchasesServiceError('La vinculación múltiple solo admite inventarios.')
    if (!PURCHASE_ENTITY_TYPES.includes(sourceType)) throw new PurchasesServiceError('El documento de origen no es válido.')
    const targetIds = [...new Set((input.targetIds ?? []).filter(Boolean))]
    if (!targetIds.length) throw new PurchasesServiceError('Selecciona al menos un inventario.')
    if (targetIds.length > 200) throw new PurchasesServiceError('Puedes vincular hasta 200 inventarios a la vez.')
    await assertInventoryCapability(companyId, targetType)
    await assertEndpoint(companyId, sourceType, sourceId)
    const items = await prisma.invItem.findMany({ where: { companyId, id: { in: targetIds }, enabled: true }, select: { id: true } })
    if (items.length !== targetIds.length) throw notFound('Uno o más inventarios no existen o pertenecen a otra empresa.')
    const relationType = defaultRelationType(sourceType, targetType)
    await assertItemsFreeOfKind(prisma, companyId, relationType, targetIds, sourceId, conflict)
    let cascade = null
    const result = await prisma.$transaction(async tx => {
      const created = await tx.entityRelation.createMany({
        data: targetIds.map(targetId => ({
          companyId, sourceModule: MODULE_KEY, sourceType, sourceId, targetModule: 'runly.inventory', targetType, targetId,
          relationType, origin: 'MANUAL', createdById: actorId || null,
        })),
        skipDuplicates: true,
      })
      await writeAudit(tx, { companyId, actorId, entityType: sourceType, entityId: sourceId, action: 'purchase.relation.bulk_created', metadata: { targetType, targetIds, created: created.count } })
      if (sourceType === 'purchase_invoice') cascade = await linkItemsToInvoiceOrder(tx, { companyId, actorId, invoiceId: sourceId, itemIds: targetIds })
      return created
    })
    await broadcast(broadcaster, companyId, 'purchase.relation.created', { sourceType, sourceId, targetType, targetIds, bulk: true })
    return { created: result.count, skipped: targetIds.length - result.count, ...(cascade?.orderId ? { cascade } : {}) }
  }

  async function deleteRelation(companyId, actorId, id) {
    const relation = await prisma.entityRelation.findFirst({ where: { id, companyId } })
    if (!relation) throw notFound('La relación no existe.')
    if (relation.sourceModule !== MODULE_KEY && relation.targetModule !== MODULE_KEY) throw notFound('La relación no existe.')
    await prisma.$transaction(async tx => {
      await tx.entityRelation.delete({ where: { id } })
      await writeAudit(tx, { companyId, actorId, entityType: 'entity_relation', entityId: id, action: 'purchase.relation.deleted', before: relation })
    })
    await broadcast(broadcaster, companyId, 'purchase.relation.deleted', { relationId: id, sourceType: relation.sourceType, sourceId: relation.sourceId, targetType: relation.targetType, targetId: relation.targetId })
  }

  // Items linked to the orders but not yet to the invoice.
  async function propagationPreview(companyId, { invoiceId, orderIds } = {}) {
    const ids = [...new Set((Array.isArray(orderIds) ? orderIds : String(orderIds ?? '').split(',')).map(value => String(value).trim()).filter(Boolean))]
    if (!ids.length) return []
    const orders = await prisma.purchaseOrder.findMany({ where: { companyId, id: { in: ids } }, select: { id: true, number: true } })
    if (orders.length !== ids.length) throw notFound('Una o más órdenes no existen o pertenecen a otra empresa.')
    if (invoiceId) {
      const invoice = await prisma.purchaseInvoice.findFirst({ where: { id: invoiceId, companyId }, select: { id: true } })
      if (!invoice) throw notFound('La factura no existe o pertenece a otra empresa.')
    }
    const relations = await prisma.entityRelation.findMany({
      where: { companyId, sourceModule: MODULE_KEY, sourceType: 'purchase_order', sourceId: { in: ids }, targetType: 'inventory_item' },
    })
    const already = invoiceId
      ? new Set((await prisma.entityRelation.findMany({
        where: { companyId, sourceModule: MODULE_KEY, sourceType: 'purchase_invoice', sourceId: invoiceId, targetType: 'inventory_item' },
        select: { targetId: true },
      })).map(row => row.targetId))
      : new Set()
    const pending = relations.filter(relation => !already.has(relation.targetId))
    const items = pending.length
      ? await prisma.invItem.findMany({ where: { companyId, id: { in: pending.map(relation => relation.targetId) }, enabled: true }, select: { id: true, name: true, assetTag: true, status: true } })
      : []
    const itemMap = new Map(items.map(item => [item.id, item]))
    const orderMap = new Map(orders.map(order => [order.id, order]))
    const seen = new Set()
    return pending
      .filter(relation => itemMap.has(relation.targetId) && !seen.has(relation.targetId) && seen.add(relation.targetId))
      .map(relation => {
        const item = itemMap.get(relation.targetId)
        return { itemId: item.id, assetTag: item.assetTag, name: item.name, status: item.status, orderId: relation.sourceId, orderNumber: orderMap.get(relation.sourceId)?.number ?? null, relationId: relation.id }
      })
  }

  // Documents of `kind` whose supplier name matches the text, or that are
  // billed from / billing a document of the other kind whose folio matches.
  async function matchesBySupplierOrLinkedDocument(companyId, kind, search) {
    const contains = { contains: search, mode: 'insensitive' }
    const suppliers = await prisma.contact.findMany({ where: { companyId, name: contains }, select: { id: true }, take: 50 })
    const otherModel = kind === 'invoices' ? 'purchaseOrder' : 'purchaseInvoice'
    const others = await prisma[otherModel].findMany({ where: { companyId, number: contains }, select: { id: true }, take: 30 })
    let documentIds = []
    if (others.length) {
      const ids = others.map(row => row.id)
      const relations = await prisma.entityRelation.findMany({
        where: {
          companyId, sourceModule: MODULE_KEY, targetModule: MODULE_KEY, sourceType: 'purchase_invoice', targetType: 'purchase_order', relationType: 'BILLED_FROM',
          ...(kind === 'invoices' ? { targetId: { in: ids } } : { sourceId: { in: ids } }),
        },
        select: { sourceId: true, targetId: true },
      })
      documentIds = relations.map(row => (kind === 'invoices' ? row.sourceId : row.targetId))
    }
    return { supplierIds: suppliers.map(row => row.id), documentIds }
  }

  // invoiceId -> { id, number, supplierName } of the order it bills (an invoice has at most one).
  async function orderOfInvoices(companyId, invoiceIds) {
    if (!invoiceIds.length) return new Map()
    const relations = await prisma.entityRelation.findMany({
      where: { companyId, sourceModule: MODULE_KEY, sourceType: 'purchase_invoice', sourceId: { in: invoiceIds }, targetType: 'purchase_order', relationType: 'BILLED_FROM' },
      orderBy: { createdAt: 'desc' },
    })
    const orders = await prisma.purchaseOrder.findMany({ where: { companyId, id: { in: relations.map(row => row.targetId) } }, select: { id: true, number: true, supplierId: true, status: true } })
    const names = await supplierNames(prisma, companyId, orders.map(order => order.supplierId))
    const byId = new Map(orders.map(order => [order.id, { id: order.id, number: order.number, status: order.status, supplierName: names.get(order.supplierId) ?? null }]))
    const out = new Map()
    for (const relation of relations) if (byId.has(relation.targetId) && !out.has(relation.sourceId)) out.set(relation.sourceId, byId.get(relation.targetId))
    return out
  }

  // "Relacionar existente": orders or invoices of the company.
  async function searchDocuments(companyId, query = {}) {
    const type = String(query.type ?? 'order').toLowerCase().replace(/s$/, '')
    const kind = type === 'invoice' ? 'invoices' : type === 'order' ? 'orders' : null
    if (!kind) throw new PurchasesServiceError('Tipo de documento no válido.')
    await workflowService.assertCapability(companyId, KINDS[kind].capability)
    const { page, pageSize, skip, take } = pagination(query, { defaultSize: 10, max: 50 })
    const search = cleanText(query.search, 120)
    const model = prisma[KINDS[kind].model]
    const extra = search ? await matchesBySupplierOrLinkedDocument(companyId, kind, search) : null
    const where = {
      companyId,
      status: { not: 'CANCELLED' },
      ...(search ? { OR: [
        { number: { contains: search, mode: 'insensitive' } },
        { notes: { contains: search, mode: 'insensitive' } },
        ...(kind === 'orders' ? [{ supplierReference: { contains: search, mode: 'insensitive' } }] : []),
        ...(extra?.supplierIds.length ? [{ supplierId: { in: extra.supplierIds } }] : []),
        ...(extra?.documentIds.length ? [{ id: { in: extra.documentIds } }] : []),
      ] } : {}),
    }
    const [rows, total] = await Promise.all([
      model.findMany({ where, orderBy: { issueDate: 'desc' }, skip, take }),
      model.count({ where }),
    ])
    const names = await supplierNames(prisma, companyId, rows.map(row => row.supplierId))
    const orders = kind === 'invoices' ? await orderOfInvoices(companyId, rows.map(row => row.id)) : new Map()
    const data = rows.map(row => ({
      ...plain(row), type: KINDS[kind].entityType, kind, supplierName: names.get(row.supplierId) ?? null,
      ...(kind === 'invoices' ? { order: orders.get(row.id) ?? null } : {}),
      date: dateKey(row.issueDate), total: num(row.total), path: `${KINDS[kind].path}/${row.id}`,
    }))
    return { data, total, page, pageSize }
  }

  return { createRelation, bulkRelate, deleteRelation, propagationPreview, searchDocuments, assertEndpoint }
}
