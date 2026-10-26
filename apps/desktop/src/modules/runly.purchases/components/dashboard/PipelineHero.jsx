import { Skeleton } from '@runly/ui'
import { PurchaseFlowRibbon } from '../PurchaseFlowRibbon.jsx'
import { PRESETS } from '../../lib/purchases-constants.js'
import { formatMoneyCompact } from '../../lib/format.js'

// Where each pipeline node leads when clicked.
export const STAGE_ROUTE = {
  REQUEST: 'requests', QUOTES: 'cases', APPROVAL: 'approvals', PURCHASE_ORDER: 'orders',
  RECEIPT: 'receipts', INVOICE: 'invoices', PAYMENT: 'payments', CLOSE: 'cases',
}

// The dashboard's one loud element: the company's process as a track, each
// station carrying how many documents are waiting in it.
export function PipelineHero({ data, stages, preset, ordersEnabled = true, isLoading, actions, onStage }) {
  const counts = new Map((data?.pipeline ?? []).map((row) => [row.stage, row.count]))
  const track = stages.filter((s) => s.type !== 'RELATE').map((s) => ({ ...s, count: counts.get(s.type) ?? 0 }))
  const m = data?.metrics ?? {}
  const presetName = PRESETS.find((p) => p.key === preset)?.name

  return (
    <section className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Compras{presetName ? `, flujo ${presetName.toLowerCase()}` : ''}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">
            {isLoading ? 'Cargando tus compras' : ordersEnabled
              ? `${formatMoneyCompact(m.orderedAmount)} comprometidos`
              : `${formatMoneyCompact(m.invoicedAmount)} facturados`}
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
            {isLoading ? 'Preparando el resumen del periodo.' : (
              <>
                {ordersEnabled ? `${formatMoneyCompact(m.invoicedAmount)} ya facturados y ` : 'De ellos, '}
                <span className="font-semibold text-amber-700 dark:text-amber-300">{formatMoneyCompact(m.payableAmount)} por pagar</span>
                {m.overdueInvoices ? <>, con <span className="font-semibold text-rose-700 dark:text-rose-300">{m.overdueInvoices} {m.overdueInvoices === 1 ? 'factura vencida' : 'facturas vencidas'}</span></> : null}.
              </>
            )}
          </p>
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>

      <div className="mt-5 rounded-xl bg-[hsl(var(--muted))]/30 px-3 py-4 md:px-5">
        {isLoading ? (
          <div className="flex justify-between gap-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 flex-1 rounded-xl" />)}</div>
        ) : (
          <PurchaseFlowRibbon stages={track} onSelect={(stage) => onStage?.(stage)} />
        )}
      </div>
    </section>
  )
}
