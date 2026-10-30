// runly.purchases — reversal of a registered goods receipt. The receipt and
// its lines are never edited or deleted: a reversal records the quantities it
// compensates (purchase_receipt_reversal[_line]) and, in the same transaction,
// subtracts them from the order lines' received quantity and recomputes the
// order's reception status. Downstream effects are never undone silently:
// assets linked to the receipt block the reversal until they are unlinked,
// a closed order or case blocks it, and invoices/assets created from the
// order lines are reported as warnings.
import { publishDomainEvent } from './domain-events/events.js'
import {
  MODULE_KEY, PurchasesServiceError, asDate, broadcast, bumpVersion, cleanText, dateKey, notFound, num, writeAudit,
} from './purchases-shared.js'

const EPSILON = 1e-6
const round4 = value => Math.round(value * 10000) / 10000

// Pure. receiptLines: [{ id, orderLineId, quantity }]; reversed: Map(receiptLineId -> already reversed);
// orderLines: [{ id, quantity, receivedQuantity, itemKind, description }];
// requested: [{ receiptLineId, quantity }] or null (= everything still reversible).
// Returns { lines: [{ receiptLineId, orderLineId, quantity, receivedQuantity }], orderStatus }.
export function planReceiptReversal({ receiptLines, reversed = new Map(), orderLines, requested = null }) {
  const byId = new Map(receiptLines.map(line => [line.id, line]))
  const orderById = new Map(orderLines.map(line => [line.id, line]))
  const reversible = line => round4(Math.max(0, num(line.quantity) - (reversed.get(line.id) ?? 0)))
  const entries = requested ?? receiptLines.map(line => ({ receiptLineId: line.id, quantity: reversible(line) }))
  const totals = new Map()
  for (const entry of entries) {
    const line = byId.get(entry?.receiptLineId)
    if (!line) throw new PurchasesServiceError('Un concepto no pertenece a esta recepción.', 400, 'VALIDATION')
    const quantity = Number(entry.quantity)
    if (!Number.isFinite(quantity) || quantity < 0) throw new PurchasesServiceError('Las cantidades a reversar no son válidas.', 400, 'VALIDATION')
    if (quantity > 0) totals.set(line.id, (totals.get(line.id) ?? 0) + quantity)
  }
  if (!totals.size) throw new PurchasesServiceError('No queda ninguna cantidad por reversar en esta recepción.', 409, 'NOTHING_TO_REVERSE')
  const after = new Map(orderLines.map(line => [line.id, num(line.receivedQuantity)]))
  const lines = []
  for (const [receiptLineId, quantity] of totals) {
    const line = byId.get(receiptLineId)
    const orderLine = orderById.get(line.orderLineId)
    if (quantity > reversible(line) + EPSILON) {
      throw new PurchasesServiceError(`La cantidad a reversar de «${orderLine?.description ?? 'concepto'}» excede lo recibido en esta recepción (${reversible(line)}).`, 400, 'VALIDATION')
    }
    const received = after.get(line.orderLineId) ?? 0
    if (!orderLine || received + EPSILON < quantity) {
      throw new PurchasesServiceError('Las cantidades recibidas de la orden no coinciden con sus recepciones. Revisa la orden antes de reversar.', 409, 'RECEIPTS_INCONSISTENT')
    }
    after.set(line.orderLineId, round4(received - quantity))
    lines.push({ receiptLineId, orderLineId: line.orderLineId, quantity: round4(quantity), receivedQuantity: round4(received - quantity) })
  }
  const goods = orderLines.filter(line => (line.itemKind ?? 'GOODS') !== 'SERVICE')
  const tracked = goods.length ? goods : orderLines
  const complete = tracked.every(line => after.get(line.id) + EPSILON >= num(line.quantity))
  const any = tracked.some(line => after.get(line.id) > EPSILON)
  return { lines, orderStatus: complete ? 'RECEIVED' : any ? 'PARTIALLY_RECEIVED' : 'ISSUED' }
}

const isUniqueViolation = error => error?.code === 'P2002' || /unique/i.test(error?.message ?? '')

export function createPurchaseReceiptReversalsService({ prisma, broadcaster, workflowService }) {
  let probe = null
  async function available() {
    if (probe && probe.expires > Date.now()) return probe.value
    let row = null
    try { [row] = await prisma.$queryRaw`SELECT to_regclass('public.purchase_receipt_reversal')::text AS name` } catch { row = null }
    probe = { value: Boolean(row?.name), expires: Date.now() + 60_000 }
    return probe.value
  }

  async function reversalsOf(client, companyId, receiptId) {
    return client.purchaseReceiptReversal.findMany({ where: { companyId, receiptId }, include: { lines: true }, orderBy: { createdAt: 'asc' } })
  }

  const reversedByLine = reversals => {
    const map = new Map()
    for (const reversal of reversals) for (const line of reversal.lines) map.set(line.receiptLineId, (map.get(line.receiptLineId) ?? 0) + num(line.quantity))
    return map
  }

  // Blockers (refuse) and warnings (inform) for reversing this receipt.
  async function dependencies(client, companyId, receipt, order) {
    const blockers = []
    const warnings = []
    if (!order || ['CLOSED', 'CANCELLED'].includes(order.status)) {
      blockers.push({ code: 'ORDER_CLOSED', message: `La orden ${order?.number ?? ''} está ${order?.status === 'CANCELLED' ? 'cancelada' : 'cerrada'}: ya no espera entregas, un reverso dejaría faltantes en una orden terminada.`.replace(/\s+/g, ' ') })
    }
    const caseRow = receipt.caseId ? await client.purchaseCase.findFirst({ where: { id: receipt.caseId, companyId }, select: { status: true, number: true } }) : null
    if (caseRow && ['CLOSED', 'CANCELLED'].includes(caseRow.status)) {
      blockers.push({ code: 'CASE_CLOSED', message: `El expediente ${caseRow.number} está ${caseRow.status === 'CLOSED' ? 'cerrado' : 'cancelado'}. Reábrelo antes de reversar la recepción.` })
    }
    const assetLinks = await client.entityRelation.findMany({
      where: { companyId, sourceModule: MODULE_KEY, sourceType: 'purchase_receipt', sourceId: receipt.id, targetType: 'inventory_item' },
      select: { id: true, targetId: true },
    })
    if (assetLinks.length) {
      const items = await client.invItem.findMany({ where: { companyId, id: { in: assetLinks.map(row => row.targetId) } }, select: { id: true, name: true, assetTag: true } })
      blockers.push({
        code: 'RECEIPT_HAS_ASSETS',
        message: `${assetLinks.length} activo(s) están ligados a esta recepción. Desvincúlalos (pestaña Inventario) o corrige su origen antes de reversar; no se borran ni se desligan solos.`,
        items: items.map(item => ({ id: item.id, label: item.assetTag || item.name })),
      })
    }
    const lineIds = receipt.lines.map(line => line.orderLineId)
    const allocated = lineIds.length
      ? await client.purchaseAllocation.count({ where: { companyId, purchaseLineId: { in: lineIds }, targetType: 'inventory_item' } })
      : 0
    if (allocated) warnings.push({ code: 'LINE_ASSETS', message: `${allocated} activo(s) se crearon desde los conceptos de la orden. Siguen en Inventario; revisa si corresponden a mercancía realmente recibida.` })
    if (order) {
      const billed = await client.entityRelation.findMany({ where: { companyId, sourceType: 'purchase_invoice', targetType: 'purchase_order', targetId: order.id, relationType: 'BILLED_FROM' }, select: { sourceId: true } })
      const invoices = billed.length ? await client.purchaseInvoice.findMany({ where: { companyId, id: { in: billed.map(row => row.sourceId) }, status: { not: 'CANCELLED' } }, select: { number: true, status: true, paidAmount: true } }) : []
      for (const invoice of invoices) {
        if (invoice.status === 'DRAFT') continue
        warnings.push({ code: 'INVOICE_REGISTERED', message: `La factura ${invoice.number} ya está registrada${num(invoice.paidAmount) > 0 ? ' y tiene pagos' : ''}. El reverso no cambia la factura ni sus pagos.` })
      }
    }
    return { blockers, warnings }
  }

  async function loadReceipt(client, companyId, receiptId) {
    const receipt = await client.purchaseReceipt.findFirst({ where: { id: receiptId, companyId }, include: { lines: true } })
    if (!receipt) throw notFound('La recepción no existe o pertenece a otra empresa.')
    return receipt
  }

  async function names(ids) {
    const unique = [...new Set(ids.filter(Boolean))]
    if (!unique.length) return new Map()
    const rows = await prisma.userProfile.findMany({ where: { id: { in: unique } }, select: { id: true, displayName: true } })
    return new Map(rows.map(row => [row.id, row.displayName]))
  }

  function serializeReversal(reversal, people = new Map()) {
    return {
      id: reversal.id, receiptId: reversal.receiptId, orderId: reversal.orderId, reason: reversal.reason,
      reversedAt: dateKey(reversal.reversedAt), createdAt: reversal.createdAt, createdById: reversal.createdById,
      createdByName: people.get(reversal.createdById) ?? null,
      lines: reversal.lines.map(line => ({ id: line.id, receiptLineId: line.receiptLineId, orderLineId: line.orderLineId, quantity: num(line.quantity) })),
    }
  }

  // Per-line quantities, the reversals done, and what blocks a new one.
  // Used by the receipt detail and GET /purchases/receipts/:id/reversal-preview.
  async function describe(companyId, receipt) {
    if (!(await available())) return { available: false, lines: [], reversals: [], blockers: [], warnings: [], fullyReversed: false }
    const order = await prisma.purchaseOrder.findFirst({ where: { id: receipt.orderId, companyId } })
    const orderLines = await prisma.purchaseLine.findMany({ where: { companyId, ownerType: 'PURCHASE_ORDER', ownerId: receipt.orderId } })
    const orderById = new Map(orderLines.map(line => [line.id, line]))
    const reversals = await reversalsOf(prisma, companyId, receipt.id)
    const reversed = reversedByLine(reversals)
    const lines = receipt.lines.map(line => {
      const orderLine = orderById.get(line.orderLineId)
      const done = round4(reversed.get(line.id) ?? 0)
      return {
        receiptLineId: line.id, orderLineId: line.orderLineId, description: orderLine?.description ?? null, unit: orderLine?.unit ?? null,
        itemKind: orderLine?.itemKind ?? null, received: num(line.quantity), reversed: done, reversible: round4(Math.max(0, num(line.quantity) - done)),
        ordered: num(orderLine?.quantity), orderReceived: num(orderLine?.receivedQuantity),
      }
    })
    const { blockers, warnings } = await dependencies(prisma, companyId, receipt, order)
    const people = await names(reversals.map(row => row.createdById))
    const fullyReversed = lines.every(line => line.reversible <= EPSILON)
    if (fullyReversed && lines.length) blockers.push({ code: 'NOTHING_TO_REVERSE', message: 'Esta recepción ya fue reversada por completo.' })
    return { available: true, lines, reversals: reversals.map(row => serializeReversal(row, people)), blockers, warnings, fullyReversed }
  }

  async function preview(companyId, receiptId) {
    return describe(companyId, await loadReceipt(prisma, companyId, receiptId))
  }

  async function replay(companyId, key, receiptId) {
    if (!key) return null
    const existing = await prisma.purchaseReceiptReversal.findFirst({ where: { companyId, idempotencyKey: key }, include: { lines: true } })
    if (!existing) return null
    if (existing.receiptId !== receiptId) throw new PurchasesServiceError('Esta clave de operación ya se usó para otro reverso.', 409, 'IDEMPOTENCY_KEY_REUSED')
    return { reversal: serializeReversal(existing), replayed: true }
  }

  // POST /purchases/receipts/:id/reverse — input: { reason, lines?: [{ receiptLineId, quantity }], reversedAt, idempotencyKey }
  async function reverse(companyId, actorId, receiptId, input = {}) {
    await workflowService.assertCapability(companyId, 'receipts', actorId)
    if (!(await available())) throw new PurchasesServiceError('Los reversos de recepción todavía no están disponibles en esta instancia.', 409, 'REVERSALS_UNAVAILABLE')
    const reason = cleanText(input.reason, 500)
    if (!reason) throw new PurchasesServiceError('Indica el motivo del reverso.', 400, 'VALIDATION', { field: 'reason' })
    const key = cleanText(input.idempotencyKey, 100)
    if (key && !/^[A-Za-z0-9:_-]{8,100}$/.test(key)) throw new PurchasesServiceError('La clave de operación no es válida.', 400, 'VALIDATION')
    const receipt = await loadReceipt(prisma, companyId, receiptId)
    const previous = await replay(companyId, key, receiptId)
    if (previous) return previous
    const requested = Array.isArray(input.lines) && input.lines.length ? input.lines : null
    let result
    try {
      result = await prisma.$transaction(async tx => {
        // Same lock as receipts: reversals and receipts of one order run one at a time.
        const [locked] = await tx.$queryRaw`SELECT id FROM purchase_order WHERE id = ${receipt.orderId}::uuid AND company_id = ${companyId}::uuid FOR UPDATE`
        if (!locked) throw notFound('La orden no existe.')
        const order = await tx.purchaseOrder.findFirst({ where: { id: receipt.orderId, companyId } })
        const { blockers } = await dependencies(tx, companyId, receipt, order)
        if (blockers.length) throw new PurchasesServiceError(blockers[0].message, 409, blockers[0].code, { reasons: blockers.map(b => b.message), dependencies: blockers })
        const orderLines = await tx.purchaseLine.findMany({ where: { companyId, ownerType: 'PURCHASE_ORDER', ownerId: order.id } })
        const plan = planReceiptReversal({ receiptLines: receipt.lines, reversed: reversedByLine(await reversalsOf(tx, companyId, receipt.id)), orderLines, requested })
        const reversal = await tx.purchaseReceiptReversal.create({
          data: {
            companyId, receiptId: receipt.id, orderId: order.id, reason, reversedAt: asDate(input.reversedAt, { fallbackToday: true }),
            idempotencyKey: key, createdById: actorId || null,
            lines: { create: plan.lines.map(line => ({ companyId, receiptLineId: line.receiptLineId, orderLineId: line.orderLineId, quantity: String(line.quantity) })) },
          },
          include: { lines: true },
        })
        for (const line of plan.lines) await tx.purchaseLine.update({ where: { id: line.orderLineId }, data: { receivedQuantity: String(line.receivedQuantity) } })
        // Only orders still waiting or received move; closed/cancelled were refused above.
        if (order.status !== plan.orderStatus) await tx.purchaseOrder.update({ where: { id: order.id }, data: { status: plan.orderStatus } })
        await bumpVersion(tx, { companyId, documentType: 'purchase_order', documentId: order.id })
        await writeAudit(tx, {
          companyId, actorId, entityType: 'purchase_receipt', entityId: receipt.id, action: 'purchase.receipt.reversed',
          before: { orderStatus: order.status }, after: { orderStatus: plan.orderStatus },
          metadata: { reversalId: reversal.id, reason, lines: plan.lines },
        })
        return { reversal, order, orderStatus: plan.orderStatus }
      })
    } catch (error) {
      if (key && isUniqueViolation(error)) {
        const again = await replay(companyId, key, receiptId)
        if (again) return again
      }
      throw error
    }
    await broadcast(broadcaster, companyId, 'purchase.receipt.reversed', { id: receipt.id, orderId: receipt.orderId, caseId: receipt.caseId, orderStatus: result.orderStatus })
    await publishDomainEvent(prisma, {
      companyId, event: 'purchases.receipt.reversed',
      payload: { id: result.reversal.id, receiptId: receipt.id, orderId: receipt.orderId, caseId: receipt.caseId ?? null, orderStatus: result.orderStatus, number: receipt.number },
    })
    return { reversal: serializeReversal(result.reversal), orderStatus: result.orderStatus, replayed: false }
  }

  return { preview, describe, reverse, available }
}
