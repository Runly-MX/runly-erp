import { Link } from 'react-router-dom'
import { PurchaseFlowRibbon } from '../PurchaseFlowRibbon.jsx'
import { PurchaseStatusBadge } from '../PurchaseStatusBadge.jsx'
import { KINDS, ROOT, docPath } from '../../lib/purchases-constants.js'
import { formatDate, formatMoney, toNumber } from '../../lib/format.js'

const CHIP = 'inline-flex items-center rounded-md bg-[hsl(var(--muted))] px-2 py-0.5 text-xs font-medium text-[hsl(var(--foreground))]'

function Fact({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-[hsl(var(--muted-foreground))]">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-medium">{children}</dd>
    </div>
  )
}

// Detail summary under the page header (which already carries the folio and
// the actions): status and who it is with on the left, the amount on the
// right, the key dates, and the process track showing where it stands.
export function DocumentHero({ kind, doc, facts = [], onOpenRef }) {
  const meta = KINDS[kind]
  const supplier = doc.supplier ?? (doc.supplierName ? { name: doc.supplierName, id: doc.supplierId } : null)
  const estimated = kind === 'requests' || kind === 'cases'
  const amount = estimated ? doc.estimatedTotal : doc.total
  const paid = kind === 'invoices' ? toNumber(doc.paidAmount) : 0
  const balance = amount != null ? Math.max(0, toNumber(amount) - paid) : 0
  const stages = (doc.stageMap ?? []).filter((s) => s.mode !== 'DISABLED')

  return (
    <section className="overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]" aria-label={`Resumen de ${meta.singular.toLowerCase()}`}>
      <div className="flex flex-col gap-4 p-4 md:flex-row md:items-start md:justify-between md:p-5">
        <div className="min-w-0 space-y-2">
          {doc.title ? <p className="text-base font-medium">{doc.title}</p> : null}
          <div className="flex flex-wrap items-center gap-1.5">
            <PurchaseStatusBadge kind={kind} status={doc.status} />
            {supplier?.name ? (
              supplier.id
                ? <Link to={`${ROOT}/suppliers/${supplier.id}`} className={`${CHIP} hover:bg-teal-500/15`}>{supplier.name}</Link>
                : <span className={CHIP}>{supplier.name}</span>
            ) : null}
            {doc.caseId && kind !== 'cases' ? (
              <Link to={docPath('purchase_case', doc.caseId)} className={`${CHIP} hover:bg-teal-500/15`}>Expediente {doc.caseNumber ?? doc.case?.number ?? ''}</Link>
            ) : null}
            {doc.sequence ? <span className={`${CHIP} tabular-nums text-[hsl(var(--muted-foreground))]`} title="Consecutivo interno automático">N.º {doc.sequence}</span> : null}
          </div>
        </div>
        <div className="shrink-0 md:text-right">
          <p className="text-xs text-[hsl(var(--muted-foreground))]">{estimated ? 'Monto estimado' : 'Total'}</p>
          <p className="text-2xl font-semibold tabular-nums md:text-3xl">{amount != null ? formatMoney(amount, doc.currency) : 'Sin monto'}</p>
          {kind === 'invoices' && amount != null ? (
            <p className="mt-0.5 text-xs tabular-nums text-[hsl(var(--muted-foreground))]">
              Pagado {formatMoney(paid, doc.currency)} · saldo <span className={balance > 0 ? 'font-semibold text-amber-700 dark:text-amber-300' : 'font-semibold text-emerald-700 dark:text-emerald-300'}>{formatMoney(balance, doc.currency)}</span>
            </p>
          ) : null}
        </div>
      </div>

      {facts.length ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-[hsl(var(--border))] px-4 py-3 sm:grid-cols-3 md:px-5 lg:grid-cols-5">
          {facts.map((f) => <Fact key={f.label} label={f.label}>{f.value ?? 'Sin dato'}</Fact>)}
        </dl>
      ) : null}

      {stages.length ? (
        <div className="border-t border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 px-3 py-4 md:px-5">
          <PurchaseFlowRibbon stages={stages} onOpenRef={onOpenRef} />
        </div>
      ) : null}
    </section>
  )
}

export const dateFact = (label, value) => ({ label, value: value ? formatDate(value) : null })
