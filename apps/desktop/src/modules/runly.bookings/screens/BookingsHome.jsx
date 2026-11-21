import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button, ErrorState, PageHeader, SectionCard, Skeleton, StatusPill } from '@runly/ui'
import { CalendarClock, ChevronRight, Globe, Plus, Ticket } from 'lucide-react'
import { runly } from '../../../lib/runly.js'
import { NoSpaces, PageShell } from '../components/shared.jsx'
import { SpaceFormDialog } from '../components/SpaceFormDialog.jsx'
import { useBookingsMe, useBookingsMutation, useSpaces, useSummary } from '../hooks/useBookings.js'
import { MODE, MUTED_TEXT, ROLE, bookingsPath } from '../lib/bookingsLabels.js'
import { formatDateTime } from '../lib/bookingsTime.js'

// "Mis sistemas": every booking space the person can see in this company.
export default function BookingsHome() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const me = useBookingsMe()
  const spaces = useSpaces()
  const [open, setOpen] = useState(false)
  const canCreate = Boolean(me.data?.canManageCatalog)
  const create = useBookingsMutation((t, data) => runly.bookings.createSpace(data, t), { success: 'Sistema creado.' })
  useEffect(() => {
    if (params.get('new') === '1' && canCreate) { setOpen(true); setParams((p) => { const n = new URLSearchParams(p); n.delete('new'); return n }, { replace: true }) }
  }, [params, canCreate, setParams])

  async function submit(data) {
    try {
      const space = await create.mutateAsync(data)
      setOpen(false)
      if (space?.id) navigate(bookingsPath(`/spaces/${space.id}`))
    } catch { /* toast from the mutation */ }
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="Reservaciones"
        title="Mis sistemas"
        description="Cada sistema tiene sus servicios, horarios, recursos, equipo y políticas. Entra a uno para configurarlo u operar sus reservaciones."
        actions={canCreate ? <Button type="button" onClick={() => setOpen(true)} className="w-full sm:w-auto"><Plus />Nuevo sistema</Button> : null}
      />
      {spaces.isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{[0, 1].map((i) => <Skeleton key={i} className="h-40 w-full" />)}</div>
      ) : spaces.isError ? <ErrorState title="No se pudieron cargar los sistemas" onRetry={() => spaces.refetch()} />
        : !spaces.data?.length ? <NoSpaces canCreate={canCreate} />
          : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {spaces.data.map((space) => <SpaceCard key={space.id} space={space} onOpen={() => navigate(bookingsPath(`/spaces/${space.id}`))} />)}
            </div>
          )}
      <SpaceFormDialog open={open} onOpenChange={setOpen} onSubmit={submit} pending={create.isPending} />
    </PageShell>
  )
}

function SpaceCard({ space, onOpen }) {
  const summary = useSummary(space.id)
  const s = summary.data
  const upcoming = (s?.upcomingByStatus?.CONFIRMED ?? 0) + (s?.upcomingByStatus?.PENDING ?? 0)
  return (
    <SectionCard
      title={space.name}
      icon={CalendarClock}
      description={space.description || `${MODE[space.mode]} · ${space.timezone}`}
      action={<Button type="button" variant="ghost" size="sm" onClick={onOpen} aria-label={`Abrir ${space.name}`}>Abrir<ChevronRight /></Button>}
    >
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone={space.enabled ? 'success' : 'neutral'} size="sm">{space.enabled ? 'Operando' : 'Desactivado'}</StatusPill>
        <StatusPill tone="neutral" size="sm">{MODE[space.mode]}</StatusPill>
        {space.role ? <StatusPill tone="brand" size="sm">{ROLE[space.role]}</StatusPill> : null}
        {space.published ? <StatusPill tone="brand" size="sm" icon={Globe}>Publicado</StatusPill> : null}
        {space.ownerModule === 'runly.ticketing' ? <StatusPill tone="neutral" size="sm" icon={Ticket}>Administrado por Boletos</StatusPill> : null}
      </div>
      {summary.isLoading ? <Skeleton className="mt-3 h-14 w-full" /> : s ? (
        <div className="mt-3 space-y-2">
          <p className="text-sm"><span className="font-semibold tabular-nums">{upcoming}</span> reservaciones próximas · {s.services} servicios · {s.resources} recursos</p>
          {s.next.length ? (
            <ul className="space-y-1">
              {s.next.slice(0, 3).map((b) => (
                <li key={b.id} className={`${MUTED_TEXT} truncate`}>{formatDateTime(b.startsAt, space.timezone)} · {b.guestName || 'Sin nombre'}</li>
              ))}
            </ul>
          ) : <p className={MUTED_TEXT}>Sin reservaciones próximas.</p>}
        </div>
      ) : null}
    </SectionCard>
  )
}
