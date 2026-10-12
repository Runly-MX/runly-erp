import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClipboardList, MonitorSmartphone, Radio, Target } from 'lucide-react'
import { Button, EmptyState, ErrorState } from '@runly/ui'
import { KioskStatusBadge } from '../components/KioskStatusChips.jsx'
import { PresenceChart } from '../components/PresenceChart.jsx'
import { QuotaCards } from '../components/QuotaCards.jsx'
import { CardSkeletons, PageShell, ScreenHeader, SectionCard } from '../components/shared.jsx'
import { SummaryStats } from '../components/SummaryStats.jsx'
import { useAttendancePermissions, useKiosks, useSummary } from '../hooks/useAttendanceData.js'
import { useLookups } from '../hooks/useLookups.js'
import { formatDateTime, kioskStatus, tallyBy } from '../lib/attendanceLabels.js'

const BASE = '/app/m/runly.attendance'
const ACCENTS = { online: 'bg-emerald-500', pending: 'bg-amber-500', revoked: 'bg-rose-500', offline: 'bg-slate-400', unpaired: 'bg-slate-400' }

export default function AttendanceSummary() {
  const navigate = useNavigate()
  const summary = useSummary()
  // The summary payload only carries a slim kiosk list; the full list knows who awaits approval.
  const kiosks = useKiosks({ refetchInterval: 20_000 })
  const lookups = useLookups()
  const { canConfigure } = useAttendancePermissions()
  const data = summary.data

  const byGroup = useMemo(() => tallyBy(data?.present?.byGroup, lookups.groups, 'Sin grupo'), [data, lookups.groups])
  const byCategory = useMemo(() => tallyBy(data?.present?.byCategory, lookups.categories, 'Sin categoría'), [data, lookups.categories])

  if (summary.isError) {
    return <PageShell><ScreenHeader title="Resumen" /><ErrorState onRetry={() => summary.refetch()} /></PageShell>
  }
  const kioskRows = (kiosks.data ?? []).filter((k) => k.enabled !== false)

  return (
    <PageShell>
      <ScreenHeader
        title="Resumen"
        description="Quién está presente ahora, cumplimiento de cuotas y estado de los kioskos. Se actualiza cada 20 segundos."
        actions={<Button variant="outline" onClick={() => navigate(`${BASE}/punches`)}><ClipboardList className="h-4 w-4" />Ver checadas</Button>}
      />

      <SummaryStats data={data} loading={summary.isLoading} />

      <SectionCard title="Presencia en vivo" description="Personas dentro en este momento" icon={Radio}>
        {summary.isLoading ? <CardSkeletons count={2} className="h-48" /> : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <PresenceChart title="Por grupo" data={byGroup} bare />
            <PresenceChart title="Por categoría" data={byCategory} bare />
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Cumplimiento de cuotas" description="Presentes contra el mínimo requerido" icon={Target}
        actions={<Button variant="ghost" size="sm" className="max-sm:min-h-11" onClick={() => navigate(`${BASE}/setup?tab=quotas`)}>Configurar cuotas</Button>}
      >
        {summary.isLoading ? <CardSkeletons /> : <QuotaCards rows={data?.quotas?.rows ?? []} lookups={lookups} />}
      </SectionCard>

      <SectionCard
        title="Kioskos" description="Dispositivos de registro" icon={MonitorSmartphone}
        actions={<Button variant="ghost" size="sm" className="max-sm:min-h-11" onClick={() => navigate(`${BASE}/kiosks`)}>Administrar</Button>}
      >
        {kiosks.isLoading ? <CardSkeletons count={3} className="h-16" /> : kioskRows.length === 0 ? (
          <EmptyState
            icon={MonitorSmartphone} title="Aún no hay kioskos" description="Crea un kiosko y ábrelo en una tableta para empezar a registrar checadas."
            action={canConfigure ? { label: 'Crear kiosko', onClick: () => navigate(`${BASE}/kiosks`) } : undefined}
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {kioskRows.map((kiosk) => (
              <div key={kiosk.id} className="relative flex min-h-16 items-center justify-between gap-3 overflow-hidden rounded-xl border border-[hsl(var(--border))] py-3 pl-5 pr-3">
                <span className={`absolute inset-y-0 left-0 w-1 ${ACCENTS[kioskStatus(kiosk).key] ?? 'bg-slate-400'}`} aria-hidden="true" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{kiosk.name}</p>
                  <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">Última señal: {formatDateTime(kiosk.lastSeenAt)}</p>
                </div>
                <KioskStatusBadge kiosk={kiosk} />
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </PageShell>
  )
}
