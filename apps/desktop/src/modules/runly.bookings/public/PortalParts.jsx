import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, ErrorState, Skeleton, cn } from '@runly/ui'
import { ChevronLeft, ChevronRight, Clock, MapPin, Video } from 'lucide-react'
import { addDays, dayKey, daysRange, formatKey, formatTime } from '../lib/bookingsTime.js'
import { formatPolicyMinutes, portalError, unwrap } from './portalLib.js'

export function PortalHeader({ company, title, subtitle }) {
  return (
    <header className="flex items-center gap-3">
      {company?.logoUrl ? <img src={company.logoUrl} alt="" className="h-12 w-12 shrink-0 rounded-md object-contain" /> : (
        <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-(--brand-primary) text-lg font-bold text-(--brand-primary-foreground)">{(company?.name ?? '?').slice(0, 1)}</span>
      )}
      <div className="min-w-0">
        <p className="truncate text-sm text-[hsl(var(--muted-foreground))]">{company?.name}</p>
        <h1 className="text-xl font-semibold leading-tight sm:text-2xl">{title}</h1>
        {subtitle ? <p className="text-sm text-[hsl(var(--muted-foreground))]">{subtitle}</p> : null}
      </div>
    </header>
  )
}

export function Card({ children, className, ...props }) {
  return <section className={cn('rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 sm:p-5', className)} {...props}>{children}</section>
}

export function InfoLine({ icon: Icon, children }) {
  if (!children) return null
  return <p className="flex items-start gap-2 text-sm"><Icon className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" aria-hidden="true" /><span className="min-w-0 break-words">{children}</span></p>
}

export function PoliciesList({ policies }) {
  const items = [
    policies.requiresApproval ? 'Tu reservación queda pendiente hasta que el negocio la confirme.' : null,
    policies.cancelUntilMinutes != null ? `Puedes cancelar en línea hasta ${formatPolicyMinutes(policies.cancelUntilMinutes)} antes.` : 'Puedes cancelar en línea antes de tu cita.',
    policies.rescheduleUntilMinutes != null ? `Puedes reprogramar en línea hasta ${formatPolicyMinutes(policies.rescheduleUntilMinutes)} antes.` : 'Puedes reprogramar en línea antes de tu cita.',
    policies.cancellationPolicy, policies.reschedulePolicy, policies.punctualityPolicy,
  ].filter(Boolean)
  return <ul className="list-disc space-y-1 pl-5 text-sm">{items.map((item) => <li key={item} className="whitespace-pre-wrap">{item}</li>)}</ul>
}

export function SummaryRows({ rows }) {
  return (
    <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {rows.filter(([, value]) => value).map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-xs text-[hsl(var(--muted-foreground))]">{label}</dt>
          <dd className="text-sm font-medium break-words">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

export const LocationLines = ({ location, instructions }) => (
  <div className="space-y-1.5"><InfoLine icon={MapPin}>{location}</InfoLine><InfoLine icon={Clock}>{instructions}</InfoLine></div>
)

// Online appointment: the guest's way in (lobby link or the business's external URL).
// The API only sends it for confirmed bookings. Opens in a new tab, so it works framed too.
export function MeetingJoin({ meeting }) {
  if (!meeting?.url) return null
  return (
    <div className="flex flex-col gap-3 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.35)] p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 gap-3">
        <Video className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(var(--primary))]" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-semibold">Cita en línea</p>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            {meeting.kind === 'runly' ? 'Entra a la hora de tu cita: esperarás un momento hasta que el negocio te admita.' : 'Entra a la hora de tu cita con el enlace del negocio.'}
          </p>
        </div>
      </div>
      <Button asChild className="shrink-0"><a href={meeting.url} target="_blank" rel="noopener noreferrer"><Video />Unirse a la reunión</a></Button>
    </div>
  )
}

// Week strip + free times of the engine for the selected day. `fetchWeek(from, to)`
// returns { kind, slots | sessions } for those instants.
export function SlotChooser({ timezone, queryKey, fetchWeek, minDay, maxDay, value, onChange }) {
  const today = dayKey(new Date(), timezone)
  const [week, setWeek] = useState(() => ({ start: minDay ?? today, day: null }))
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(week.start, i)), [week.start])
  const range = daysRange(days[0], 7, timezone)
  const availability = useQuery({
    queryKey: [...queryKey, days[0]],
    queryFn: async () => unwrap(await fetchWeek(range.from.toISOString(), range.to.toISOString())),
    retry: false, staleTime: 0, refetchOnWindowFocus: true,
  })
  const items = availability.data?.kind === 'session' ? availability.data.sessions : availability.data?.slots ?? []
  const byDay = useMemo(() => {
    const map = new Map()
    for (const item of items) { const k = dayKey(item.startsAt, timezone); map.set(k, [...(map.get(k) ?? []), item]) }
    return map
  }, [items, timezone])
  const selectedDay = week.day && byDay.has(week.day) ? week.day : days.find((d) => byDay.has(d)) ?? null
  const chosen = selectedDay ? byDay.get(selectedDay) : []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="outline" size="icon" className="h-11 w-11" aria-label="Semana anterior" disabled={week.start <= (minDay ?? today)} onClick={() => setWeek({ start: addDays(week.start, -7), day: null })}><ChevronLeft /></Button>
        <p className="text-sm font-semibold first-letter:uppercase" aria-live="polite">{formatKey(days[0], { day: 'numeric', month: 'long' })} – {formatKey(days[6], { day: 'numeric', month: 'long', year: 'numeric' })}</p>
        <Button type="button" variant="outline" size="icon" className="h-11 w-11" aria-label="Semana siguiente" disabled={Boolean(maxDay) && addDays(week.start, 7) > maxDay} onClick={() => setWeek({ start: addDays(week.start, 7), day: null })}><ChevronRight /></Button>
      </div>
      {availability.isPending ? <Skeleton className="h-40 w-full" /> : availability.isError ? (
        <ErrorState title="No pudimos consultar los horarios" description={portalError(availability.error)} onRetry={() => availability.refetch()} />
      ) : (
        <>
          <div role="radiogroup" aria-label="Día" className="grid grid-cols-7 gap-1">
            {days.map((d) => {
              const free = byDay.has(d), active = d === selectedDay
              return (
                <button key={d} type="button" role="radio" aria-checked={active} disabled={!free} onClick={() => setWeek({ ...week, day: d })}
                  aria-label={`${formatKey(d)}${free ? '' : ', sin horarios'}`}
                  className={cn('flex min-h-14 flex-col items-center justify-center rounded-md border text-xs transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]',
                    active ? 'border-(--brand-primary) bg-(--brand-primary) text-(--brand-primary-foreground)' : free ? 'border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]' : 'border-transparent text-[hsl(var(--muted-foreground))] opacity-50')}>
                  <span className="first-letter:uppercase">{formatKey(d, { weekday: 'short' })}</span>
                  <span className="text-base font-semibold tabular-nums">{Number(d.slice(8))}</span>
                </button>
              )
            })}
          </div>
          {selectedDay ? (
            <div className="space-y-2">
              <p className="text-sm font-medium first-letter:uppercase">{formatKey(selectedDay)} · horario de {timezone}</p>
              <div role="radiogroup" aria-label="Horario" className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {chosen.map((item) => {
                  const iso = new Date(item.startsAt).toISOString()
                  const active = availability.data.kind === 'session' ? value?.sessionId === item.id : value?.startsAt === iso
                  return (
                    <Button key={item.id ?? iso} type="button" role="radio" aria-checked={active} variant={active ? 'default' : 'outline'} className="h-auto min-h-11 flex-col py-1.5 tabular-nums"
                      onClick={() => onChange(availability.data.kind === 'session' ? { sessionId: item.id, startsAt: iso, endsAt: item.endsAt } : { startsAt: iso, endsAt: item.endsAt })}>
                      <span>{formatTime(item.startsAt, timezone)}</span>
                      {item.seatsLeft != null ? <span className="text-[11px] font-normal">{item.seatsLeft} lugares</span> : null}
                    </Button>
                  )
                })}
              </div>
            </div>
          ) : <p className="rounded-md bg-[hsl(var(--muted))] p-3 text-sm">No hay horarios libres esta semana. Prueba la siguiente.</p>}
        </>
      )}
    </div>
  )
}
