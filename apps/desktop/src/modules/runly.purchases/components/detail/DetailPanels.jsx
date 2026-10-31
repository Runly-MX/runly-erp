import { Link } from 'react-router-dom'
import { PackageCheck } from 'lucide-react'
import { AuditTrail, EmptyState } from '@runly/ui'
import { PurchaseStatusBadge } from '../PurchaseStatusBadge.jsx'
import { MoneyText } from '../MoneyText.jsx'
import { RevisionsPanel } from './RevisionsPanel.jsx'
import { Timeline } from './Timeline.jsx'
import { receiptMovements } from '../../lib/case-timeline.js'
import { DOCUMENTARY_FIELD_META } from '../../lib/documentary.js'
import { ROOT } from '../../lib/purchases-constants.js'
import { formatDate, toNumber } from '../../lib/format.js'
import { ofTotal, withUnit } from '../../lib/units.js'

// Side-column card: title + body, same surface as the hero.
export function AsideCard({ title, children, footer }) {
  return (
    <section className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4" aria-label={title}>
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {children}
      {footer ? <p className="mt-3 text-xs text-[hsl(var(--muted-foreground))]">{footer}</p> : null}
    </section>
  )
}

// Receipts registered against the order, newest first; each opens the receipt
// (where reversals live). Quantities per line with their own unit.
export function ReceiptsPanel({ order }) {
  const receipts = order.receipts ?? []
  const lines = new Map((order.lines ?? []).map((line) => [line.id, line]))
  if (!receipts.length) {
    return <EmptyState icon={PackageCheck} title="Sin recepciones" description="Cada entrega que registres contra esta orden aparece aquí, con lo que llegó de cada partida." />
  }
  return (
    <ul className="divide-y divide-[hsl(var(--border))] rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]" aria-label="Recepciones de la orden">
      {receipts.map((receipt) => (
        <li key={receipt.id}>
          <Link to={`${ROOT}/receipts/${receipt.id}`} className="flex flex-wrap items-start gap-x-4 gap-y-1 px-4 py-3 transition-colors hover:bg-[hsl(var(--muted))]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--brand-primary)/50">
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold tabular-nums">{receipt.number ?? 'Recepción'}</span>
              <span className="block text-xs text-[hsl(var(--muted-foreground))]">{receipt.receivedAt ? `Recibida el ${formatDate(receipt.receivedAt)}` : 'Sin fecha'}</span>
              <span className="mt-1 block text-sm">
                {(receipt.lines ?? []).map((l) => { const line = lines.get(l.orderLineId); return `${line?.description ?? 'Partida'}: ${withUnit(l.quantity, line?.unit)}` }).join(' · ') || 'Sin partidas'}
              </span>
            </span>
            <PurchaseStatusBadge kind="receipts" status={receipt.status} />
          </Link>
        </li>
      ))}
    </ul>
  )
}

// Reception and billing of an order at a glance: progress per goods line
// (units never added across lines) and every invoice with its balance.
export function OrderProgressCard({ order }) {
  const goods = (order.lines ?? []).filter((line) => (line.itemKind ?? 'GOODS') === 'GOODS')
  const invoices = (order.invoices ?? []).filter((invoice) => invoice.status !== 'CANCELLED')
  const cancelled = (order.invoices ?? []).length - invoices.length
  return (
    <AsideCard title="Avance">
      <h3 className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Recepción</h3>
      <p className="mt-1 text-sm font-medium">{order.receipt?.label ?? 'Sin datos de recepción'}</p>
      {goods.length ? (
        <ul className="mt-1 space-y-0.5 text-sm text-[hsl(var(--muted-foreground))]">
          {goods.map((line) => <li key={line.id}>{line.description ?? 'Partida'}: {ofTotal(line.receivedQuantity, line.quantity, line.unit)}</li>)}
        </ul>
      ) : null}
      <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{(order.receipts ?? []).length === 1 ? '1 recepción' : `${(order.receipts ?? []).length} recepciones`}{goods.length > 1 ? ' · avance por partida; unidades distintas no se suman' : ''}</p>

      <h3 className="mt-4 text-xs font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Facturación</h3>
      {invoices.length ? (
        <ul className="mt-1 space-y-1.5">
          {invoices.map((invoice) => {
            const balance = Math.max(0, toNumber(invoice.total) - toNumber(invoice.paidAmount))
            return (
              <li key={invoice.id} className="flex items-center justify-between gap-2 text-sm">
                <Link to={`${ROOT}/invoices/${invoice.id}`} className="truncate font-medium tabular-nums hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand-primary)/50">{invoice.number ?? invoice.label ?? 'Factura'}</Link>
                <span className="shrink-0 text-xs">
                  {invoice.status === 'PAID' || invoice.paidAmount === undefined ? <PurchaseStatusBadge kind="invoices" status={invoice.status} />
                    : <>Saldo <MoneyText value={balance} currency={invoice.currency ?? order.currency} /></>}
                </span>
              </li>
            )
          })}
        </ul>
      ) : <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">Sin factura todavía</p>}
      {cancelled ? <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{cancelled === 1 ? '1 factura cancelada' : `${cancelled} facturas canceladas`} (no cuentan)</p> : null}
    </AsideCard>
  )
}

// What an audited correction may change now (plan computed by the API).
export function CorrectionRulesCard({ plan, documentary = false }) {
  if (!plan || plan.draft || (!plan.fields?.length && !plan.locked?.length)) return null
  const label = (f) => f.label ?? DOCUMENTARY_FIELD_META[f.field]?.label ?? f.field
  return (
    <AsideCard title={documentary ? 'Qué se puede completar o corregir' : 'Qué se puede corregir'}
      footer={documentary ? 'Cada cambio pide un motivo y queda en el historial. Las partidas capturadas al registrar no se editan después.' : 'Importes, proveedor, moneda y partidas no se corrigen: se cancela y se registra el documento correcto.'}>
      {plan.fields.length ? <p className="text-sm">{plan.fields.map(label).join(', ')}.</p> : <p className="text-sm text-[hsl(var(--muted-foreground))]">Nada en este estado.</p>}
      {plan.locked.length ? (
        <ul className="mt-2 space-y-1 text-xs text-[hsl(var(--muted-foreground))]">
          {plan.locked.map((f) => <li key={f.field}>{f.label}: {f.reason}</li>)}
        </ul>
      ) : null}
    </AsideCard>
  )
}

// One history tab: receipt movements (orders), corrections (orders and
// invoices) and the audit trail (payments and reversals are audited on the
// invoice, so they appear under Actividad too).
export function HistoryPanel({ kind, doc, auditProps }) {
  const movements = kind === 'orders' ? receiptMovements(doc) : []
  return (
    <div className="space-y-6">
      {movements.length ? (
        <section aria-labelledby="history-receipts">
          <h2 id="history-receipts" className="mb-3 text-sm font-semibold">Recepciones y reversos</h2>
          <Timeline events={movements} label="Recepciones y reversos de la orden" />
        </section>
      ) : null}
      {['orders', 'invoices'].includes(kind) ? (
        <section aria-labelledby="history-corrections">
          <h2 id="history-corrections" className="mb-2 text-sm font-semibold">Correcciones</h2>
          <RevisionsPanel kind={kind} docId={doc.id} />
        </section>
      ) : null}
      <section aria-labelledby="history-activity">
        <h2 id="history-activity" className="mb-2 text-sm font-semibold">Actividad</h2>
        <AuditTrail {...auditProps} limit={15} emptyMessage="Sin actividad registrada para este documento." />
      </section>
    </div>
  )
}
