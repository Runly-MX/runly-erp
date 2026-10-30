// Generic, company-scoped list endpoint for every purchase document kind.
// Envelope: { data, total, page, pageSize, pagination }.
import { toLocalIso } from '@runly/core'
import { KINDS, MODULE_KEY, cleanText, dateKey, num, pagination, plain, statusFilter, supplierNames } from './purchases-shared.js'
import { billingSummary, receiptSummary } from './purchase-order-progress.js'

const SEARCH_FIELDS = {
  cases: ['number', 'title'],
  requests: ['number', 'title'],
  quotes: ['reference', 'notes'],
  orders: ['number', 'notes', 'supplierReference'],
  receipts: ['number', 'notes'],
  invoices: ['number', 'notes', 'fiscalUuid'],
}
const WITH_SUPPLIER = new Set(['cases', 'quotes', 'orders', 'invoices'])
// Documents that point at inventory items, and the relation type used.
const ITEM_LINK = { orders: ['purchase_order', 'PURCHASED_IN'], invoices: ['purchase_invoice', 'INVOICED_ITEM'], receipts: ['purchase_receipt', 'RECEIVED_IN'] }
const ITEM_PREVIEW = 3
const DATE_FIELD = { quotes: 'issueDate', orders: 'issueDate', invoices: 'issueDate', receipts: 'receivedAt' }

export function createPurchaseListing({ prisma }) {
  // Documents whose inventory items match the text by asset number, serial or name.
  async function documentIdsByItem(kind, companyId, search) {
    const link = ITEM_LINK[kind]
    if (!link) return []
    const contains = { contains: search, mode: 'insensitive' }
    const items = await prisma.invItem.findMany({
      where: { companyId, enabled: true, OR: [{ assetTag: contains }, { serialNumber: contains }, { name: contains }] },
      select: { id: true }, take: 100,
    })
    if (!items.length) return []
    const relations = await prisma.entityRelation.findMany({
      where: { companyId, sourceModule: MODULE_KEY, sourceType: link[0], relationType: link[1], targetType: 'inventory_item', targetId: { in: items.map(item => item.id) } },
      select: { sourceId: true },
    })
    return [...new Set(relations.map(row => row.sourceId))]
  }

  // docId -> { count, preview: [{ id, assetTag, serialNumber, name }] } in two queries per page.
  async function itemsByDocument(kind, companyId, ids) {
    const out = new Map()
    const link = ITEM_LINK[kind]
    if (!link || !ids.length) return out
    const relations = await prisma.entityRelation.findMany({
      where: { companyId, sourceModule: MODULE_KEY, sourceType: link[0], relationType: link[1], targetType: 'inventory_item', sourceId: { in: ids } },
      select: { sourceId: true, targetId: true }, orderBy: { createdAt: 'asc' },
    })
    if (!relations.length) return out
    const items = await prisma.invItem.findMany({
      where: { companyId, enabled: true, id: { in: [...new Set(relations.map(row => row.targetId))] } },
      select: { id: true, assetTag: true, serialNumber: true, name: true },
    })
    const byId = new Map(items.map(item => [item.id, item]))
    for (const row of relations) {
      const item = byId.get(row.targetId)
      if (!item) continue
      const entry = out.get(row.sourceId) ?? { count: 0, preview: [] }
      entry.count += 1
      if (entry.preview.length < ITEM_PREVIEW) entry.preview.push(item)
      out.set(row.sourceId, entry)
    }
    return out
  }

  // invoiceId -> number of the order it bills.
  async function orderNumbersOfInvoices(companyId, ids) {
    const out = new Map()
    if (!ids.length) return out
    const relations = await prisma.entityRelation.findMany({
      where: { companyId, sourceModule: MODULE_KEY, sourceType: 'purchase_invoice', relationType: 'BILLED_FROM', targetType: 'purchase_order', sourceId: { in: ids } },
      select: { sourceId: true, targetId: true },
    })
    if (!relations.length) return out
    const orders = await prisma.purchaseOrder.findMany({ where: { companyId, id: { in: relations.map(row => row.targetId) } }, select: { id: true, number: true } })
    const numbers = new Map(orders.map(order => [order.id, order.number]))
    for (const row of relations) if (numbers.has(row.targetId) && !out.has(row.sourceId)) out.set(row.sourceId, numbers.get(row.targetId))
    return out
  }

  // Receipt reversals arrived with a later migration: probe the table once a minute.
  let reversalProbe = null
  async function reversalsAvailable() {
    if (reversalProbe && reversalProbe.expires > Date.now()) return reversalProbe.value
    let row = null
    try { [row] = await prisma.$queryRaw`SELECT to_regclass('public.purchase_receipt_reversal')::text AS name` } catch { row = null }
    reversalProbe = { value: Boolean(row?.name), expires: Date.now() + 60_000 }
    return reversalProbe.value
  }

  // orderId -> { receipt, billing } for one page of orders, in a fixed number
  // of queries whatever the page size. `billing` is null when the caller
  // cannot read invoices.
  async function orderProgress(companyId, rows, canRead) {
    const out = new Map()
    if (!rows.length) return out
    const ids = rows.map(row => row.id)
    const readInvoices = canRead('purchase_invoice')
    const [lines, reversals, billed] = await Promise.all([
      prisma.purchaseLine.findMany({ where: { companyId, ownerType: 'PURCHASE_ORDER', ownerId: { in: ids } }, select: { ownerId: true, quantity: true, receivedQuantity: true, itemKind: true, unit: true } }),
      reversalsAvailable().then(ok => (ok ? prisma.purchaseReceiptReversal.groupBy({ by: ['orderId'], where: { companyId, orderId: { in: ids } }, _count: { _all: true } }) : [])),
      readInvoices
        ? prisma.entityRelation.findMany({ where: { companyId, sourceModule: MODULE_KEY, sourceType: 'purchase_invoice', relationType: 'BILLED_FROM', targetType: 'purchase_order', targetId: { in: ids } }, select: { sourceId: true, targetId: true } })
        : [],
    ])
    const invoices = billed.length
      ? await prisma.purchaseInvoice.findMany({ where: { companyId, id: { in: [...new Set(billed.map(row => row.sourceId))] } }, select: { id: true, number: true, status: true, total: true, paidAmount: true, currency: true, dueDate: true }, orderBy: [{ issueDate: 'asc' }, { createdAt: 'asc' }] })
      : []
    const invoiceById = new Map(invoices.map(invoice => [invoice.id, invoice]))
    const today = toLocalIso()
    for (const row of rows) {
      const own = lines.filter(line => line.ownerId === row.id)
      const reversalCount = reversals.find(entry => entry.orderId === row.id)?._count._all ?? 0
      const mine = billed.filter(rel => rel.targetId === row.id).map(rel => invoiceById.get(rel.sourceId)).filter(Boolean)
        .sort((a, b) => invoices.indexOf(a) - invoices.indexOf(b))
      out.set(row.id, { receipt: receiptSummary(row, own, reversalCount), billing: readInvoices ? billingSummary(mine, today) : null })
    }
    return out
  }

  // access.canRead(entityType): read permissions of the caller (defaults to all).
  async function list(kind, companyId, query = {}, access = {}) {
    const canRead = access.canRead ?? (() => true)
    const def = KINDS[kind]
    const { page, pageSize, skip, take } = pagination(query)
    const search = cleanText(query.search, 120)
    const where = { companyId }
    const status = statusFilter(query.status)
    if (status) where.status = status
    if (query.supplierId && WITH_SUPPLIER.has(kind)) where.supplierId = String(query.supplierId)
    if (query.caseId && kind !== 'cases') where.caseId = String(query.caseId)
    if (query.orderId && kind === 'receipts') where.orderId = String(query.orderId)
    if (query.requestId && kind === 'quotes') where.requestId = String(query.requestId)
    if (kind === 'invoices' && String(query.overdue) === 'true') {
      where.status = { in: ['PENDING', 'PARTIALLY_PAID'] }
      where.dueDate = { lt: new Date(toLocalIso() + 'T00:00:00.000Z') }
    }
    if (kind === 'receipts' && query.supplierId) {
      const orders = await prisma.purchaseOrder.findMany({ where: { companyId, supplierId: String(query.supplierId) }, select: { id: true } })
      where.orderId = { in: orders.map(order => order.id) }
    }
    if (search) {
      where.OR = SEARCH_FIELDS[kind].map(field => ({ [field]: { contains: search, mode: 'insensitive' } }))
      const byItem = await documentIdsByItem(kind, companyId, search)
      if (byItem.length) where.OR.push({ id: { in: byItem } })
    }
    const model = prisma[def.model]
    const [rows, total] = await Promise.all([
      model.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      model.count({ where }),
    ])
    let orders = new Map()
    if (kind === 'receipts' && rows.length) {
      const orderRows = await prisma.purchaseOrder.findMany({ where: { companyId, id: { in: rows.map(row => row.orderId) } }, select: { id: true, number: true, supplierId: true, total: true, currency: true } })
      orders = new Map(orderRows.map(order => [order.id, order]))
    }
    const names = await supplierNames(prisma, companyId, kind === 'receipts' ? [...orders.values()].map(order => order.supplierId) : rows.map(row => row.supplierId))
    const ids = rows.map(row => row.id)
    const [items, invoiceOrders, progress] = await Promise.all([
      itemsByDocument(kind, companyId, ids),
      kind === 'invoices' ? orderNumbersOfInvoices(companyId, ids) : new Map(),
      kind === 'orders' ? orderProgress(companyId, rows, canRead) : new Map(),
    ])
    const data = rows.map(row => {
      const out = { ...plain(row), items: items.get(row.id) ?? { count: 0, preview: [] }, path: `${def.path}/${row.id}` }
      if (DATE_FIELD[kind]) out.date = dateKey(row[DATE_FIELD[kind]])
      if (kind === 'receipts') {
        const order = orders.get(row.orderId)
        out.orderNumber = order?.number ?? null
        out.supplierId = order?.supplierId ?? null
        out.supplierName = names.get(order?.supplierId) ?? null
        out.currency = order?.currency ?? null
      } else if (WITH_SUPPLIER.has(kind)) {
        out.supplierName = names.get(row.supplierId) ?? null
      }
      if (kind === 'orders') Object.assign(out, progress.get(row.id))
      if (kind === 'invoices') out.orderNumber = invoiceOrders.get(row.id) ?? null
      if (kind === 'invoices') out.balance = Math.max(0, Math.round((num(row.total) - num(row.paidAmount)) * 100) / 100)
      return out
    })
    return { data, total, page, pageSize, pagination: { page, pageSize, total } }
  }

  return { list }
}
