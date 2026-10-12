import { CalendarClock } from 'lucide-react'

const ORDER = [1, 2, 3, 4, 5, 6, 0]
const SHORT = { 1: 'L', 2: 'M', 3: 'X', 4: 'J', 5: 'V', 6: 'S', 0: 'D' }
const LONG = { 1: 'Lunes', 2: 'Martes', 3: 'Miércoles', 4: 'Jueves', 5: 'Viernes', 6: 'Sábado', 0: 'Domingo' }
const toMin = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + m }

// Plan of one weekday from the shift: { start, end } or null (rest day).
function planOf(shift, weekday) {
  const custom = shift.dayHours?.[weekday] ?? shift.dayHours?.[String(weekday)]
  if (shift.dayHours && Object.keys(shift.dayHours).length) return custom?.start && custom?.end ? custom : null
  const days = Array.isArray(shift.days) && shift.days.length ? shift.days.map(Number) : [0, 1, 2, 3, 4, 5, 6]
  return days.includes(weekday) && shift.startTime && shift.endTime ? { start: shift.startTime, end: shift.endTime } : null
}

function spanHours(plan) {
  const s = toMin(plan.start), e = toMin(plan.end)
  return ((e > s ? e - s : e + 1440 - s) / 60)
}

const fmtH = (h) => (Number.isInteger(h) ? `${h} h` : `${h.toFixed(1)} h`)

// "Tu horario": the week at a glance. Worked days show their start-end and length, rest
// days are dimmed and today's column is highlighted.
export function ScheduleCard({ shift, todayWeekday }) {
  if (!shift) {
    return <p className="rounded-2xl bg-white/5 p-4 text-sm text-slate-300 ring-1 ring-white/10">Aún no tienes un horario asignado.</p>
  }
  const plans = ORDER.map((d) => ({ d, plan: planOf(shift, d) }))
  const total = plans.reduce((n, { plan }) => n + (plan ? spanHours(plan) : 0), 0)
  const workDays = plans.filter((p) => p.plan).length
  return (
    <div className="overflow-hidden rounded-2xl bg-white/5 ring-1 ring-white/10">
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-teal-500/15 text-teal-300"><CalendarClock className="size-5" aria-hidden="true" /></span>
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-white">{shift.name}</p>
          <p className="text-xs text-slate-400">{workDays} {workDays === 1 ? 'día' : 'días'} · {fmtH(total)} por semana</p>
        </div>
      </div>
      <ul className="divide-y divide-white/5 px-2 py-1">
        {plans.map(({ d, plan }) => {
          const today = todayWeekday === d
          return (
            <li key={d} className={`flex items-center gap-3 rounded-xl px-2 py-2 ${today ? 'bg-teal-500/10 ring-1 ring-teal-400/30' : ''}`}>
              <span className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${plan ? (today ? 'bg-teal-500 text-white' : 'bg-white/10 text-slate-100') : 'bg-white/[0.03] text-slate-500'}`} aria-hidden="true">{SHORT[d]}</span>
              <span className={`flex-1 text-sm ${plan ? 'font-medium text-slate-100' : 'text-slate-500'}`}>{LONG[d]}{today ? <span className="ml-2 rounded-full bg-teal-500/20 px-2 py-0.5 text-[11px] font-medium text-teal-200">Hoy</span> : null}</span>
              {plan ? (
                <span className="text-right tabular-nums">
                  <span className="block text-sm font-semibold text-white">{plan.start} – {plan.end}</span>
                  <span className="block text-[11px] text-slate-400">{fmtH(spanHours(plan))}</span>
                </span>
              ) : <span className="text-xs text-slate-500">Descanso</span>}
            </li>
          )
        })}
      </ul>
      {Number(shift.breakMinutes) > 0 ? <p className="border-t border-white/10 px-4 py-2 text-[11px] text-slate-400">Incluye {shift.breakMinutes} min de descanso por día trabajado.</p> : null}
    </div>
  )
}
