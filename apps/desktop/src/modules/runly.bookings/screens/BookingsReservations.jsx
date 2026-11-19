import { useEffect, useMemo, useState } from 'react'
import { Button, DataTable, DateField, ErrorState, PageHeader, SearchInput, SelectField, Skeleton, useIsMobile } from '@runly/ui'
import { CalendarPlus, ChevronLeft, ChevronRight, FileSpreadsheet, ListChecks, Loader2 } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { runly } from '../../../lib/runly.js'
import { BookingDetailSheet } from '../components/BookingDetailSheet.jsx'
import { BookingFormDialog } from '../components/BookingDialogs.jsx'
import { FiltersPanel, MUTED, NoSpaces, PageShell, SpaceSwitcher, StatusBadge } from '../components/shared.jsx'
import {
  useBookingRole, useBookingsMe, useReservations, useResources, useSelectedSpace, useServices, useSpaceResourceIds, useSpaces, useToken,
} from '../hooks/useBookings.js'
import { STATUS_OPTIONS, bookingsError } from '../lib/bookingsLabels.js'
import { dayKey, daysRange, formatDateTime, formatTime, keyParts, wallToInstant } from '../lib/bookingsTime.js'

const PAGE = 25
const ALL = 'all'

function saveBlob(blob, fileName) {
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: fileName })
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Server-side search of one space's reservations (status, dates, service,
// resource, text) with paging and an Excel export of the same filters.
export default function BookingsReservations() {
  const token = useToken()
  const isMobile = useIsMobile()
  const spaces = useSpaces()
  const me = useBookingsMe()
  const [spaceId, selectSpace] = useSelectedSpace(spaces.data)
  const space = spaces.data?.find((s) => s.id === spaceId)
  const tz = space?.timezone ?? 'UTC'
  const { canOperate } = useBookingRole(space)
  const services = useServices(spaceId)
  const resources = useResources({ enabled: Boolean(spaceId) })
  const linked = useSpaceResourceIds(spaceId)
  const spaceResources = (resources.data ?? []).filter((r) => (linked.data ?? []).includes(r.id))
  const [filters, setFilters] = useState({ q: '', status: ALL, serviceId: ALL, resourceId: ALL, from: '', to: '' })
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [openId, setOpenId] = useState(null)
  // Deep link from Calendario: ?reservacion=<id> opens it in its own system.
  const [params, setParams] = useSearchParams()
  const deepLinked = params.get('reservacion')
  useEffect(() => {
    if (!deepLinked || !token || !spaces.data) return
    runly.bookings.getReservation(deepLinked, token)
      .then((res) => { if (res?.data?.spaceId) selectSpace(res.data.spaceId); setOpenId(deepLinked) })
      .catch((error) => toast.error(bookingsError(error, 'No se pudo abrir la reservación.')))
      .finally(() => setParams((p) => { const n = new URLSearchParams(p); n.delete('reservacion'); return n }, { replace: true }))
  }, [deepLinked, token, spaces.data]) // eslint-disable-line react-hooks/exhaustive-deps
  const [creating, setCreating] = useState(false)
  const [exporting, setExporting] = useState(false)
  useEffect(() => { const t = setTimeout(() => setFilters((f) => ({ ...f, q: search.trim() })), 300); return () => clearTimeout(t) }, [search])
  useEffect(() => { setPage(0) }, [filters, spaceId])
  useEffect(() => { if (space && !filters.from) setFilters((f) => ({ ...f, from: dayKey(new Date(), tz) })) }, [space]) // eslint-disable-line react-hooks/exhaustive-deps

  const query = useMemo(() => ({
    ...(filters.q ? { q: filters.q } : {}),
    ...(filters.status !== ALL ? { status: filters.status } : {}),
    ...(filters.serviceId !== ALL ? { serviceId: filters.serviceId } : {}),
    ...(filters.resourceId !== ALL ? { resourceId: filters.resourceId } : {}),
    ...(filters.from ? { from: wallToInstant(keyParts(filters.from), tz).toISOString() } : {}),
    ...(filters.to ? { to: daysRange(filters.to, 1, tz).to.toISOString() } : {}),
  }), [filters, tz])
  const reservations = useReservations(space ? spaceId : null, { ...query, limit: PAGE, offset: page * PAGE })
  const items = reservations.data?.items ?? []
  const total = reservations.data?.total ?? 0
  const serviceName = useMemo(() => new Map((services.data ?? []).map((s) => [s.id, s.name])), [services.data])
  const resourceName = useMemo(() => new Map((resources.data ?? []).map((r) => [r.id, r.name])), [resources.data])

  const columns = useMemo(() => [
    {
      id: 'when', header: 'Fecha y hora', enableSorting: false,
      cell: ({ row }) => <div className="min-w-0"><p className="font-medium tabular-nums">{formatDateTime(row.original.startsAt, tz)}</p><p className={MUTED}>hasta {formatTime(row.original.endsAt, tz)}</p></div>,
    },
    { id: 'guest', header: 'Cliente', enableSorting: false, cell: ({ row }) => <div className="min-w-0"><p className="truncate">{row.original.guestName || 'Sin nombre'}</p><p className={`${MUTED} truncate`}>{row.original.guestPhone || row.original.guestEmail || ''}</p></div> },
    { id: 'service', header: 'Servicio', enableSorting: false, cell: ({ row }) => <span className="text-sm">{serviceName.get(row.original.serviceId) ?? '—'}</span> },
    { id: 'resource', header: 'Recurso', enableSorting: false, cell: ({ row }) => <span className="text-sm">{(row.original.resourceIds ?? []).map((id) => resourceName.get(id)).filter(Boolean).join(', ') || '—'}</span> },
    { id: 'status', header: 'Estado', enableSorting: false, cell: ({ row }) => <StatusBadge status={row.original.status} size="sm" /> },
    { id: 'open', header: '', enableSorting: false, cell: ({ row }) => <Button type="button" variant="outline" size="sm" onClick={() => setOpenId(row.original.id)}>Abrir</Button> },
  ], [tz, serviceName, resourceName])

  async function exportXlsx() {
    setExporting(true)
    try {
      saveBlob(await runly.bookings.exportReservations(spaceId, query, token), `reservaciones-${space.slug}.xlsx`)
    } catch (error) {
      toast.error(bookingsError(error, 'No se pudo exportar.'))
    } finally { setExporting(false) }
  }

  if (spaces.isPending) return <PageShell><Skeleton className="h-96 w-full" /></PageShell>
  if (spaces.isError) return <PageShell><ErrorState title="No se pudieron cargar los sistemas" onRetry={() => spaces.refetch()} /></PageShell>
  if (!space) return <PageShell><PageHeader eyebrow="Reservaciones" title="Reservaciones" /><NoSpaces canCreate={Boolean(me.data?.canManageCatalog)} /></PageShell>
  const pages = Math.max(1, Math.ceil(total / PAGE))

  return (
    <PageShell>
      <PageHeader
        eyebrow="Reservaciones"
        title="Reservaciones"
        description={`${space.name} · horario de ${tz}`}
        actions={(
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <Button type="button" variant="outline" onClick={exportXlsx} disabled={exporting || !total}>{exporting ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <FileSpreadsheet />}Excel</Button>
            {canOperate && space.enabled ? <Button type="button" onClick={() => setCreating(true)}><CalendarPlus />Nueva reservación</Button> : null}
          </div>
        )}
      />
      <SpaceSwitcher spaces={spaces.data} value={spaceId} onChange={(id) => { selectSpace(id); setFilters((f) => ({ ...f, serviceId: ALL, resourceId: ALL })) }} />
      <FiltersPanel active={[filters.status, filters.serviceId, filters.resourceId].filter((v) => v !== ALL).length + (filters.to ? 1 : 0)} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <SelectField label="Estado" options={[{ value: ALL, label: 'Todos' }, ...STATUS_OPTIONS]} value={filters.status} onValueChange={(status) => setFilters((f) => ({ ...f, status }))} />
        <SelectField label="Servicio" options={[{ value: ALL, label: 'Todos' }, ...(services.data ?? []).map((s) => ({ value: s.id, label: s.name }))]} value={filters.serviceId} onValueChange={(serviceId) => setFilters((f) => ({ ...f, serviceId }))} />
        <SelectField label="Recurso" options={[{ value: ALL, label: 'Todos' }, ...spaceResources.map((r) => ({ value: r.id, label: r.name }))]} value={filters.resourceId} onValueChange={(resourceId) => setFilters((f) => ({ ...f, resourceId }))} />
        <DateField label="Desde" value={filters.from} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} />
        <DateField label="Hasta" value={filters.to} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} />
      </FiltersPanel>
      <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por cliente, correo, teléfono o notas…" aria-label="Buscar reservaciones" />
      <DataTable
        columns={columns}
        data={items}
        getRowId={(b) => b.id}
        isLoading={reservations.isLoading}
        isError={reservations.isError}
        onRetry={() => reservations.refetch()}
        showToolbar={false}
        showPagination={false}
        manualPagination
        pageSize={PAGE}
        emptyIcon={ListChecks}
        emptyTitle="Sin reservaciones con estos filtros"
        emptyDescription="Cambia las fechas o los filtros, o registra una reservación nueva."
        viewModes={['table', 'cards']}
        viewMode={isMobile ? 'cards' : 'table'}
        cardGridClassName="grid-cols-1"
        renderCard={(b) => (
          <button type="button" onClick={() => setOpenId(b.id)} aria-label={`Abrir reservación de ${b.guestName || 'cliente sin nombre'}`}
            className="flex min-h-11 w-full items-start justify-between gap-3 rounded-md border border-[hsl(var(--border))] p-3 text-left focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:outline-none">
            <span className="min-w-0">
              <span className="block text-sm font-semibold tabular-nums">{formatDateTime(b.startsAt, tz)}</span>
              <span className="block truncate text-sm">{b.guestName || 'Sin nombre'}</span>
              <span className={`${MUTED} block truncate`}>{[serviceName.get(b.serviceId), ...(b.resourceIds ?? []).map((id) => resourceName.get(id))].filter(Boolean).join(' · ')}</span>
            </span>
            <StatusBadge status={b.status} size="sm" />
          </button>
        )}
      />
      {total > PAGE ? (
        <div className="flex items-center justify-between gap-3 text-sm text-[hsl(var(--muted-foreground))]">
          <span>{page * PAGE + 1}–{page * PAGE + items.length} de {total}</span>
          <div className="flex items-center gap-1">
            <Button type="button" variant="outline" size="icon" className="h-11 w-11" disabled={page === 0} onClick={() => setPage((p) => p - 1)} aria-label="Página anterior"><ChevronLeft /></Button>
            <Button type="button" variant="outline" size="icon" className="h-11 w-11" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)} aria-label="Página siguiente"><ChevronRight /></Button>
          </div>
        </div>
      ) : null}
      <BookingDetailSheet bookingId={openId} onOpenChange={(v) => !v && setOpenId(null)} space={space} services={services.data ?? []} resources={resources.data ?? []} canOperate={canOperate} />
      {canOperate ? <BookingFormDialog open={creating} onOpenChange={setCreating} space={space} services={services.data ?? []} resources={spaceResources} /> : null}
    </PageShell>
  )
}
