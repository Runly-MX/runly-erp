import { useState } from 'react'
import { ArrowLeft, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@runly/ui'
import {
  CORRECTION_STATUS, formatDateTime, formatDayLabel, formatMinutes, formatSchedule, methodLabel, OVERTIME_STATUS,
} from '../lib/self-service.js'

const TONES = {
  amber: 'bg-amber-400/20 text-amber-200',
  green: 'bg-emerald-400/20 text-emerald-200',
  gray: 'bg-slate-400/20 text-slate-300',
  red: 'bg-red-400/20 text-red-200',
  blue: 'bg-sky-400/20 text-sky-200',
}

function Badge({ tone, children }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}>{children}</span>
}

function Tile({ label, value, note }) {
  return (
    <div className="rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-2xl font-semibold tabular-nums text-white">{value}</p>
      {note ? <p className="text-xs text-amber-200">{note}</p> : null}
    </div>
  )
}

function DayRow({ day }) {
  const ot = OVERTIME_STATUS[day.overtimeStatus]
  const showWorked = !day.absent && !day.restDay
  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="font-medium text-white">{formatDayLabel(day.day)}</p>
        <div className="mt-1 flex flex-wrap gap-1">
          {day.restDay ? <Badge tone="gray">Descanso</Badge> : null}
          {day.absent ? <Badge tone="red">Falta</Badge> : null}
          {day.lateMinutes > 0 ? <Badge tone="amber">Retardo {day.lateMinutes} min</Badge> : null}
          {day.earlyLeaveMinutes > 0 ? <Badge tone="amber">Salida temprana</Badge> : null}
          {day.overtimeMinutes > 0 && ot ? <Badge tone={ot.tone}>Extra {formatMinutes(day.overtimeMinutes)} · {ot.label}</Badge> : null}
          {day.openSession ? <Badge tone="blue">En curso</Badge> : null}
        </div>
      </div>
      <div className="shrink-0 text-right">
        {showWorked || day.workedMinutes > 0 ? (
          <>
            <p className="text-lg font-semibold tabular-nums text-white">{formatMinutes(day.workedMinutes)} h</p>
            {day.expectedMinutes > 0 ? <p className="text-xs text-slate-400">de {formatMinutes(day.expectedMinutes)}</p> : null}
          </>
        ) : <p className="text-slate-500">—</p>}
      </div>
    </li>
  )
}

function Section({ title, children }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">{title}</h3>
      {children}
    </section>
  )
}

// "Mis horas": weekly/monthly summary, schedule, daily list, recent punches and requests.
// `hours` comes from useMyHours (data + savedAt + loading + error).
export function MyHours({ hours, onBack }) {
  const [tab, setTab] = useState('week')
  const { data, loading, error, savedAt, refresh } = hours
  const totals = data ? data[tab === 'week' ? 'week' : 'month']?.totals : null
  const schedule = data ? formatSchedule(data.shift) : ''
  const pending = totals?.pendingOvertimeMinutes ?? 0
  const pendingNote = data?.requireOvertimeApproval && pending > 0 ? `Pendientes de aprobar ${formatMinutes(pending)}` : null

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-5 pb-12">
      <div className="flex items-center justify-between">
        <Button type="button" variant="ghost" size="sm" className="-ml-2 min-h-11 text-slate-300 hover:bg-white/10 hover:text-white" onClick={onBack}><ArrowLeft /> Volver</Button>
        <Button type="button" variant="ghost" size="sm" className="min-h-11 text-slate-300 hover:bg-white/10 hover:text-white" onClick={refresh} disabled={loading}>
          {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />} Actualizar
        </Button>
      </div>

      {!data ? (
        error ? (
          <p role="alert" className="rounded-2xl bg-red-500/15 p-4 text-center text-red-100 ring-1 ring-red-400/40">{error}</p>
        ) : (
          <div className="flex justify-center py-16"><Loader2 className="size-9 animate-spin text-teal-400" aria-label="Cargando" /></div>
        )
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <h2 className="min-w-0 truncate text-xl font-semibold text-white">{data.name}</h2>
            <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-medium ${data.insideNow ? 'bg-emerald-400/20 text-emerald-200' : 'bg-slate-400/20 text-slate-300'}`}>
              {data.insideNow ? 'Dentro ahora' : 'Fuera'}
            </span>
          </div>

          {error ? (
            <p role="status" className="rounded-xl bg-amber-400/10 p-3 text-sm text-amber-100 ring-1 ring-amber-300/30">
              {error}{savedAt ? ` Última actualización: ${formatDateTime(new Date(savedAt).toISOString())}.` : ''}
            </p>
          ) : null}

          <div role="tablist" aria-label="Periodo" className="grid grid-cols-2 gap-1 rounded-2xl bg-white/5 p-1">
            {[['week', 'Semana'], ['month', 'Mes']].map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={tab === value}
                onClick={() => setTab(value)}
                className={`min-h-11 rounded-xl text-base font-semibold transition ${tab === value ? 'bg-teal-600 text-white' : 'text-slate-300 hover:bg-white/10'}`}
              >
                {label}
              </button>
            ))}
          </div>

          {totals ? (
            <div className="grid grid-cols-2 gap-3">
              <Tile label="Días trabajados" value={totals.daysWorked} />
              <Tile label="Horas trabajadas" value={`${formatMinutes(totals.workedMinutes)} h`} />
              <Tile label="Horas extra" value={`${formatMinutes(totals.overtimeMinutes)} h`} note={pendingNote} />
              <Tile label="Retardos" value={totals.lateDays} />
              <Tile label="Faltas" value={totals.absentDays} />
            </div>
          ) : null}

          <Section title="Tu horario">
            <p className="rounded-2xl bg-white/5 p-3 text-sm text-slate-200 ring-1 ring-white/10">
              {schedule ? <><span className="font-medium text-white">{data.shift.name}</span><br />{schedule}</> : 'Sin horario asignado.'}
            </p>
          </Section>

          <Section title="Esta semana">
            {data.days?.length ? (
              <ul className="divide-y divide-white/10 rounded-2xl bg-white/5 px-3 ring-1 ring-white/10">
                {data.days.map((day) => <DayRow key={day.day} day={day} />)}
              </ul>
            ) : <p className="text-sm text-slate-400">Aún no hay días registrados.</p>}
          </Section>

          <Section title="Mis últimas checadas">
            {data.recentPunches?.length ? (
              <ul className="divide-y divide-white/10 rounded-2xl bg-white/5 px-3 ring-1 ring-white/10">
                {data.recentPunches.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="font-medium text-white">{p.direction === 'in' ? 'Entrada' : 'Salida'}</p>
                      <p className="text-sm text-slate-400">{formatDateTime(p.occurredAt)}</p>
                    </div>
                    <Badge tone="gray">{methodLabel(p.method)}</Badge>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-slate-400">Sin checadas recientes.</p>}
          </Section>

          {data.corrections?.length ? (
            <Section title="Mis solicitudes">
              <ul className="divide-y divide-white/10 rounded-2xl bg-white/5 px-3 ring-1 ring-white/10">
                {data.corrections.map((c) => {
                  const status = CORRECTION_STATUS[c.status] ?? CORRECTION_STATUS.pending
                  return (
                    <li key={c.id} className="space-y-1 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium text-white">{c.direction === 'in' ? 'Entrada' : 'Salida'} · {formatDateTime(c.occurredAt)}</p>
                        <Badge tone={status.tone}>{status.label}</Badge>
                      </div>
                      {c.reason ? <p className="text-sm text-slate-400">{c.reason}</p> : null}
                      {c.resolutionNote ? <p className="text-sm text-slate-300">Respuesta: {c.resolutionNote}</p> : null}
                    </li>
                  )
                })}
              </ul>
            </Section>
          ) : null}

          {savedAt && !error ? <p className="text-center text-xs text-slate-500">Actualizado {formatDateTime(new Date(savedAt).toISOString())}</p> : null}
        </>
      )}
    </div>
  )
}
