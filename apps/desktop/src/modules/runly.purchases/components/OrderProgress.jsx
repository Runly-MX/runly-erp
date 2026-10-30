import { cn } from '@runly/ui'
import { formatMoney, formatQty } from '../lib/format.js'

// Reading of the list API's per-order summaries (purchase-order-progress.js).
// Text always carries the meaning; the bar only repeats it.

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

export function receptionText(receipt) {
  if (!receipt) return { main: 'Sin datos', tone: 'muted' }
  const lines = `${receipt.completeLines} de ${plural(receipt.goodsLines, 'partida', 'partidas')} de bienes`
  const qty = receipt.quantity ? `${formatQty(receipt.quantity.received)} de ${formatQty(receipt.quantity.ordered)}${receipt.quantity.unit ? ` ${receipt.quantity.unit}` : ''}` : null
  switch (receipt.state) {
    case 'NOT_APPLICABLE': return { main: 'Solo servicios', sub: 'Sin recepción', tone: 'muted' }
    case 'NOT_ISSUED': return { main: 'Aún no aplica', sub: 'Se recibe al emitir la orden', tone: 'muted' }
    case 'CANCELLED': return { main: 'No aplica', sub: 'Orden cancelada', tone: 'muted' }
    case 'COMPLETE': return { main: 'Recibida completa', sub: qty ?? lines, tone: 'done', ratio: 1 }
    case 'CLOSED_SHORT': return { main: 'Cerrada con faltantes', sub: qty ?? lines, tone: 'warning', ratio: ratioOf(receipt) }
    case 'PARTIAL': return { main: `${lines} completas`, sub: qty, tone: 'progress', ratio: ratioOf(receipt) }
    default: return { main: 'Por recibir', sub: qty ?? lines, tone: 'pending', ratio: 0 }
  }
}

function ratioOf(receipt) {
  if (receipt.quantity?.ordered > 0) return Math.min(1, receipt.quantity.received / receipt.quantity.ordered)
  return receipt.goodsLines ? receipt.completeLines / receipt.goodsLines : 0
}

const TONE = {
  done: 'text-emerald-700 dark:text-emerald-300',
  progress: 'text-[hsl(var(--foreground))]',
  pending: 'text-[hsl(var(--foreground))]',
  warning: 'text-amber-800 dark:text-amber-300',
  danger: 'text-rose-700 dark:text-rose-300',
  muted: 'text-[hsl(var(--muted-foreground))]',
}
const BAR = { done: 'bg-emerald-600 dark:bg-emerald-400', progress: 'bg-(--brand-primary)', pending: 'bg-(--brand-primary)', warning: 'bg-amber-500' }

export function ReceptionSummary({ receipt, className }) {
  const text = receptionText(receipt)
  return (
    <div className={cn('min-w-0', className)}>
      <p className={cn('truncate text-sm', TONE[text.tone])} title={text.main}>{text.main}</p>
      {text.ratio != null ? (
        <span aria-hidden className="mt-1 block h-1 w-full max-w-36 overflow-hidden rounded-full bg-[hsl(var(--border))]">
          <span className={cn('block h-full rounded-full', BAR[text.tone])} style={{ width: `${Math.round(text.ratio * 100)}%` }} />
        </span>
      ) : null}
      {text.sub ? <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">{text.sub}</p> : null}
      {receipt?.reversals ? <p className="text-xs text-amber-800 dark:text-amber-300">{plural(receipt.reversals, 'reverso', 'reversos')} de recepción</p> : null}
    </div>
  )
}

const INVOICE_STATE = { PAID: 'pagada', PARTIALLY_PAID: 'pago parcial', PENDING: 'por pagar', DRAFT: 'en captura', PENDING_APPROVAL: 'por aprobar' }

// One or several invoices; balances per currency, never added across them.
export function billingText(billing) {
  if (!billing) return null
  const extra = billing.cancelled ? ` · ${plural(billing.cancelled, 'cancelada', 'canceladas')}` : ''
  if (!billing.count) return { main: 'Sin factura', sub: billing.cancelled ? plural(billing.cancelled, 'cancelada', 'canceladas') : null, tone: 'muted' }
  const balance = billing.amounts.filter((a) => a.balance > 0).map((a) => formatMoney(a.balance, a.currency)).join(' + ')
  const numbers = billing.invoices.map((i) => i.number ?? 'Sin folio').join(', ') + (billing.count > billing.invoices.length ? ` y ${billing.count - billing.invoices.length} más` : '')
  const tone = billing.state === 'PAID' ? 'done' : billing.state === 'OVERDUE' ? 'danger' : billing.state === 'CAPTURE' ? 'muted' : 'warning'
  const status = billing.state === 'PAID' ? (billing.count === 1 ? 'pagada' : 'pagadas')
    : billing.state === 'CAPTURE' ? 'en captura'
      : `saldo ${balance || formatMoney(0, billing.amounts[0]?.currency)}${billing.overdue ? ` · ${plural(billing.overdue, 'vencida', 'vencidas')}` : ''}`
  if (billing.count === 1) {
    const only = billing.invoices[0]
    return { main: `${only.number ?? 'Sin folio'} · ${billing.state === 'OPEN' || billing.state === 'OVERDUE' ? status : INVOICE_STATE[only.status] ?? status}`, sub: extra.slice(3) || null, tone }
  }
  return { main: `${billing.count} facturas · ${status}`, sub: numbers + extra, tone }
}

export function BillingSummary({ billing, className }) {
  const text = billingText(billing)
  if (!text) return null
  return (
    <div className={cn('min-w-0', className)}>
      <p className={cn('truncate text-sm', TONE[text.tone])} title={text.main}>{text.main}</p>
      {text.sub ? <p className="truncate text-xs text-[hsl(var(--muted-foreground))]" title={text.sub}>{text.sub}</p> : null}
    </div>
  )
}
