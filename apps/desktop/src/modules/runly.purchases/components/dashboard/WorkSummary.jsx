import { KINDS } from '../../lib/purchases-constants.js'
import { formatMoneyCompact } from '../../lib/format.js'

// Where each stage count leads, and how it reads as work in progress.
export const STAGE_ROUTE = {
  REQUEST: 'requests', QUOTES: 'cases', APPROVAL: 'approvals', PURCHASE_ORDER: 'orders',
  RECEIPT: 'orders?estado=TO_RECEIVE', INVOICE: 'invoices', PAYMENT: 'payments',
}
const STAGE_TEXT = {
  REQUEST: 'Solicitudes abiertas', QUOTES: 'Cotizaciones recibidas', APPROVAL: 'En aprobación', PURCHASE_ORDER: 'Órdenes por emitir',
  RECEIPT: 'Por recibir', INVOICE: 'Facturas en captura', PAYMENT: 'Facturas con saldo',
}
// Document kind each stage count is about (hidden without read permission).
const STAGE_KIND = { REQUEST: 'requests', QUOTES: 'cases', APPROVAL: null, PURCHASE_ORDER: 'orders', RECEIPT: 'orders', INVOICE: 'invoices', PAYMENT: 'invoices' }

// How many documents sit in each active stage of the flow (band counters).
export function stageItems(pipeline = [], can) {
  return pipeline
    .filter((row) => STAGE_TEXT[row.stage])
    .filter((row) => {
      const kind = STAGE_KIND[row.stage]
      return kind ? can(KINDS[kind].read) : can('purchases.approval.decide')
    })
    .map((row) => ({ key: row.stage, label: STAGE_TEXT[row.stage], value: String(row.count), to: STAGE_ROUTE[row.stage], muted: !row.count }))
}

// Figures of the last 12 months. A null figure (no read permission or the
// capability is off) is left out rather than shown as zero.
export function periodItems(metrics = {}, has) {
  return [
    has('purchaseOrders') && metrics.orderedAmount != null && { key: 'ordered', label: 'Comprometido en órdenes', value: formatMoneyCompact(metrics.orderedAmount), to: 'orders' },
    has('invoices') && metrics.invoicedAmount != null && { key: 'invoiced', label: 'Facturado', value: formatMoneyCompact(metrics.invoicedAmount), to: 'invoices' },
    has('invoices') && metrics.payableAmount != null && { key: 'payable', label: 'Saldo por pagar', value: formatMoneyCompact(metrics.payableAmount), to: has('payments') ? 'payments' : 'invoices' },
    has('invoices') && metrics.overdueInvoices != null && { key: 'overdue', label: 'Facturas vencidas', value: String(metrics.overdueInvoices), to: 'invoices?estado=OVERDUE', alert: metrics.overdueInvoices > 0, muted: !metrics.overdueInvoices },
  ].filter(Boolean)
}
