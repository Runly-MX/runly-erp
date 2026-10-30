import { Link } from 'react-router-dom'
import { PurchaseStatusBadge } from './PurchaseStatusBadge.jsx'
import { MoneyText } from './MoneyText.jsx'
import { ItemChips } from './ItemChips.jsx'
import { BillingSummary, ReceptionSummary } from './OrderProgress.jsx'
import { daysUntil, formatDate, toNumber } from '../lib/format.js'

const OPEN_INVOICE = new Set(['PENDING', 'PARTIALLY_PAID'])

function Meta({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-[hsl(var(--muted-foreground))]">{label}</dt>
      <dd className="truncate text-sm tabular-nums">{children}</dd>
    </div>
  )
}

// Card form of a list row: folio and status, who it is with, the assets it
// covers (asset number + serial) and the dates and amount that matter.
export function DocumentCard({ kind, row: r, to }) {
  const estimated = kind === 'requests' || kind === 'cases'
  const isInvoice = kind === 'invoices'
  const balance = isInvoice && r.status !== 'CANCELLED' ? Math.max(0, toNumber(r.total) - toNumber(r.paidAmount)) : 0
  const days = isInvoice && OPEN_INVOICE.has(r.status) && r.dueDate ? daysUntil(r.dueDate) : null
  const dates = [
    kind === 'orders' && ['Fecha', r.issueDate], kind === 'orders' && ['Entrega', r.expectedDate],
    isInvoice && ['Emisión', r.issueDate], isInvoice && ['Vence', r.dueDate],
    kind === 'receipts' && ['Recibida', r.receivedAt], kind === 'requests' && ['Se necesita', r.neededBy], kind === 'cases' && ['Abierto', r.createdAt],
  ].filter(Boolean)
  const showItems = kind === 'orders' || isInvoice || kind === 'receipts'
  const sub = r.supplierName || r.title || (kind === 'receipts' && r.orderNumber ? `Orden ${r.orderNumber}` : null)

  return (
    <Link to={to}
      className="flex min-w-0 flex-col gap-3 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 text-left transition-colors hover:border-(--brand-primary)/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand-primary)/40">
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="block truncate font-semibold tabular-nums">{r.number || 'Sin folio'}</span>
          <span className="block truncate text-xs text-[hsl(var(--muted-foreground))]">{sub || 'Sin proveedor'}</span>
        </span>
        <PurchaseStatusBadge kind={kind} status={r.status} />
      </div>

      {isInvoice && r.orderNumber ? <p className="text-xs text-[hsl(var(--muted-foreground))]">Orden <span className="font-medium text-[hsl(var(--foreground))]">{r.orderNumber}</span></p> : null}
      {kind === 'orders' && r.receipt ? (
        <div className="grid grid-cols-2 gap-3">
          <ReceptionSummary receipt={r.receipt} />
          <BillingSummary billing={r.billing} />
        </div>
      ) : null}
      {showItems ? <ItemChips items={r.items} /> : null}

      <div className="mt-auto flex items-end justify-between gap-3 border-t border-[hsl(var(--border))] pt-3">
        <dl className="flex min-w-0 gap-4">
          {dates.slice(0, 2).map(([label, value]) => <Meta key={label} label={label}>{value ? formatDate(value) : 'Sin fecha'}</Meta>)}
        </dl>
        <div className="shrink-0 text-right">
          <MoneyText value={estimated ? r.estimatedTotal : r.total} currency={r.currency} className="text-base font-semibold" />
          {isInvoice && balance > 0 ? (
            <p className={days != null && days < 0 ? 'text-xs text-rose-700 dark:text-rose-300' : 'text-xs text-amber-700 dark:text-amber-300'}>
              Saldo <MoneyText value={balance} currency={r.currency} />{days != null && days < 0 ? `, vencida hace ${-days} d` : ''}
            </p>
          ) : null}
        </div>
      </div>
    </Link>
  )
}
