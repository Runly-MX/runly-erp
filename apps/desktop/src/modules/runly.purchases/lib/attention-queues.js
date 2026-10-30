// "Requieren atención": the dashboard's attention lists turned into queues the
// signed-in user can act on. No queue claims the work is assigned to the user
// (the API has no per-user assignment): a queue shows when its capability is
// on and the user holds the permission to act on it.
//   has(capability), can(permissionKey), data: GET /purchases/dashboard
//   today: 'YYYY-MM-DD' (injectable for tests)

const OWNER_KIND = { PURCHASE_REQUEST: 'requests', PURCHASE_ORDER: 'orders', PURCHASE_INVOICE: 'invoices' }
const OWNER_LABEL = { requests: 'Solicitud', orders: 'Orden de compra', invoices: 'Factura' }

function days(from, to) {
  if (!from || !to) return null
  const a = Date.parse(String(from).slice(0, 10) + 'T00:00:00Z')
  const b = Date.parse(String(to).slice(0, 10) + 'T00:00:00Z')
  return Number.isNaN(a) || Number.isNaN(b) ? null : Math.round((b - a) / 86400000)
}
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

export function waitingText(createdAt, today) {
  const n = days(createdAt, today)
  if (n == null) return { text: 'Sin fecha', tone: 'neutral' }
  if (n <= 0) return { text: 'Desde hoy', tone: 'neutral' }
  return { text: `Espera ${plural(n, 'día', 'días')}`, tone: n >= 3 ? 'warning' : 'neutral' }
}

export function dueText(dueDate, today) {
  const n = days(today, dueDate)
  if (n == null) return { text: 'Sin vencimiento', tone: 'neutral' }
  if (n < 0) return { text: `Venció hace ${plural(-n, 'día', 'días')}`, tone: 'danger' }
  if (n === 0) return { text: 'Vence hoy', tone: 'warning' }
  return { text: `Vence en ${plural(n, 'día', 'días')}`, tone: n <= 7 ? 'warning' : 'neutral' }
}

export function deliveryText(expectedDate, today) {
  const n = days(today, expectedDate)
  if (n == null) return { text: 'Sin fecha de entrega', tone: 'neutral' }
  if (n < 0) return { text: `Entrega atrasada ${plural(-n, 'día', 'días')}`, tone: 'danger' }
  if (n === 0) return { text: 'Entrega hoy', tone: 'warning' }
  return { text: `Entrega en ${plural(n, 'día', 'días')}`, tone: 'neutral' }
}

const docRow = (kind, row, when) => ({
  id: `${kind}:${row.id}`, kind, targetId: row.id, number: row.number ?? 'Sin folio', detail: OWNER_LABEL[kind],
  supplierName: row.supplierName ?? null, amount: row.total ?? null, currency: row.currency ?? 'MXN', when,
})

export function attentionQueues({ has, can, data, today }) {
  const attention = data?.attention ?? {}
  const metrics = data?.metrics ?? {}
  const count = (value, rows) => (value == null ? rows.length : Number(value))
  const queues = []

  if (has('approvals') && can('purchases.approval.decide')) {
    const rows = (attention.approvals ?? []).map((row) => {
      const kind = OWNER_KIND[row.ownerType] ?? 'orders'
      return {
        id: `approval:${row.id}`, kind, targetId: row.ownerId, number: row.ownerNumber ?? 'Sin folio',
        detail: [OWNER_LABEL[kind], row.reason].filter(Boolean).join(' · '),
        supplierName: row.supplierName ?? null, amount: row.ownerTotal ?? null, currency: row.currency ?? 'MXN',
        when: waitingText(row.createdAt, today),
      }
    })
    queues.push({ key: 'approvals', label: 'Aprobar', count: count(metrics.pendingApprovals, rows), rows, seeAll: 'approvals',
      hint: 'Solicitudes, órdenes y facturas que esperan una decisión de aprobación.' })
  }
  if (has('receipts') && can('purchases.receipt.create')) {
    const rows = (attention.awaitingReceipt ?? []).map((row) => docRow('orders', row, deliveryText(row.expectedDate, today)))
    queues.push({ key: 'receipts', label: 'Por recibir', count: count(metrics.pendingReceipts, rows), rows, seeAll: 'orders?estado=TO_RECEIVE',
      hint: 'Órdenes emitidas o con recepción parcial, la entrega más próxima primero.' })
  }
  if (has('invoices') && can('purchases.invoice.read')) {
    const rows = (attention.overdueInvoices ?? []).map((row) => ({ ...docRow('invoices', row, dueText(row.dueDate, today)), amount: balanceOf(row) }))
    queues.push({ key: 'overdue', label: 'Vencidas', count: count(metrics.overdueInvoices, rows), rows, seeAll: 'invoices?estado=OVERDUE',
      hint: 'Facturas con saldo cuya fecha de vencimiento ya pasó; el importe es el saldo.' })
  }
  if (has('payments') && can('purchases.payment.manage')) {
    const rows = (attention.payable ?? []).map((row) => ({ ...docRow('invoices', row, dueText(row.dueDate, today)), amount: balanceOf(row) }))
    // "Por vencer": invoices PENDING or PARTIALLY_PAID whose due date is today
    // or later, or that have no due date (API attention.payable). Overdue ones
    // are only in "Vencidas"; the amount shown is the balance.
    queues.push({ key: 'payable', label: 'Por vencer', count: count(metrics.payableInvoices, rows), rows, seeAll: 'payments',
      hint: 'Facturas con saldo que vencen hoy o después, o sin fecha de vencimiento; las vencidas están en "Vencidas".' })
  }
  return queues
}

// Invoices in these queues show what is still owed, not the face total.
function balanceOf(row) {
  if (row.total == null) return null
  return Math.max(0, Math.round((Number(row.total) - Number(row.paidAmount ?? 0)) * 100) / 100)
}
