import { Link } from 'react-router-dom'
import { cn } from '@runly/ui'
import { StageTrack } from './StageTrack.jsx'
import { PurchaseStatusBadge } from '../PurchaseStatusBadge.jsx'
import { KINDS, ROOT, docPath } from '../../lib/purchases-constants.js'
import { daysUntil, formatDate, formatMoney, toNumber } from '../../lib/format.js'

const CHIP = 'inline-flex items-center rounded-md bg-[hsl(var(--muted))] px-2 py-0.5 text-xs font-medium text-[hsl(var(--foreground))]'
const TONE_CHIP = {
  neutral: CHIP,
  warning: 'inline-flex items-center rounded-md bg-amber-500/12 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-300',
  danger: 'inline-flex items-center rounded-md bg-rose-500/12 px-2 py-0.5 text-xs font-medium text-rose-700 dark:text-rose-300',
  done: 'inline-flex items-center rounded-md bg-emerald-500/12 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300',
}
const OPEN_INVOICE = new Set(['PENDING', 'PARTIALLY_PAID'])
const RECEIPT_CHIP = { PENDING: ['Por recibir', 'warning'], CLOSED_SHORT: ['Cerrada con faltantes', 'warning'], NOT_APPLICABLE: ['Solo servicios', 'neutral'] }

function Fact({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-[hsl(var(--muted-foreground))]">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-medium">{children}</dd>
    </div>
  )
}

// Status words the badge alone does not say: reception and invoices of an
// order, the due date of an open invoice.
function derivedChips(kind, doc) {
  const chips = []
  if (kind === 'orders' && !['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'CANCELLED'].includes(doc.status)) {
    const receipt = RECEIPT_CHIP[doc.receipt?.state]
    if (receipt) chips.push(receipt)
    const live = (doc.invoices ?? []).filter((i) => i.status !== 'CANCELLED').length
    chips.push(live ? [live === 1 ? '1 factura' : `${live} facturas`, 'neutral'] : ['Sin factura', 'neutral'])
  }
  if (kind === 'cases') {
    if (doc.status === 'CLOSED') chips.push([doc.closedAt ? `Cerrado el ${formatDate(doc.closedAt)}` : 'Cerrado', 'done'])
    if (doc.status === 'CANCELLED') chips.push(['Cancelado: solo historial', 'danger'])
    if (doc.closure?.automatic && !['CLOSED', 'CANCELLED'].includes(doc.status)) chips.push(['Se cierra solo', 'neutral'])
  }
  if (kind === 'invoices' && OPEN_INVOICE.has(doc.status) && !doc.dueDate) chips.push(['Sin fecha de vencimiento', 'neutral'])
  if (kind === 'invoices' && OPEN_INVOICE.has(doc.status) && doc.dueDate) {
    const days = daysUntil(doc.dueDate)
    if (days < 0) chips.push([`Vencida hace ${-days} ${-days === 1 ? 'día' : 'días'}`, 'danger'])
    else if (days === 0) chips.push(['Vence hoy', 'warning'])
    else chips.push([`Vence en ${days} ${days === 1 ? 'día' : 'días'}`, days <= 7 ? 'warning' : 'neutral'])
  }
  return chips
}

// Case amounts from the documents the user can read, in the case currency;
// documents in another currency are never added in.
function caseAmounts(doc) {
  const currency = doc.currency ?? 'MXN'
  const live = (rows) => (rows ?? []).filter((r) => r.status !== 'CANCELLED')
  const same = (rows) => rows.every((r) => (r.currency ?? currency) === currency)
  const orders = live(doc.orders), invoices = live(doc.invoices)
  const sum = (rows, key) => rows.reduce((n, r) => n + toNumber(r[key]), 0)
  return [
    doc.estimatedTotal != null && { label: 'Estimado', value: doc.estimatedTotal },
    orders.length && same(orders) && { label: 'Ordenado', value: sum(orders, 'total') },
    invoices.length && same(invoices) && { label: 'Facturado', value: sum(invoices, 'total') },
    invoices.length && same(invoices) && { label: 'Pagado', value: sum(invoices, 'paidAmount'), tone: 'text-emerald-700 dark:text-emerald-300' },
  ].filter(Boolean)
}

function Money({ label, value, currency, tone, hint }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-[hsl(var(--muted-foreground))]">{label}</p>
      <p className={cn('truncate text-xl font-semibold tabular-nums md:text-2xl', tone)}>{formatMoney(value, currency)}</p>
      {hint ? <p className="text-xs text-[hsl(var(--muted-foreground))]">{hint}</p> : null}
    </div>
  )
}

// Detail summary under the page header (which carries folio, supplier, key
// dates and the actions): status words, version, the amounts that matter and
// the process track.
export function DocumentHero({ kind, doc, facts = [], onOpenRef }) {
  const meta = KINDS[kind]
  const estimated = kind === 'requests' || kind === 'cases'
  const amount = estimated ? doc.estimatedTotal : doc.total
  const paid = kind === 'invoices' ? toNumber(doc.paidAmount) : 0
  const balance = amount != null ? Math.max(0, toNumber(amount) - paid) : 0
  const stages = (doc.stageMap ?? []).filter((s) => s.mode !== 'DISABLED')
  const supplier = doc.supplier ?? (doc.supplierName ? { name: doc.supplierName, id: doc.supplierId } : null)
  const workbench = kind === 'orders' || kind === 'invoices' || kind === 'cases'

  return (
    <section className="overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]" aria-label={`Resumen de ${meta.singular.toLowerCase()}`}>
      <div className="flex flex-col gap-4 p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <PurchaseStatusBadge kind={kind} status={doc.status} />
            {derivedChips(kind, doc).map(([text, tone]) => <span key={text} className={TONE_CHIP[tone]}>{text}</span>)}
            {!workbench && supplier?.name ? (
              supplier.id ? <Link to={`${ROOT}/suppliers/${supplier.id}`} className={`${CHIP} hover:bg-(--brand-primary)/15`}>{supplier.name}</Link> : <span className={CHIP}>{supplier.name}</span>
            ) : null}
            {doc.caseId && kind !== 'cases' ? (
              <Link to={docPath('purchase_case', doc.caseId)} className={`${CHIP} hover:bg-(--brand-primary)/15`}>Expediente {doc.caseNumber ?? doc.case?.number ?? ''}</Link>
            ) : null}
          </div>
          <p className="text-xs tabular-nums text-[hsl(var(--muted-foreground))]">
            {[doc.version != null ? `Versión ${doc.version}` : null, doc.sequence ? `N.º ${doc.sequence}` : null].filter(Boolean).join(' · ')}
          </p>
        </div>
        {doc.title ? <p className="text-base font-medium">{doc.title}</p> : null}
        {kind === 'cases' ? (
          caseAmounts(doc).length ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {caseAmounts(doc).map((m) => <Money key={m.label} label={m.label} value={m.value} currency={doc.currency} tone={m.tone} />)}
            </div>
          ) : <p className="text-sm text-[hsl(var(--muted-foreground))]">Sin montos todavía.</p>
        ) : kind === 'invoices' && amount != null ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Money label="Total" value={amount} currency={doc.currency} />
            <Money label="Pagado" value={paid} currency={doc.currency} tone="text-emerald-700 dark:text-emerald-300" hint={doc.paidAt ? `Último pago el ${formatDate(doc.paidAt)}` : null} />
            <Money label="Saldo pendiente" value={doc.status === 'CANCELLED' ? 0 : balance} currency={doc.currency} tone={balance > 0 && doc.status !== 'CANCELLED' ? 'text-amber-800 dark:text-amber-300' : undefined} />
          </div>
        ) : (
          <div>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">{estimated ? 'Monto estimado' : 'Total'}</p>
            <p className="text-2xl font-semibold tabular-nums md:text-3xl">{amount != null ? formatMoney(amount, doc.currency) : 'Sin monto'}</p>
          </div>
        )}
      </div>

      {facts.length ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-[hsl(var(--border))] px-4 py-3 sm:grid-cols-3 md:px-5 lg:grid-cols-5">
          {facts.map((f) => <Fact key={f.label} label={f.label}>{f.value ?? 'Sin dato'}</Fact>)}
        </dl>
      ) : null}

      {stages.length ? (
        <div className="border-t border-[hsl(var(--border))] px-4 py-3.5 md:px-5">
          <StageTrack stages={stages} onOpenRef={onOpenRef} caseStatus={doc.case?.status ?? null} />
        </div>
      ) : null}
    </section>
  )
}

export const dateFact = (label, value) => ({ label, value: value ? formatDate(value) : null })
