import { useState } from 'react'
import { Check, Minus, Plus, RotateCcw, X } from 'lucide-react'
import { Badge, Button } from '@runly/ui'
import { useReviewDay } from '../hooks/useAttendanceData.js'
import {
  formatDayLabel, formatTime, fullName, overtimeStatusLabel, overtimeStatusTone, planLabel,
} from '../lib/attendanceLabels.js'
import { formatHm } from '../lib/shiftSchedule.js'
import { PersonCell } from './PersonCell.jsx'
import { FormSheet, ToneBadge } from './shared.jsx'

const STEP = 15

// Approve / reject / clear controls for the overtime of one day (people with attendance.punch.manage).
function OvertimeReview({ personId, day }) {
  const review = useReviewDay()
  const [minutes, setMinutes] = useState(day.countedOvertimeMinutes || day.overtimeMinutes)
  const max = day.overtimeMinutes
  const set = (next) => setMinutes(Math.min(max, Math.max(0, next)))
  const send = (status, extra = {}) => review.mutate({ personId, day: day.day, status, ...extra })
  const busy = review.isPending
  return (
    <div className="flex flex-wrap items-center gap-2 pt-2">
      {day.overtimeStatus !== 'rejected' ? (
        <div className="inline-flex items-center gap-1" role="group" aria-label="Minutos a aprobar">
          <Button type="button" variant="outline" size="icon" aria-label="Disminuir 15 minutos" disabled={busy || minutes <= 0} onClick={() => set(minutes - STEP)}><Minus className="h-4 w-4" /></Button>
          <span className="min-w-12 text-center text-sm font-semibold tabular-nums">{formatHm(minutes)}</span>
          <Button type="button" variant="outline" size="icon" aria-label="Aumentar 15 minutos" disabled={busy || minutes >= max} onClick={() => set(minutes + STEP)}><Plus className="h-4 w-4" /></Button>
        </div>
      ) : null}
      <Button size="sm" disabled={busy || minutes <= 0} onClick={() => send('approved', { approvedMinutes: minutes })}><Check className="h-4 w-4" />Aprobar</Button>
      {day.overtimeStatus !== 'rejected' ? <Button size="sm" variant="outline" disabled={busy} onClick={() => send('rejected')}><X className="h-4 w-4" />Rechazar</Button> : null}
      {day.overtimeStatus !== 'pending' ? <Button size="sm" variant="ghost" disabled={busy} onClick={() => send('clear')}><RotateCcw className="h-4 w-4" />Quitar decisión</Button> : null}
    </div>
  )
}

function DayRow({ personId, day, canReview }) {
  const reviewable = ['pending', 'approved', 'rejected'].includes(day.overtimeStatus)
  const idle = day.restDay && !day.workedMinutes
  return (
    <li className={`rounded-xl border border-[hsl(var(--border))] p-3 ${idle ? 'bg-[hsl(var(--muted))]/40' : ''}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold">{formatDayLabel(day.day)}</p>
        <p className="text-xs text-[hsl(var(--muted-foreground))]">{planLabel(day)}</p>
      </div>
      {idle ? <p className="pt-1 text-sm text-[hsl(var(--muted-foreground))]">Día de descanso sin checadas.</p> : (
        <>
          <p className="pt-1 text-sm tabular-nums">
            Trabajadas <span className="font-semibold">{formatHm(day.workedMinutes)}</span> de {formatHm(day.expectedMinutes)} esperadas
            {day.firstIn ? <span className="text-[hsl(var(--muted-foreground))]"> · {formatTime(day.firstIn)} a {day.lastOut ? formatTime(day.lastOut) : '…'}</span> : null}
          </p>
          <div className="flex flex-wrap items-center gap-1.5 pt-2">
            {day.absent ? <ToneBadge tone="rose">Falta</ToneBadge> : null}
            {day.lateMinutes > 0 ? <ToneBadge tone="amber">Retardo {day.lateMinutes} min</ToneBadge> : null}
            {day.earlyLeaveMinutes > 0 ? <ToneBadge tone="amber">Salida temprana {day.earlyLeaveMinutes} min</ToneBadge> : null}
            {day.openSession ? <ToneBadge tone="blue">Sin salida</ToneBadge> : null}
            {day.overtimeMinutes > 0 ? (
              <ToneBadge tone={overtimeStatusTone(day.overtimeStatus)}>
                Extra {formatHm(day.overtimeMinutes)} · {overtimeStatusLabel(day.overtimeStatus)}
                {day.overtimeStatus === 'approved' && day.countedOvertimeMinutes !== day.overtimeMinutes ? ` (${formatHm(day.countedOvertimeMinutes)})` : ''}
              </ToneBadge>
            ) : null}
            {!day.absent && !day.lateMinutes && !day.earlyLeaveMinutes && !day.overtimeMinutes && !day.openSession ? <Badge variant="success">Sin incidencias</Badge> : null}
          </div>
          {canReview && reviewable ? <OvertimeReview key={`${day.day}-${day.overtimeStatus}-${day.countedOvertimeMinutes}`} personId={personId} day={day} /> : null}
        </>
      )}
    </li>
  )
}

// Right-hand sheet with the day-by-day breakdown of one person from the days report.
export function DayDetailSheet({ row, open, onOpenChange, canReview }) {
  const days = row?.days ?? []
  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Detalle por día"
      description={row ? `${fullName(row.person)} · ${formatHm(row.totals?.workedMinutes)} trabajadas, ${formatHm(row.totals?.countedOvertimeMinutes)} extras` : undefined}
    >
      {row ? (
        <>
          <PersonCell person={row.person} size="md" />
          <ul className="space-y-2">
            {days.map((day) => <DayRow key={day.day} personId={row.person.id} day={day} canReview={canReview} />)}
          </ul>
        </>
      ) : null}
    </FormSheet>
  )
}
