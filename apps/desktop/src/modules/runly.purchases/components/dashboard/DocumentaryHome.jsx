import { Link } from 'react-router-dom'
import { ChevronRight, FilePen } from 'lucide-react'
import { EmptyState } from '@runly/ui'
import { Panel } from './dashboard-theme.jsx'
import { CounterBand } from './CounterBand.jsx'
import { RecentPanel } from './DashboardCharts.jsx'
import { ROOT, TONES } from '../../lib/purchases-constants.js'
import { formatDate } from '../../lib/format.js'

// Inicio in Control documental (dashboard.documentary from the API): the same
// board as the financial one, with its own counters (references registered,
// items they cover, references to complete) and no amounts, payables or due
// dates anywhere.
export function DocumentaryHome({ data, has, onOpen }) {
  const d = data?.documentary ?? {}
  const items = [
    has('purchaseOrders') && d.orders != null && { key: 'orders', label: 'Órdenes registradas', value: String(d.orders), to: 'orders', muted: !d.orders },
    has('invoices') && d.invoices != null && { key: 'invoices', label: 'Facturas registradas', value: String(d.invoices), to: 'invoices', muted: !d.invoices },
    d.linkedItems != null && { key: 'items', label: 'Inventarios vinculados', value: String(d.linkedItems), hint: 'Activos con orden o factura', muted: !d.linkedItems },
    { key: 'complete', label: 'Por completar', value: String(d.toCompleteCount ?? 0), hint: 'Sin proveedor o sin fecha', muted: !d.toCompleteCount },
  ].filter(Boolean)
  return (
    <>
      <CounterBand label="Resumen documental" groups={[{ key: 'registered', title: 'Referencias', items }]} />
      <Panel title="Por completar o revisar" subtitle="Referencias sin proveedor o sin fecha. Completarlas es opcional." icon={FilePen} tone={TONES.amber}>
        {!(d.toComplete ?? []).length ? (
          <EmptyState variant="compact" icon={FilePen} title="Nada por completar" description="Las referencias registradas tienen proveedor y fecha." />
        ) : (
          <ul className="-mx-2 divide-y divide-[hsl(var(--border))]" aria-label="Referencias por completar">
            {d.toComplete.map((row) => (
              <li key={row.id}>
                <Link to={`${ROOT}/${row.kind}/${row.id}`} className="flex min-h-11 items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-[hsl(var(--muted))]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand-primary)/50">
                  <span className="w-16 shrink-0 text-xs text-[hsl(var(--muted-foreground))]">{row.kind === 'orders' ? 'Orden' : 'Factura'}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{row.reference ?? row.number}</span>
                    <span className="block truncate text-xs text-[hsl(var(--muted-foreground))]">
                      {[row.missingSupplier && 'Sin proveedor', row.missingIssueDate && 'sin fecha', `registrada ${formatDate(row.createdAt)}`].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className="hidden text-xs font-medium text-(--brand-primary-computed) sm:inline">Completar</span>
                  <ChevronRight className="h-4 w-4 text-[hsl(var(--muted-foreground))]" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <RecentPanel rows={data?.recent ?? []} onOpen={onOpen} showAmounts={false} />
    </>
  )
}
