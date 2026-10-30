// runly.purchases — individual payments of supplier invoices: an append-only
// ledger (purchase_payment) with partial payments, idempotent retries and
// audited reversals. Administrative record only: no bank transfer, no refund,
// no accounting entries (those belong to a finance module).
//
// purchase_invoice.paid_amount stays as the cache every existing consumer
// reads (lists, dashboard, suppliers, MirAI, chat cards). An invoice paid
// before the ledger existed has no movements: its accumulated amount is shown
// as "sin desglose" and recorded as ONE opening movement (origin MIGRATED,
// no invented date/method/reference) the first time a payment or reversal
// touches it, or by the reviewed backfill script.
import { publishDomainEvent } from './domain-events/events.js'
import { autoCloseCase } from './purchase-case-closure.js'
import { policyCheckFor } from './purchase-case-bundle.js'
import { purchaseEventPayload } from './purchase-documents-service.js'
import { centsToDecimal, centsToNumber, toCents } from './purchase-money.js'
import { PAYABLE_STATUSES, REVERSIBLE_STATUSES, cacheFieldsFrom, statusForPaid } from './purchase-payments-ledger.js'
import {
  PurchasesServiceError, asDate, assertFresh, broadcast, cleanText, dateKey, guardedUpdate, invalidTransition, notFound, plain, policyBlocked, writeAudit,
} from './purchases-shared.js'

const isUniqueViolation = error => error?.code === 'P2002' || error?.code === '23505' || /unique/i.test(error?.message ?? '')

export function createPurchasePaymentsService({ prisma, broadcaster, workflowService, caseBundle }) {
  // The ledger table exists once the migration ran; before that (code deployed
  // first, or a dev database not migrated yet) payments keep the accumulated
  // behaviour and reversals answer PAYMENTS_LEDGER_UNAVAILABLE.
  let ledgerProbe = null
  async function ledgerAvailable() {
    if (ledgerProbe && ledgerProbe.expires > Date.now()) return ledgerProbe.value
    const [row] = await prisma.$queryRaw`SELECT to_regclass('public.purchase_payment')::text AS name`.catch(() => [{}])
    ledgerProbe = { value: Boolean(row?.name), expires: Date.now() + 60_000 }
    return ledgerProbe.value
  }

  async function findInvoice(companyId, invoiceId, client = prisma) {
    const invoice = await client.purchaseInvoice.findFirst({ where: { id: invoiceId, companyId } })
    if (!invoice) throw notFound('La factura no existe o pertenece a otra empresa.')
    return invoice
  }

  // Row lock: every payment or reversal of an invoice runs one after another.
  async function lockInvoice(tx, companyId, invoiceId) {
    const [row] = await tx.$queryRaw`SELECT id FROM purchase_invoice WHERE id = ${invoiceId}::uuid AND company_id = ${companyId}::uuid FOR UPDATE`
    if (!row) throw notFound('La factura no existe o pertenece a otra empresa.')
    return findInvoice(companyId, invoiceId, tx)
  }

  const movementsOf = (client, companyId, invoiceId) =>
    client.purchasePayment.findMany({ where: { companyId, invoiceId }, orderBy: [{ recordedAt: 'asc' }, { id: 'asc' }] })

  // Records the invoice's unrecorded accumulated amount as one OPENING
  // movement, so the ledger and the cache agree before anything else moves.
  async function materializeLegacy(tx, { companyId, actorId, invoice, movements }) {
    const recorded = movements.reduce((sum, m) => sum + toCents(m.amount), 0)
    const gap = toCents(invoice.paidAmount) - recorded
    if (gap < 0) throw new PurchasesServiceError('Los pagos registrados no coinciden con el pagado de la factura. Revisa la conciliación antes de continuar.', 409, 'PAYMENTS_INCONSISTENT')
    if (gap === 0) return movements
    const opening = await tx.purchasePayment.create({
      data: {
        companyId, invoiceId: invoice.id, kind: 'OPENING', origin: 'MIGRATED', amount: centsToDecimal(gap), currency: invoice.currency,
        createdById: actorId || null,
        metadata: { legacySnapshot: { paidAmount: centsToDecimal(gap), paidAt: dateKey(invoice.paidAt), paymentReference: invoice.paymentReference ?? null, paymentMethod: invoice.paymentMethod ?? null, status: invoice.status }, source: 'first-touch' },
      },
    })
    await writeAudit(tx, { companyId, actorId, entityType: 'purchase_invoice', entityId: invoice.id, action: 'purchase.invoice.payment.opening_recorded', metadata: { paymentId: opening.id, amount: centsToDecimal(gap), source: 'first-touch' } })
    return [...movements, opening]
  }

  async function userNames(ids) {
    const unique = [...new Set(ids.filter(Boolean))]
    if (!unique.length) return new Map()
    const rows = await prisma.userProfile.findMany({ where: { id: { in: unique } }, select: { id: true, displayName: true } })
    return new Map(rows.map(row => [row.id, row.displayName]))
  }

  function serialize(movement, { reversals = new Map(), names = new Map() } = {}) {
    const reversal = reversals.get(movement.id) ?? null
    return {
      id: movement.id,
      invoiceId: movement.invoiceId,
      kind: movement.kind,
      amount: centsToNumber(toCents(movement.amount)),
      currency: movement.currency,
      paidAt: dateKey(movement.paidAt),
      recordedAt: movement.recordedAt,
      method: movement.method,
      reference: movement.reference,
      origin: movement.origin,
      reason: movement.reason,
      reversesId: movement.reversesId,
      reversedBy: reversal ? { id: reversal.id, recordedAt: reversal.recordedAt, reason: reversal.reason, createdById: reversal.createdById, createdByName: names.get(reversal.createdById) ?? null } : null,
      createdById: movement.createdById,
      createdByName: names.get(movement.createdById) ?? null,
      legacy: movement.kind === 'OPENING',
      legacySnapshot: movement.metadata?.legacySnapshot ?? null,
    }
  }

  function summaryOf(invoice, movements, ledger) {
    const total = toCents(invoice.total)
    const paid = toCents(invoice.paidAmount)
    const recorded = movements.reduce((sum, m) => sum + toCents(m.amount), 0)
    const unrecorded = paid - recorded
    return {
      invoiceId: invoice.id,
      status: invoice.status,
      currency: invoice.currency,
      total: centsToNumber(total),
      paid: centsToNumber(paid),
      balance: invoice.status === 'CANCELLED' ? 0 : centsToNumber(Math.max(0, total - paid)),
      recorded: centsToNumber(recorded),
      // Paid before the ledger existed and not broken down (shown as one legacy entry).
      unrecordedLegacy: centsToNumber(Math.max(0, unrecorded)),
      consistent: unrecorded >= 0,
      ledgerAvailable: ledger,
      updatedAt: invoice.updatedAt,
    }
  }

  // GET /purchases/invoices/:id/payments — readable with the capability off.
  async function list(companyId, invoiceId) {
    const invoice = await findInvoice(companyId, invoiceId)
    const ledger = await ledgerAvailable()
    const movements = ledger ? await movementsOf(prisma, companyId, invoiceId) : []
    const reversals = new Map(movements.filter(m => m.kind === 'REVERSAL').map(m => [m.reversesId, m]))
    const names = await userNames(movements.map(m => m.createdById))
    const workflow = await workflowService.ensureWorkflow(companyId)
    return {
      summary: { ...summaryOf(invoice, movements, ledger), capabilityEnabled: workflow.capabilities?.payments === true },
      payments: movements.map(m => serialize(m, { reversals, names })),
    }
  }

  // GET /purchases/payments/:id
  async function get(companyId, paymentId) {
    if (!(await ledgerAvailable())) throw notFound('El pago no existe.')
    const movement = await prisma.purchasePayment.findFirst({ where: { id: paymentId, companyId } })
    if (!movement) throw notFound('El pago no existe o pertenece a otra empresa.')
    const reversal = await prisma.purchasePayment.findFirst({ where: { companyId, reversesId: movement.id } })
    const names = await userNames([movement.createdById, reversal?.createdById])
    return serialize(movement, { reversals: new Map(reversal ? [[movement.id, reversal]] : []), names })
  }

  // A retry with the same key returns the movement it already created; the
  // same key on a different operation is refused.
  async function replayed(companyId, key, expected) {
    if (!key) return null
    const existing = await prisma.purchasePayment.findFirst({ where: { companyId, idempotencyKey: key } })
    if (!existing) return null
    const same = existing.invoiceId === expected.invoiceId && existing.kind === expected.kind
      && (expected.amountCents == null || toCents(existing.amount) === expected.amountCents)
      && (expected.reversesId == null || existing.reversesId === expected.reversesId)
    if (!same) throw new PurchasesServiceError('Esta clave de operación ya se usó para otro movimiento.', 409, 'IDEMPOTENCY_KEY_REUSED')
    const invoice = await findInvoice(companyId, existing.invoiceId)
    return { invoice: plain(invoice), payment: serialize(existing), replayed: true }
  }

  function idempotencyKey(input) {
    const key = cleanText(input.idempotencyKey, 100)
    if (key && !/^[A-Za-z0-9:_-]{8,100}$/.test(key)) throw new PurchasesServiceError('La clave de operación no es válida.', 400, 'VALIDATION')
    return key
  }

  // POST /purchases/invoices/:id/payments (and the legacy transition `pay`).
  // input: { amount, paidAt, method, reference, idempotencyKey, expectedUpdatedAt }
  async function record(companyId, actorId, invoiceId, input = {}) {
    const workflow = await workflowService.assertCapability(companyId, 'payments', actorId)
    const before = await findInvoice(companyId, invoiceId)
    const key = idempotencyKey(input)
    const amountCents = input.amount == null || input.amount === '' ? null : toCents(input.amount, { label: 'El monto del pago' })
    const ledger = await ledgerAvailable()
    if (ledger) {
      const previous = await replayed(companyId, key, { invoiceId, kind: 'PAYMENT', amountCents })
      if (previous) return previous
    }
    if (!PAYABLE_STATUSES.includes(before.status)) {
      throw invalidTransition(before.status === 'CANCELLED' ? 'La factura está cancelada: no admite pagos.' : before.status === 'PAID' ? 'La factura ya está pagada.' : 'La factura debe estar registrada para recibir pagos.')
    }
    const check = policyCheckFor(workflow, await caseBundle.loadBundle(companyId, before.caseId), 'invoices', before)
    if (check.blocked) throw policyBlocked(check.blockers)
    const paidAt = asDate(input.paidAt, { fallbackToday: true })
    let caseStatus = null
    let created = null
    let result
    try {
      result = await prisma.$transaction(async tx => {
        const invoice = await lockInvoice(tx, companyId, invoiceId)
        assertFresh(invoice, input.expectedUpdatedAt)
        if (!PAYABLE_STATUSES.includes(invoice.status)) throw invalidTransition('La factura cambió de estado mientras se registraba el pago. Recarga e inténtalo de nuevo.')
        const total = toCents(invoice.total)
        const paid = toCents(invoice.paidAmount)
        const balance = total - paid
        const amount = amountCents ?? balance
        if (amount <= 0) throw new PurchasesServiceError('El monto del pago debe ser mayor a cero.', 400, 'VALIDATION')
        if (amount > balance) throw new PurchasesServiceError('El pago excede el saldo pendiente de la factura.', 400, 'VALIDATION')
        const data = {
          paidAmount: centsToDecimal(paid + amount),
          status: statusForPaid(total, paid + amount),
          paidAt,
          paymentReference: cleanText(input.reference, 120) ?? invoice.paymentReference,
          paymentMethod: cleanText(input.method, 40) ?? invoice.paymentMethod,
        }
        if (ledger) {
          await materializeLegacy(tx, { companyId, actorId, invoice, movements: await movementsOf(tx, companyId, invoiceId) })
          created = await tx.purchasePayment.create({
            data: {
              companyId, invoiceId, kind: 'PAYMENT', origin: 'MANUAL', amount: centsToDecimal(amount), currency: invoice.currency, paidAt,
              method: cleanText(input.method, 40), reference: cleanText(input.reference, 120), idempotencyKey: key, createdById: actorId || null,
            },
          })
        }
        const updated = await guardedUpdate(tx, 'purchaseInvoice', invoice, data)
        await writeAudit(tx, {
          companyId, actorId, entityType: 'purchase_invoice', entityId: invoiceId, action: 'purchase.invoice.pay',
          before: { status: invoice.status, paidAmount: centsToDecimal(paid) }, after: { status: updated.status, paidAmount: data.paidAmount },
          metadata: { amount: centsToDecimal(amount), paymentId: created?.id ?? null, ledger },
        })
        caseStatus = await autoCloseCase(tx, { workflow, caseBundle, companyId, caseId: invoice.caseId, actorId, trigger: { entityType: 'purchase_invoice', entityId: invoiceId, action: 'pay' } })
        return { before: invoice, updated }
      })
    } catch (error) {
      // Same key raced in from a concurrent retry: answer with that movement.
      if (key && isUniqueViolation(error)) {
        const previous = await replayed(companyId, key, { invoiceId, kind: 'PAYMENT', amountCents })
        if (previous) return previous
      }
      throw error
    }
    // Events only after commit, and never for a replay.
    const { before: locked, updated } = result
    await broadcast(broadcaster, companyId, 'purchase.invoice.pay', { id: invoiceId, caseId: updated.caseId, status: updated.status })
    if (caseStatus) await broadcast(broadcaster, companyId, 'purchase.case.auto_closed', { id: updated.caseId, status: caseStatus })
    if (created) await publishDomainEvent(prisma, { companyId, event: 'purchases.invoice.payment.recorded', payload: paymentEventPayload(updated, created) })
    if (updated.status === 'PAID' && locked.status !== 'PAID') await publishDomainEvent(prisma, { companyId, event: 'purchases.invoice.paid', payload: purchaseEventPayload(updated) })
    return { invoice: plain(updated), payment: created ? serialize(created) : null, replayed: false }
  }

  // POST /purchases/payments/:id/reverse — input: { reason, effectiveAt, idempotencyKey, expectedUpdatedAt }.
  // Records a negative movement pointing at the original; never edits it.
  async function reverse(companyId, actorId, paymentId, input = {}) {
    await workflowService.assertCapability(companyId, 'payments', actorId)
    if (!(await ledgerAvailable())) throw new PurchasesServiceError('El registro de pagos todavía no está disponible en esta instancia.', 409, 'PAYMENTS_LEDGER_UNAVAILABLE')
    const reason = cleanText(input.reason, 500)
    if (!reason) throw new PurchasesServiceError('Indica el motivo del reverso.', 400, 'VALIDATION')
    const key = idempotencyKey(input)
    const original = await prisma.purchasePayment.findFirst({ where: { id: paymentId, companyId } })
    if (!original) throw notFound('El pago no existe o pertenece a otra empresa.')
    const previous = await replayed(companyId, key, { invoiceId: original.invoiceId, kind: 'REVERSAL', reversesId: original.id })
    if (previous) return { ...previous, reversal: previous.payment }
    if (original.kind === 'REVERSAL') throw invalidTransition('Un reverso no se puede reversar.')
    let reversal
    let result
    try {
      result = await prisma.$transaction(async tx => {
        const invoice = await lockInvoice(tx, companyId, original.invoiceId)
        assertFresh(invoice, input.expectedUpdatedAt)
        if (!REVERSIBLE_STATUSES.includes(invoice.status)) throw invalidTransition(invoice.status === 'CANCELLED' ? 'La factura está cancelada.' : 'La factura no tiene pagos que reversar.')
        const already = await tx.purchasePayment.findFirst({ where: { companyId, reversesId: original.id } })
        if (already) throw new PurchasesServiceError('Este pago ya fue reversado.', 409, 'PAYMENT_ALREADY_REVERSED')
        const movements = await materializeLegacy(tx, { companyId, actorId, invoice, movements: await movementsOf(tx, companyId, invoice.id) })
        const amount = toCents(original.amount)
        const paid = toCents(invoice.paidAmount) - amount
        if (paid < 0) throw new PurchasesServiceError('El reverso dejaría la factura con pagado negativo. Revisa la conciliación.', 409, 'PAYMENTS_INCONSISTENT')
        reversal = await tx.purchasePayment.create({
          data: {
            companyId, invoiceId: invoice.id, kind: 'REVERSAL', origin: 'MANUAL', amount: centsToDecimal(-amount), currency: original.currency,
            // Effective date of the reversal itself (today unless given), not the original's.
            paidAt: asDate(input.effectiveAt, { fallbackToday: true }), reversesId: original.id, reason, idempotencyKey: key, createdById: actorId || null,
          },
        })
        const updated = await guardedUpdate(tx, 'purchaseInvoice', invoice, {
          paidAmount: centsToDecimal(paid),
          status: statusForPaid(toCents(invoice.total), paid),
          ...cacheFieldsFrom([...movements, reversal]),
        })
        await writeAudit(tx, {
          companyId, actorId, entityType: 'purchase_invoice', entityId: invoice.id, action: 'purchase.invoice.payment.reversed',
          before: { status: invoice.status, paidAmount: centsToDecimal(toCents(invoice.paidAmount)) }, after: { status: updated.status, paidAmount: centsToDecimal(paid) },
          metadata: { paymentId: original.id, reversalId: reversal.id, amount: centsToDecimal(amount), reason },
        })
        const caseRow = invoice.caseId ? await tx.purchaseCase.findFirst({ where: { id: invoice.caseId, companyId }, select: { status: true } }) : null
        return { updated, caseClosed: caseRow?.status === 'CLOSED' }
      })
    } catch (error) {
      if (isUniqueViolation(error)) {
        if (key) {
          const again = await replayed(companyId, key, { invoiceId: original.invoiceId, kind: 'REVERSAL', reversesId: original.id })
          if (again) return { ...again, reversal: again.payment }
        }
        throw new PurchasesServiceError('Este pago ya fue reversado.', 409, 'PAYMENT_ALREADY_REVERSED')
      }
      throw error
    }
    const { updated, caseClosed } = result
    await broadcast(broadcaster, companyId, 'purchase.invoice.payment_reversed', { id: updated.id, caseId: updated.caseId, status: updated.status })
    await publishDomainEvent(prisma, { companyId, event: 'purchases.invoice.payment.reversed', payload: paymentEventPayload(updated, reversal) })
    return {
      invoice: plain(updated),
      reversal: serialize(reversal),
      replayed: false,
      // The case is not reopened silently; the user decides.
      warnings: caseClosed ? ['El expediente de esta factura está cerrado y ahora tiene saldo pendiente. Reábrelo si corresponde.'] : [],
    }
  }

  return { list, get, record, reverse, ledgerAvailable }
}

// Payload of purchases.invoice.payment.* events (no people, no free text).
// Keep in sync with PAYMENT_FIELDS in packages/module-engine/src/event-catalog.js.
export function paymentEventPayload(invoice, movement) {
  return {
    id: movement.id,
    invoiceId: invoice.id,
    caseId: invoice.caseId ?? null,
    kind: movement.kind,
    amount: centsToNumber(toCents(movement.amount)),
    currency: movement.currency,
    invoiceStatus: invoice.status,
    paidAmount: centsToNumber(toCents(invoice.paidAmount)),
    balance: centsToNumber(Math.max(0, toCents(invoice.total) - toCents(invoice.paidAmount))),
  }
}
