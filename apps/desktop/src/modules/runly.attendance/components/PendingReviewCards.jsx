import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClipboardCheck, Hourglass } from 'lucide-react'
import { Button } from '@runly/ui'
import { useDaysReport, useSettings } from '../hooks/useAttendanceData.js'
import { toLocalIso } from '../../../lib/localDate.js'
import { formatHm } from '../lib/shiftSchedule.js'

const BASE = '/app/m/runly.attendance'

function ReviewCard({ icon: Icon, title, value, caption, actionLabel, onAction }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber-600/30 bg-amber-600/10 p-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-600/15 text-amber-700 dark:text-amber-300"><Icon className="h-5 w-5" aria-hidden="true" /></span>
        <div className="min-w-0">
          <p className="text-sm font-semibold">{title} <span className="tabular-nums">{value}</span></p>
          <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">{caption}</p>
        </div>
      </div>
      <Button size="sm" variant="outline" className="shrink-0 max-sm:min-h-11" onClick={onAction}>{actionLabel}</Button>
    </div>
  )
}

// Summary cards for things waiting on a person: forgotten-punch requests and (when the company
// requires approval) overtime of the last two weeks. Renders nothing when there is nothing pending.
export function PendingReviewCards({ pendingCorrections = 0 }) {
  const navigate = useNavigate()
  const { data: settings } = useSettings()
  const needsApproval = Boolean(settings?.requireOvertimeApproval)
  const query = useMemo(() => {
    const now = new Date()
    return { from: toLocalIso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 13)), to: toLocalIso(now) }
  }, [])
  const days = useDaysReport(query, { enabled: needsApproval })
  const pendingOvertime = needsApproval ? (days.data?.totals?.pendingOvertimeMinutes ?? 0) : 0
  if (!pendingCorrections && !pendingOvertime) return null
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {pendingCorrections ? (
        <ReviewCard
          icon={ClipboardCheck} title="Solicitudes pendientes" value={pendingCorrections}
          caption="Checadas olvidadas que esperan tu respuesta" actionLabel="Revisar" onAction={() => navigate(`${BASE}/requests`)}
        />
      ) : null}
      {pendingOvertime ? (
        <ReviewCard
          icon={Hourglass} title="Extras por aprobar" value={formatHm(pendingOvertime)}
          caption="Horas extra de los últimos 14 días sin decisión" actionLabel="Ver reporte" onAction={() => navigate(`${BASE}/reports`)}
        />
      ) : null}
    </div>
  )
}
