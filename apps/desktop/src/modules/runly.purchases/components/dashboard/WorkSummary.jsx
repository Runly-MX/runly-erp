import { Link } from 'react-router-dom'
import { CalendarRange, ChevronRight, Workflow } from 'lucide-react'
import { Panel } from './dashboard-theme.jsx'
import { KINDS, ROOT, TONES } from '../../lib/purchases-constants.js'
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

// Figures of the last 12 months. A null figure (no read permission or the
// capability is off) is left out rather than shown as zero.
export function PeriodSummary({ metrics = {}, has }) {
  const rows = [
    has('purchaseOrders') && metrics.orderedAmount != null && { label: 'Comprometido en órdenes', value: formatMoneyCompact(metrics.orderedAmount), to: 'orders' },
    has('invoices') && metrics.invoicedAmount != null && { label: 'Facturado', value: formatMoneyCompact(metrics.invoicedAmount), to: 'invoices' },
    has('invoices') && metrics.payableAmount != null && { label: 'Saldo por pagar', value: formatMoneyCompact(metrics.payableAmount), to: has('payments') ? 'payments' : 'invoices' },
    has('invoices') && metrics.overdueInvoices != null && { label: 'Facturas vencidas', value: String(metrics.overdueInvoices), to: 'invoices?estado=OVERDUE', alert: metrics.overdueInvoices > 0 },
  ].filter(Boolean)
  if (!rows.length) return null
  return (
    <Panel title="Últimos 12 meses" icon={CalendarRange} tone={TONES.petrol}>
      <dl className="divide-y divide-[hsl(var(--border))]">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-3 py-2 first:pt-0 last:pb-0">
            <dt className="text-sm text-[hsl(var(--muted-foreground))]">{row.label}</dt>
            <dd>
              <Link to={`${ROOT}/${row.to}`} className={`rounded-md text-base font-semibold tabular-nums hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand-primary)/50 ${row.alert ? 'text-rose-700 dark:text-rose-300' : ''}`}>
                {row.value}
              </Link>
            </dd>
          </div>
        ))}
      </dl>
    </Panel>
  )
}

// How many documents sit in each active stage; stages at zero go last.
export function StageCounts({ pipeline = [], can }) {
  const rows = pipeline
    .filter((row) => STAGE_TEXT[row.stage])
    .filter((row) => {
      const kind = STAGE_KIND[row.stage]
      return kind ? can(KINDS[kind].read) : can('purchases.approval.decide')
    })
    .map((row, index) => ({ ...row, index }))
    .sort((a, b) => (a.count === 0) - (b.count === 0) || a.index - b.index)
  if (!rows.length) return null
  return (
    <Panel title="En proceso por etapa" subtitle="Solo las etapas activas de tu flujo." icon={Workflow}>
      <ul className="-mx-2">
        {rows.map((row) => (
          <li key={row.stage}>
            <Link to={`${ROOT}/${STAGE_ROUTE[row.stage]}`}
              className="flex min-h-10 items-center justify-between gap-3 rounded-lg px-2 text-sm transition-colors hover:bg-[hsl(var(--muted))]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand-primary)/50">
              <span className={row.count ? 'text-[hsl(var(--foreground))]' : 'text-[hsl(var(--muted-foreground))]'}>{STAGE_TEXT[row.stage]}</span>
              <span className="flex items-center gap-1">
                <span className="font-semibold tabular-nums">{row.count}</span>
                <ChevronRight className="h-4 w-4 text-[hsl(var(--muted-foreground))]" aria-hidden />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  )
}
