import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarCheck, ClipboardList, Target, UserCheck, Users } from 'lucide-react'
import { Button, EmptyState, ErrorState, PageHeader, StatCard } from '@runly/ui'
import { KioskStatusBadge } from '../components/KioskStatusChips.jsx'
import { PresenceChart } from '../components/PresenceChart.jsx'
import { QuotaCards } from '../components/QuotaCards.jsx'
import { CardSkeletons, PageShell } from '../components/shared.jsx'
import { useKiosks, useSummary } from '../hooks/useAttendanceData.js'
import { useLookups } from '../hooks/useLookups.js'
import { formatDateTime, tallyBy } from '../lib/attendanceLabels.js'

const BASE = '/app/m/runly.attendance'

export default function AttendanceSummary() {
  const navigate = useNavigate()
  const summary = useSummary()
  // The summary payload only carries a slim kiosk list; the full list knows who awaits approval.
  const kiosks = useKiosks({ refetchInterval: 20_000 })
  const lookups = useLookups()
  const data = summary.data

  const byGroup = useMemo(() => tallyBy(data?.present?.byGroup, lookups.groups, 'Sin grupo'), [data, lookups.groups])
  const byCategory = useMemo(() => tallyBy(data?.present?.byCategory, lookups.categories, 'Sin categoría'), [data, lookups.categories])

  if (summary.isError) {
    return <PageShell><PageHeader eyebrow="Asistencia" title="Resumen" /><ErrorState onRetry={() => summary.refetch()} /></PageShell>
  }
  const kioskRows = (kiosks.data ?? []).filter((k) => k.enabled !== false)

  return (
    <PageShell>
      <PageHeader
        eyebrow="Asistencia"
        title="Resumen"
        description="Quién está presente ahora, cumplimiento de cuotas y estado de los kioskos. Se actualiza cada 20 segundos."
        actions={<Button variant="outline" onClick={() => navigate(`${BASE}/punches`)}><ClipboardList className="h-4 w-4" />Ver checadas</Button>}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Presentes ahora" value={data?.present?.total ?? 0} icon={UserCheck} loading={summary.isLoading} />
        <StatCard label="Personal activo" value={data?.people ?? 0} icon={Users} loading={summary.isLoading} />
        <StatCard label="Cuotas en incumplimiento" value={data?.quotas?.failing ?? 0} icon={Target} loading={summary.isLoading} />
        <StatCard label="Checadas marcadas (7 días)" value={data?.flaggedLast7d ?? 0} icon={CalendarCheck} loading={summary.isLoading} />
      </div>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Presencia en vivo</h2>
        {summary.isLoading ? <CardSkeletons count={2} className="h-56" /> : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <PresenceChart title="Por grupo" data={byGroup} />
            <PresenceChart title="Por categoría" data={byCategory} />
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Cumplimiento de cuotas</h2>
        {summary.isLoading ? <CardSkeletons /> : <QuotaCards rows={data?.quotas?.rows ?? []} lookups={lookups} />}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Kioskos</h2>
        {kiosks.isLoading ? <CardSkeletons count={3} className="h-16" /> : kioskRows.length === 0 ? (
          <EmptyState variant="compact" title="Aún no hay kioskos." action={{ label: 'Crear kiosko', onClick: () => navigate(`${BASE}/kiosks`) }} />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {kioskRows.map((kiosk) => (
              <div key={kiosk.id} className="flex items-center justify-between gap-3 rounded-xl surface-card p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{kiosk.name}</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">Última señal: {formatDateTime(kiosk.lastSeenAt)}</p>
                </div>
                <KioskStatusBadge kiosk={kiosk} />
              </div>
            ))}
          </div>
        )}
      </section>
    </PageShell>
  )
}
