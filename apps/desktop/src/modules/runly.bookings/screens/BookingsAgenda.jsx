import { useMemo, useState } from 'react'
import { Button, ErrorState, PageHeader, SegmentedControl, SelectField, Skeleton, useIsMobile } from '@runly/ui'
import { CalendarPlus, ChevronLeft, ChevronRight } from 'lucide-react'
import { BookingDetailSheet } from '../components/BookingDetailSheet.jsx'
import { BookingFormDialog } from '../components/BookingDialogs.jsx'
import { DayList, MonthGrid, TimeGrid } from '../components/AgendaViews.jsx'
import { FiltersPanel, NoSpaces, PageShell, SpaceSwitcher } from '../components/shared.jsx'
import {
  useBookingRole, useBookingsMe, useReservations, useResources, useSelectedSpace, useServices, useSpaceResourceIds, useSpaces,
} from '../hooks/useBookings.js'
import { RESOURCE_TYPE, STATUS_OPTIONS } from '../lib/bookingsLabels.js'
import { addDays, dayKey, daysInMonth, daysRange, formatKey, monthStart, weekStart } from '../lib/bookingsTime.js'

const VIEWS = [{ value: 'day', label: 'Día' }, { value: 'week', label: 'Semana' }, { value: 'month', label: 'Mes' }]
const ALL = 'all'

// Operational agenda of one space, in that space's time zone. Bookings come
// from the engine's search; nothing about availability is computed here.
export default function BookingsAgenda() {
  const isMobile = useIsMobile()
  const spaces = useSpaces()
  const me = useBookingsMe()
  const [spaceId, selectSpace] = useSelectedSpace(spaces.data)
  const space = spaces.data?.find((s) => s.id === spaceId)
  const tz = space?.timezone ?? 'UTC'
  const today = dayKey(new Date(), tz)
  const [view, setView] = useState(() => (typeof window !== 'undefined' && window.innerWidth < 768 ? 'day' : 'week'))
  const [anchor, setAnchor] = useState(null)
  const [filters, setFilters] = useState({ serviceId: ALL, resourceId: ALL, status: ALL })
  const [openId, setOpenId] = useState(null)
  const [creating, setCreating] = useState(false)
  const { canOperate } = useBookingRole(space)
  const services = useServices(spaceId)
  const resources = useResources({ enabled: Boolean(spaceId) })
  const linked = useSpaceResourceIds(spaceId)
  const spaceResources = (resources.data ?? []).filter((r) => (linked.data ?? []).includes(r.id))

  const current = anchor ?? today
  const days = useMemo(() => {
    if (view === 'day') return [current]
    if (view === 'week') return Array.from({ length: 7 }, (_, i) => addDays(weekStart(current), i))
    return Array.from({ length: daysInMonth(current) }, (_, i) => addDays(monthStart(current), i))
  }, [view, current])
  const range = useMemo(() => (space ? daysRange(days[0], days.length, tz) : null), [space, days, tz])
  const query = range ? {
    from: range.from.toISOString(), to: range.to.toISOString(), limit: 500,
    ...(filters.serviceId !== ALL ? { serviceId: filters.serviceId } : {}),
    ...(filters.resourceId !== ALL ? { resourceId: filters.resourceId } : {}),
    ...(filters.status !== ALL ? { status: filters.status } : {}),
  } : null
  const reservations = useReservations(range ? spaceId : null, query)
  const items = reservations.data?.items ?? []

  const step = (dir) => setAnchor(view === 'day' ? addDays(current, dir) : view === 'week' ? addDays(current, 7 * dir) : addDays(monthStart(current), dir > 0 ? daysInMonth(current) : -1))
  const title = view === 'month' ? formatKey(current, { month: 'long', year: 'numeric' })
    : view === 'week' ? `${formatKey(days[0], { day: 'numeric', month: 'short' })} – ${formatKey(days[6], { day: 'numeric', month: 'short', year: 'numeric' })}`
      : formatKey(current, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const serviceName = new Map((services.data ?? []).map((s) => [s.id, s.name]))
  const resourceName = new Map((resources.data ?? []).map((r) => [r.id, r.name]))
  const nameOf = (b) => [serviceName.get(b.serviceId), ...(b.resourceIds ?? []).map((id) => resourceName.get(id))].filter(Boolean).join(' · ')

  if (spaces.isPending) return <PageShell><Skeleton className="h-96 w-full" /></PageShell>
  if (spaces.isError) return <PageShell><ErrorState title="No se pudieron cargar los sistemas" onRetry={() => spaces.refetch()} /></PageShell>
  if (!space) return <PageShell><PageHeader eyebrow="Reservaciones" title="Agenda" /><NoSpaces canCreate={Boolean(me.data?.canManageCatalog)} /></PageShell>

  return (
    <PageShell>
      <PageHeader
        eyebrow="Reservaciones"
        title="Agenda"
        description={`Ocupación de ${space.name}. Horario de ${tz}.`}
        actions={canOperate && space.enabled ? <Button type="button" onClick={() => setCreating(true)} className="w-full sm:w-auto"><CalendarPlus />Nueva reservación</Button> : null}
      />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_3fr]">
        <SpaceSwitcher spaces={spaces.data} value={spaceId} onChange={(id) => { selectSpace(id); setFilters({ serviceId: ALL, resourceId: ALL, status: ALL }) }} className="sm:w-full" />
      <FiltersPanel active={Object.values(filters).filter((v) => v !== ALL).length} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SelectField label="Servicio" options={[{ value: ALL, label: 'Todos' }, ...(services.data ?? []).map((s) => ({ value: s.id, label: s.name }))]} value={filters.serviceId} onValueChange={(serviceId) => setFilters((f) => ({ ...f, serviceId }))} />
        <SelectField label="Recurso o responsable" options={[{ value: ALL, label: 'Todos' }, ...spaceResources.map((r) => ({ value: r.id, label: `${r.name} (${RESOURCE_TYPE[r.type]})` }))]} value={filters.resourceId} onValueChange={(resourceId) => setFilters((f) => ({ ...f, resourceId }))} />
        <SelectField label="Estado" options={[{ value: ALL, label: 'Todos' }, ...STATUS_OPTIONS]} value={filters.status} onValueChange={(status) => setFilters((f) => ({ ...f, status }))} />
      </FiltersPanel>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button type="button" variant="outline" size="icon" className="h-11 w-11" aria-label="Anterior" onClick={() => step(-1)}><ChevronLeft /></Button>
          <Button type="button" variant="outline" className="h-11" onClick={() => setAnchor(null)}>Hoy</Button>
          <Button type="button" variant="outline" size="icon" className="h-11 w-11" aria-label="Siguiente" onClick={() => step(1)}><ChevronRight /></Button>
          <h2 className="ml-2 text-base font-semibold first-letter:uppercase" aria-live="polite">{title}</h2>
        </div>
        <SegmentedControl ariaLabel="Vista de la agenda" options={VIEWS} value={view} onChange={setView} className="w-auto" />
      </div>
      {reservations.isLoading ? <Skeleton className="h-96 w-full" />
        : reservations.isError ? <ErrorState title="No se pudo cargar la agenda" onRetry={() => reservations.refetch()} />
          : view === 'month' ? <MonthGrid anchor={current} bookings={items} tz={tz} today={today} onPickDay={(key) => { setAnchor(key); setView('day') }} />
            : isMobile && view === 'week' ? <DayList days={days} bookings={items} tz={tz} onSelect={setOpenId} nameOf={nameOf} />
              : <TimeGrid days={days} bookings={items} tz={tz} today={today} onSelect={setOpenId} nameOf={nameOf} />}
      {reservations.data?.total > items.length ? <p className="text-xs text-[hsl(var(--muted-foreground))]">Se muestran {items.length} de {reservations.data.total}. Usa los filtros o la vista de día.</p> : null}
      <BookingDetailSheet bookingId={openId} onOpenChange={(v) => !v && setOpenId(null)} space={space} services={services.data ?? []} resources={resources.data ?? []} canOperate={canOperate} />
      {canOperate ? <BookingFormDialog open={creating} onOpenChange={setCreating} space={space} services={services.data ?? []} resources={spaceResources} initialDate={current} /> : null}
    </PageShell>
  )
}
