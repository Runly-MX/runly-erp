import { Link } from 'react-router-dom'
import { Boxes, ChevronRight, ClipboardList, FilePen, ReceiptText } from 'lucide-react'
import { EmptyState } from '@runly/ui'
import { Panel } from './dashboard-theme.jsx'
import { RecentPanel } from './DashboardCharts.jsx'
import { ROOT, TONES } from '../../lib/purchases-constants.js'
import { formatDate } from '../../lib/format.js'

function Count({ icon: Icon, label, value, to, hint }) {
  const body = (
    <>
      <span className="flex items-center gap-2 text-xs font-medium text-[hsl(var(--muted-foreground))]"><Icon className="h-4 w-4" aria-hidden />{label}</span>
      <span className="mt-2 block text-2xl font-semibold tabular-nums">{value}</span>
      {hint ? <span className="block text-xs text-[hsl(var(--muted-foreground))]">{hint}</span> : null}
    </>
  )
  const cls = 'block rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4'
  return to
    ? <Link to={to} className={`${cls} transition-colors hover:border-(--brand-primary)/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand-primary)/50`}>{body}</Link>
    : <div className={cls}>{body}</div>
}

// Inicio in Control documental (dashboard.documentary from the API): how
// many references exist, how many items they cover and which ones still lack
// supplier or document date. No amounts, payables or due dates.
export function DocumentaryHome({ data, has, onOpen }) {
  const d = data?.documentary ?? {}
  const counts = [
    has('purchaseOrders') && d.orders != null && <Count key="o" icon={ClipboardList} label="Órdenes registradas" value={d.orders} to={`${ROOT}/orders`} />,
    has('invoices') && d.invoices != null && <Count key="i" icon={ReceiptText} label="Facturas registradas" value={d.invoices} to={`${ROOT}/invoices`} />,
    d.linkedItems != null && <Count key="l" icon={Boxes} label="Inventarios vinculados" value={d.linkedItems} hint="Activos con orden o factura documental" />,
    <Count key="c" icon={FilePen} label="Por completar" value={d.toCompleteCount ?? 0} hint="Sin proveedor o sin fecha del documento" />,
  ].filter(Boolean)
  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">{counts}</div>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Panel title="Por completar o revisar" subtitle="Referencias sin proveedor o sin fecha. Completarlas es opcional." icon={FilePen} tone={TONES.amber}>
          {!(d.toComplete ?? []).length ? (
            <EmptyState variant="compact" icon={FilePen} title="Nada por completar" description="Las referencias registradas tienen proveedor y fecha." />
          ) : (
            <ul className="-mx-2" aria-label="Referencias por completar">
              {d.toComplete.map((row) => (
                <li key={row.id}>
                  <Link to={`${ROOT}/${row.kind}/${row.id}`} className="flex min-h-11 items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-[hsl(var(--muted))]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand-primary)/50">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{row.reference ?? row.number}</span>
                      <span className="block truncate text-xs text-[hsl(var(--muted-foreground))]">
                        {[row.kind === 'orders' ? 'Orden' : 'Factura', row.missingSupplier && 'sin proveedor', row.missingIssueDate && 'sin fecha', `registrada ${formatDate(row.createdAt)}`].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 text-[hsl(var(--muted-foreground))]" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <RecentPanel rows={data?.recent ?? []} onOpen={onOpen} />
      </div>
    </>
  )
}
