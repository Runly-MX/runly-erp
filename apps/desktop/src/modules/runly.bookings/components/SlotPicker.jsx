import { useMemo } from 'react'
import { Button, DateField, EmptyState, ErrorState, Skeleton, cn } from '@runly/ui'
import { CalendarSearch } from 'lucide-react'
import { useAvailability } from '../hooks/useBookings.js'
import { MUTED_TEXT } from '../lib/bookingsLabels.js'
import { daysRange, formatTime } from '../lib/bookingsTime.js'

// Free times of one service on one local day, as the Booking Engine reports
// them. Advisory: the server re-validates when the booking is saved.
// value: { startsAt, resourceIds } (appointments) or { sessionId } (sessions).
export function SlotPicker({ space, service, date, onDateChange, resourceId, value, onChange, excludeBookingWindow }) {
  const tz = space.timezone
  const query = useMemo(() => {
    if (!service || !date) return null
    const { from, to } = daysRange(date, 1, tz)
    return { serviceId: service.id, from: from.toISOString(), to: to.toISOString(), ...(resourceId ? { resourceId } : {}) }
  }, [service, date, tz, resourceId])
  const availability = useAvailability(space.id, query)
  const data = availability.data
  const isSession = service?.kind === 'session'

  return (
    <div className="space-y-3">
      <DateField label={`Fecha (${tz})`} value={date} onChange={(e) => { onDateChange(e.target.value); onChange(null) }} />
      {!service ? <p className={MUTED_TEXT}>Elige un servicio para ver los horarios libres.</p>
        : availability.isLoading ? <Skeleton className="h-24 w-full" />
          : availability.isError ? <ErrorState title="No se pudo consultar la disponibilidad" onRetry={() => availability.refetch()} />
            : isSession ? (
              data?.sessions?.length ? (
                <div role="radiogroup" aria-label="Sesiones disponibles" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {data.sessions.map((s) => {
                    const selected = value?.sessionId === s.id
                    const full = s.seatsLeft <= 0
                    return (
                      <Button key={s.id} type="button" role="radio" aria-checked={selected} variant={selected ? 'default' : 'outline'} disabled={full}
                        className="h-auto min-h-11 justify-between py-2" onClick={() => onChange({ sessionId: s.id })}>
                        <span>{formatTime(s.startsAt, tz)} a {formatTime(s.endsAt, tz)}</span>
                        <span className="text-xs">{full ? 'Sin cupo' : `${s.seatsLeft} lugares`}</span>
                      </Button>
                    )
                  })}
                </div>
              ) : <EmptyState icon={CalendarSearch} title="Sin sesiones ese día" description="Elige otra fecha o programa una sesión." />
            ) : data?.slots?.length ? (
              <div role="radiogroup" aria-label="Horarios disponibles" className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {data.slots.map((slot) => {
                  const iso = new Date(slot.startsAt).toISOString()
                  const selected = value?.startsAt === iso
                  return (
                    <Button key={iso} type="button" role="radio" aria-checked={selected} variant={selected ? 'default' : 'outline'}
                      className={cn('h-11 tabular-nums', excludeBookingWindow && 'px-2')} onClick={() => onChange({ startsAt: iso, resourceIds: slot.resourceIds })}>
                      {formatTime(slot.startsAt, tz)}
                    </Button>
                  )
                })}
              </div>
            ) : <EmptyState icon={CalendarSearch} title="Sin horarios libres ese día" description="Prueba otra fecha, otro recurso o revisa el horario del sistema." />}
    </div>
  )
}
