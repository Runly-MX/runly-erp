import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ErrorState, PageHeader, Skeleton } from '@runly/ui'
import { useCapabilities, usePurchasesCan, usePurchasesDashboard } from '../hooks/usePurchases.js'
import { PRESETS, ROOT } from '../lib/purchases-constants.js'
import { attentionQueues } from '../lib/attention-queues.js'
import { today } from '../lib/format.js'
import { NewPurchaseButton } from '../components/NewPurchaseButton.jsx'
import { AttentionInbox } from '../components/dashboard/AttentionInbox.jsx'
import { PeriodSummary, StageCounts } from '../components/dashboard/WorkSummary.jsx'
import { RecentPanel, SpendTrendPanel, SupplierRankingPanel } from '../components/dashboard/DashboardCharts.jsx'

// Inicio (direction A, "mesa de trabajo"): what needs the user's role now,
// then where the process stands and what moved lately; charts last.
export default function PurchasesDashboard() {
  const navigate = useNavigate()
  const dashboard = usePurchasesDashboard()
  const caps = useCapabilities()
  const can = usePurchasesCan()
  const data = dashboard.data
  const isLoading = dashboard.isLoading || caps.isLoading
  const queues = useMemo(() => (data ? attentionQueues({ has: caps.has, can, data, today: today() }) : []), [data, caps.has, can])
  const presetName = PRESETS.find((p) => p.key === caps.data?.preset)?.name

  if (dashboard.isError) {
    return (
      <div className="min-h-dvh p-4 md:p-6">
        <ErrorState title="No se pudo cargar Compras" description="Revisa tu conexión o que el servidor tenga las migraciones aplicadas, y vuelve a intentar." onRetry={dashboard.refetch} />
      </div>
    )
  }

  const showOrdered = caps.has('purchaseOrders') && can('purchases.order.read')
  const showTrend = showOrdered || (caps.has('invoices') && can('purchases.invoice.read'))

  return (
    <div className="min-h-dvh space-y-5 p-4 pb-24 md:p-6 md:pb-24">
      <PageHeader eyebrow={presetName ? `Compras · flujo ${presetName.toLowerCase()}` : 'Compras'} title="Inicio"
        description="Lo que espera a tu rol, cómo va el proceso y lo último que se movió."
        actions={<NewPurchaseButton />} />

      {isLoading || !data ? (
        <div className="grid gap-4 xl:grid-cols-3">
          <Skeleton className="h-80 rounded-2xl xl:col-span-2" />
          <Skeleton className="h-80 rounded-2xl" />
        </div>
      ) : (
        <>
          <div className="grid items-start gap-4 xl:grid-cols-3">
            <div className="min-w-0 xl:col-span-2"><AttentionInbox queues={queues} /></div>
            <div className="grid min-w-0 items-start gap-4 md:grid-cols-2 xl:grid-cols-1">
              <PeriodSummary metrics={data.metrics} has={caps.has} />
              <StageCounts pipeline={data.pipeline} can={can} />
            </div>
          </div>
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <RecentPanel rows={data.recent} onOpen={(kind, id) => navigate(`${ROOT}/${kind}/${id}`)} />
            {showTrend ? <SpendTrendPanel monthly={data.monthly} showOrdered={showOrdered} /> : null}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <SupplierRankingPanel rows={data.topSuppliers} onSelect={(row) => navigate(`${ROOT}/suppliers/${row.id}`)} />
          </div>
        </>
      )}
    </div>
  )
}
