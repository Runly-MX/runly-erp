import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ErrorState, PageHeader, Skeleton, cn } from '@runly/ui'
import { useCapabilities, usePurchasesCan, usePurchasesDashboard } from '../hooks/usePurchases.js'
import { PRESETS, ROOT } from '../lib/purchases-constants.js'
import { attentionQueues } from '../lib/attention-queues.js'
import { today } from '../lib/format.js'
import { NewPurchaseButton } from '../components/NewPurchaseButton.jsx'
import { AttentionInbox } from '../components/dashboard/AttentionInbox.jsx'
import { CounterBand } from '../components/dashboard/CounterBand.jsx'
import { periodItems, stageItems } from '../components/dashboard/WorkSummary.jsx'
import { RecentPanel, SpendTrendPanel, SupplierRankingPanel } from '../components/dashboard/DashboardCharts.jsx'
import { DocumentaryHome } from '../components/dashboard/DocumentaryHome.jsx'

// Inicio as a work board: a band of counters on top (stages of the flow and
// the 12-month figures), then the work waiting on the user's role and the
// latest movement at full width, charts last and side by side at equal
// height. Control documental has its own board without amounts.
export default function PurchasesDashboard() {
  const navigate = useNavigate()
  const dashboard = usePurchasesDashboard()
  const caps = useCapabilities()
  const can = usePurchasesCan()
  const data = dashboard.data
  const isLoading = dashboard.isLoading || caps.isLoading
  const queues = useMemo(() => (data ? attentionQueues({ has: caps.has, can, data, today: today() }) : []), [data, caps.has, can])
  const presetName = PRESETS.find((p) => p.key === caps.data?.preset)?.name
  const openDoc = (kind, id) => navigate(`${ROOT}/${kind}/${id}`)

  if (dashboard.isError) {
    return (
      <div className="min-h-dvh p-4 md:p-6">
        <ErrorState title="No se pudo cargar Compras" description="Revisa tu conexión o que el servidor tenga las migraciones aplicadas, y vuelve a intentar." onRetry={dashboard.refetch} />
      </div>
    )
  }

  const showOrdered = caps.has('purchaseOrders') && can('purchases.order.read')
  const showTrend = showOrdered || (caps.has('invoices') && can('purchases.invoice.read'))
  const charts = data ? [
    showTrend && <SpendTrendPanel key="trend" monthly={data.monthly} showOrdered={showOrdered} className="h-full" />,
    <SupplierRankingPanel key="suppliers" rows={data.topSuppliers} onSelect={(row) => navigate(`${ROOT}/suppliers/${row.id}`)} className="h-full" />,
  ].filter(Boolean) : []

  return (
    <div className="min-h-dvh space-y-5 p-4 pb-24 md:p-6 md:pb-24">
      <PageHeader eyebrow={caps.documentary ? 'Compras · Control documental' : presetName ? `Compras · flujo ${presetName.toLowerCase()}` : 'Compras'} title="Inicio"
        description={caps.documentary ? 'Órdenes y facturas registradas como referencias, y los inventarios que amparan.' : 'Lo que espera a tu rol, cómo va el proceso y lo último que se movió.'}
        actions={<NewPurchaseButton />} />

      {isLoading || !data ? (
        <div className="space-y-4">
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      ) : caps.documentary ? (
        <DocumentaryHome data={data} has={caps.has} onOpen={openDoc} />
      ) : (
        <>
          <CounterBand label="Resumen de compras" groups={[
            { key: 'stages', title: 'En proceso', items: stageItems(data.pipeline, can) },
            { key: 'period', title: 'Últimos 12 meses', items: periodItems(data.metrics, caps.has) },
          ]} />
          <AttentionInbox queues={queues} />
          <RecentPanel rows={data.recent} onOpen={openDoc} />
          <div className={cn('grid items-stretch gap-4', charts.length > 1 && 'lg:grid-cols-2')}>{charts}</div>
        </>
      )}
    </div>
  )
}
