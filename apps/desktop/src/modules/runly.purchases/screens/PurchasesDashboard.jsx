import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { BellRing } from 'lucide-react'
import { ErrorState, PageHeader, Skeleton } from '@runly/ui'
import { useCapabilities, usePurchasesCan, usePurchasesDashboard } from '../hooks/usePurchases.js'
import { PRESETS, ROOT, TONES } from '../lib/purchases-constants.js'
import { WIDE_PANEL, boardSpans } from '../lib/board-spans.js'
import { attentionQueues } from '../lib/attention-queues.js'
import { today } from '../lib/format.js'
import { NewPurchaseButton } from '../components/NewPurchaseButton.jsx'
import { AttentionInbox } from '../components/dashboard/AttentionInbox.jsx'
import { KpiCards } from '../components/dashboard/KpiCards.jsx'
import { StagesPanel } from '../components/dashboard/StagesPanel.jsx'
import { periodItems, stageItems } from '../components/dashboard/WorkSummary.jsx'
import { RecentPanel, SpendTrendPanel, SupplierRankingPanel } from '../components/dashboard/DashboardCharts.jsx'
import { DocumentaryHome } from '../components/dashboard/DocumentaryHome.jsx'

// Inicio as a board: a row of KPI cards, then a grid of equal-height panels
// (the work waiting on the user's role beside the stages of the flow; the
// 12-month trend, latest movement and top suppliers sharing the next row).
// Control documental has its own board without amounts.
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
  const pending = queues.reduce((acc, q) => acc + q.count, 0)
  const kpis = data ? [
    { key: 'attention', label: 'Por atender', value: String(pending), hint: 'Según tu rol', icon: BellRing, tone: TONES.petrol, muted: !pending },
    ...periodItems(data.metrics, caps.has),
  ] : []
  const small = data ? [
    (className) => <StagesPanel key="stages" items={stageItems(data.pipeline, can)} className={className} />,
    showTrend && ((className) => <SpendTrendPanel key="trend" monthly={data.monthly} showOrdered={showOrdered} className={className} />),
    (className) => <RecentPanel key="recent" rows={data.recent} onOpen={openDoc} className={className} />,
    (className) => <SupplierRankingPanel key="suppliers" rows={data.topSuppliers} onSelect={(row) => navigate(`${ROOT}/suppliers/${row.id}`)} className={className} />,
  ].filter(Boolean) : []
  const spans = boardSpans(small.length)

  return (
    <div className="min-h-dvh space-y-5 p-4 pb-24 md:p-6 md:pb-24">
      <PageHeader eyebrow={caps.documentary ? 'Compras · Control documental' : presetName ? `Compras · flujo ${presetName.toLowerCase()}` : 'Compras'} title="Inicio"
        description={caps.documentary ? 'Órdenes y facturas registradas como referencias, y los inventarios que amparan.' : 'Lo que espera a tu rol, cómo va el proceso y lo último que se movió.'}
        actions={<NewPurchaseButton />} />

      {isLoading || !data ? (
        <div className="space-y-4">
          <Skeleton className="h-24 rounded-2xl" />
          <div className="grid gap-4 xl:grid-cols-12">
            <Skeleton className="h-80 rounded-2xl xl:col-span-8" />
            <Skeleton className="h-80 rounded-2xl xl:col-span-4" />
          </div>
        </div>
      ) : caps.documentary ? (
        <DocumentaryHome data={data} has={caps.has} onOpen={openDoc} />
      ) : (
        <>
          <KpiCards label="Resumen de compras" items={kpis} />
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-12">
            <AttentionInbox queues={queues} className={WIDE_PANEL} />
            {small.map((render, i) => render(spans[i]))}
          </div>
        </>
      )}
    </div>
  )
}
