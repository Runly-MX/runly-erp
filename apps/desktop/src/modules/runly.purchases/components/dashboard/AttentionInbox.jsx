import { Link } from 'react-router-dom'
import { ArrowRight, BellRing, CheckCircle2 } from 'lucide-react'
import { EmptyState, Tabs, TabsContent, TabsList, TabsTrigger, cn } from '@runly/ui'
import { Panel } from './dashboard-theme.jsx'
import { ROOT } from '../../lib/purchases-constants.js'
import { formatMoney } from '../../lib/format.js'

const TONE = {
  danger: 'text-rose-700 dark:text-rose-300',
  warning: 'text-amber-800 dark:text-amber-300',
  neutral: 'text-[hsl(var(--muted-foreground))]',
}
const GRID = 'md:grid md:grid-cols-[minmax(0,1.5fr)_minmax(0,1.1fr)_minmax(0,7.5rem)_minmax(0,9rem)_auto] md:items-center md:gap-4'

function QueueRow({ row }) {
  return (
    <li>
      <Link to={`${ROOT}/${row.kind}/${row.targetId}`}
        className={cn('group block rounded-xl px-3 py-2.5 transition-colors hover:bg-[hsl(var(--muted))]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand-primary)/50', GRID)}>
        <span className="flex min-w-0 items-baseline justify-between gap-3 md:block">
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold tabular-nums">{row.number}</span>
            <span className="block truncate text-xs text-[hsl(var(--muted-foreground))]">{row.detail}</span>
          </span>
          <span className="shrink-0 text-sm font-medium tabular-nums md:hidden">{row.amount != null ? formatMoney(row.amount, row.currency) : ''}</span>
        </span>
        <span className="mt-0.5 block truncate text-xs text-[hsl(var(--muted-foreground))] md:mt-0 md:text-sm md:text-[hsl(var(--foreground))]">{row.supplierName ?? 'Sin proveedor'}</span>
        <span className="hidden text-right text-sm font-medium tabular-nums md:block">{row.amount != null ? formatMoney(row.amount, row.currency) : 'Sin monto'}</span>
        <span className={cn('mt-0.5 block text-xs font-medium md:mt-0', TONE[row.when.tone])}>{row.when.text}</span>
        <span className="hidden items-center gap-1 text-xs font-semibold text-(--brand-primary-computed) md:flex">
          Revisar<ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
        </span>
      </Link>
    </li>
  )
}

// The work waiting on the user's role (permissions + document states), one
// tab per queue. Five oldest/most urgent rows each; "Ver todo" opens the list.
export function AttentionInbox({ queues, className }) {
  return (
    <Panel title="Requieren atención" subtitle="Según tus permisos y el estado de cada documento; no hay asignación por persona." icon={BellRing} tone="#d97706" className={className}>
      {!queues.length ? (
        <EmptyState icon={CheckCircle2} title="Nada que atender con tus permisos" description="Aquí aparecen aprobaciones, entregas y facturas cuando tu rol puede actuar sobre ellas." />
      ) : (
        <Tabs defaultValue={queues.find((q) => q.count > 0)?.key ?? queues[0].key}>
          <div className="-mx-1 overflow-x-auto px-1">
            <TabsList aria-label="Colas de trabajo">
              {queues.map((q) => (
                <TabsTrigger key={q.key} value={q.key} className="gap-1.5">
                  {q.label}{' '}<span className="rounded-full border border-current/35 px-1.5 text-[11px] font-semibold tabular-nums">{q.count}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          {queues.map((q) => (
            <TabsContent key={q.key} value={q.key} className="mt-3">
              <p className="mb-2 px-3 text-xs text-[hsl(var(--muted-foreground))]">{q.hint}</p>
              {!q.rows.length ? (
                <EmptyState variant="compact" icon={CheckCircle2} title="Todo al día" description="No hay documentos en esta cola." />
              ) : (
                <>
                  <div aria-hidden className={cn('hidden px-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))]', GRID)}>
                    <span>Documento</span><span>Proveedor</span><span className="text-right">Importe</span><span>Plazo</span><span className="w-14" />
                  </div>
                  <ul className="divide-y divide-[hsl(var(--border))]" aria-label={`Cola ${q.label}`}>
                    {q.rows.map((row) => <QueueRow key={row.id} row={row} />)}
                  </ul>
                </>
              )}
              {q.count > q.rows.length || q.rows.length ? (
                <Link to={`${ROOT}/${q.seeAll}`}
                  className="mt-2 inline-flex min-h-10 items-center gap-1 rounded-md px-3 text-sm font-medium text-(--brand-primary-computed) hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand-primary)/50">
                  Ver {q.count > q.rows.length ? `las ${q.count}` : 'todo'}<ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              ) : null}
            </TabsContent>
          ))}
        </Tabs>
      )}
    </Panel>
  )
}
