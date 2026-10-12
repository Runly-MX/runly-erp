// Registry key: runly.hr:AttendanceSection
// Props (RunlyDetail "component" section contract): { data }
// Attendance summary for an HR employee. Renders nothing when the attendance
// module is unavailable or the user lacks permission (any request failure).
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, LoadingState } from '@runly/ui'
import { ArrowUpRight, CreditCard, KeyRound, Smartphone } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../../auth/AuthProvider.jsx'
import { runly } from '../../../lib/runly.js'
import {
  DIRECTION_LABELS, WEEKDAYS, flagLabel, flagVariant, formatDateTime, formatTime, methodLabel, KIND_LABELS,
} from '../../runly.attendance/lib/attendanceLabels.js'

const CREDENTIAL_META = {
  pin: { label: 'PIN', icon: KeyRound },
  card: { label: 'Tarjeta', icon: CreditCard },
  phone: { label: 'Teléfono', icon: Smartphone },
  device_key: { label: 'Teléfono', icon: Smartphone },
}

function hoursLabel(minutes) {
  const total = Math.max(0, Math.round(Number(minutes) || 0))
  return `${Math.floor(total / 60)}h ${total % 60}m`
}

function Row({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="shrink-0 text-xs text-[hsl(var(--muted-foreground))]">{label}</span>
      <span className="min-w-0 text-right text-[hsl(var(--foreground))]">{children}</span>
    </div>
  )
}

export default function AttendanceSection({ data }) {
  const employeeId = data?.id
  const { session, userProfile } = useAuth()
  const token = session?.access_token
  const qc = useQueryClient()
  const canManage = Boolean(userProfile?.isAdmin || (userProfile?.permissions ?? []).includes('attendance.people.manage'))
  const queryKey = ['attendance', 'hr-employee', employeeId]

  const { data: info, isLoading, isError } = useQuery({
    queryKey,
    enabled: Boolean(employeeId && token),
    retry: false,
    queryFn: async () => {
      const res = await runly.attendance.getEmployeeAttendance(employeeId, token)
      return res?.data ?? null
    },
  })

  const activate = useMutation({
    mutationFn: () => runly.attendance.createPersonFromHr(employeeId, token),
    onSuccess: () => { toast.success('Empleado activado en Asistencia.'); qc.invalidateQueries({ queryKey }) },
    onError: (err) => toast.error(err?.message || 'No se pudo activar en Asistencia.'),
  })

  if (!employeeId || isError) return null
  if (isLoading) return <LoadingState />

  if (!info) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[hsl(var(--muted-foreground))]">Sin registro en Asistencia</p>
        {canManage ? (
          <Button type="button" size="sm" className="min-h-11 sm:min-h-0" disabled={activate.isPending} onClick={() => activate.mutate()}>
            {activate.isPending ? 'Activando...' : 'Activar en Asistencia'}
          </Button>
        ) : null}
      </div>
    )
  }

  const { person, credentials = [], presentNow, lastPunch, minutesLast7d, recentPunches = [] } = info
  const shift = person.shift
  const classification = [KIND_LABELS[person.kind] ?? person.kind, person.group?.name, person.category?.name].filter(Boolean)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={presentNow ? 'success' : 'secondary'}>{presentNow ? 'Presente' : 'Ausente'}</Badge>
        {lastPunch ? (
          <span className="text-xs text-[hsl(var(--muted-foreground))]">
            {DIRECTION_LABELS[lastPunch.direction] ?? lastPunch.direction} {formatTime(lastPunch.occurredAt)}
          </span>
        ) : null}
      </div>

      <div className="space-y-2">
        <Row label="Turno">
          {shift ? (
            <span className="block">
              <span className="block">{shift.name}</span>
              <span className="block text-xs text-[hsl(var(--muted-foreground))]">{shift.startTime} - {shift.endTime}</span>
            </span>
          ) : <span className="text-[hsl(var(--muted-foreground))]">Sin turno</span>}
        </Row>
        {shift ? (
          <div className="flex flex-wrap justify-end gap-1" aria-label="Días del turno">
            {WEEKDAYS.map((d) => {
              const on = (shift.days ?? []).includes(d.value)
              return (
                <span key={d.value} className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold ${on ? 'bg-(--brand-soft) text-(--brand-primary)' : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]/60'}`}>
                  {d.label.charAt(0)}
                </span>
              )
            })}
          </div>
        ) : null}
        <Row label="Clasificación">{classification.length ? classification.join(' · ') : '—'}</Row>
        <Row label="Últimos 7 días"><span className="font-semibold tabular-nums">{hoursLabel(minutesLast7d)}</span></Row>
      </div>

      <div className="space-y-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Últimas marcas</p>
        {recentPunches.length === 0 ? (
          <p className="text-xs text-[hsl(var(--muted-foreground))]">Sin marcas recientes.</p>
        ) : (
          <ul className="space-y-1.5">
            {recentPunches.slice(0, 5).map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                <Badge variant={p.direction === 'in' ? 'success' : 'secondary'}>{DIRECTION_LABELS[p.direction] ?? p.direction}</Badge>
                <span className="tabular-nums text-[hsl(var(--foreground))]">{formatDateTime(p.occurredAt)}</span>
                <span className="text-[hsl(var(--muted-foreground))]">{methodLabel(p.method)}</span>
                {(p.flags ?? []).map((f) => <Badge key={f} variant={flagVariant(f)}>{flagLabel(f)}</Badge>)}
              </li>
            ))}
          </ul>
        )}
      </div>

      {credentials.length > 0 || person.hasPin ? (
        <div className="flex flex-wrap gap-1.5">
          {credentials.map((c) => {
            const meta = CREDENTIAL_META[c.type] ?? { label: c.label || c.type, icon: KeyRound }
            const Icon = meta.icon
            return (
              <Badge key={c.id} variant={c.status === 'active' ? 'outline' : 'secondary'}>
                <Icon className="h-3 w-3" />{meta.label}
              </Badge>
            )
          })}
          {person.hasPin && !credentials.some((c) => c.type === 'pin') ? (
            <Badge variant="outline"><KeyRound className="h-3 w-3" />PIN</Badge>
          ) : null}
        </div>
      ) : null}

      <Link
        to="/app/m/runly.attendance/people"
        className="inline-flex min-h-11 items-center gap-1 rounded-md text-xs font-medium text-(--brand-primary) transition-colors hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--brand-primary) sm:min-h-0"
      >
        Abrir en Asistencia<ArrowUpRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  )
}
