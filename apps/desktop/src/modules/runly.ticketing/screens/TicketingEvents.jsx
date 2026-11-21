import { useNavigate } from 'react-router-dom'
import { Button, EmptyState, ErrorState, PageHeader, ProgressBar, Skeleton, StatusPill } from '@runly/ui'
import { CalendarDays, ChevronRight, Plus, Ticket } from 'lucide-react'
import { formatDateTime } from '../../runly.bookings/lib/bookingsTime.js'
import { useEvents } from '../hooks/useTicketing.js'
import { MUTED, ticketingPath } from '../lib/ticketingLabels.js'
import { PageShell } from '../components/shared.jsx'
import { useAuth } from '../../../auth/AuthProvider.jsx'

// "Mis eventos": the events this person administers or works in, with sales at a glance.
export default function TicketingEvents() {
  const navigate = useNavigate()
  const events = useEvents()
  const { userProfile } = useAuth()
  const canCreate = Boolean(userProfile?.isAdmin || userProfile?.permissions?.includes('ticketing.events.manage') || userProfile?.permissions?.includes('ticketing.admin'))
  const create = canCreate ? <Button type="button" onClick={() => navigate(ticketingPath('/events/new'))} className="w-full sm:w-auto"><Plus />Nuevo evento</Button> : null

  return (
    <PageShell>
      <PageHeader eyebrow="Boletos" title="Mis eventos" description="Funciones, tipos de boleto, taquilla y asistentes de cada evento." actions={create} />
      {events.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-44 w-full rounded-xl" />)}</div>
      ) : events.isError ? (
        <ErrorState title="No se pudieron cargar los eventos" onRetry={() => events.refetch()} />
      ) : !events.data.length ? (
        <EmptyState icon={Ticket} title="Todavía no hay eventos" description={canCreate ? 'Crea un evento, agrega sus funciones y tipos de boleto, y empieza a emitir desde taquilla.' : 'Pide a quien organiza los eventos que te agregue a su equipo.'} action={create} />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {events.data.map((event) => <EventCard key={event.id} event={event} onOpen={() => navigate(ticketingPath(`/events/${event.id}`))} />)}
        </ul>
      )}
    </PageShell>
  )
}

function EventCard({ event, onOpen }) {
  const s = event.stats ?? {}
  const sold = s.issued ?? 0
  const ratio = s.capacity ? Math.min(100, Math.round(((sold + (s.pending ?? 0)) / s.capacity) * 100)) : 0
  return (
    <li>
      <button type="button" onClick={onOpen} className="group flex h-full w-full flex-col gap-4 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 text-left transition-colors hover:border-[hsl(var(--primary)/0.5)] focus-visible:outline-2 focus-visible:outline-[hsl(var(--ring))] motion-reduce:transition-none">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-base font-semibold">{event.title}</p>
            <p className={`${MUTED} truncate`}>{event.venue || 'Sin lugar indicado'}</p>
          </div>
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))] transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <StatusPill tone={event.enabled ? (event.salesOpen ? 'success' : 'neutral') : 'neutral'} size="sm">{!event.enabled ? 'Desactivado' : event.salesOpen ? 'Venta abierta' : 'Solo taquilla'}</StatusPill>
          <StatusPill tone="neutral" size="sm" icon={CalendarDays}>{s.sessions ?? 0} {s.sessions === 1 ? 'función' : 'funciones'}</StatusPill>
        </div>
        <div className="mt-auto space-y-2">
          <div className="flex items-baseline justify-between text-sm">
            <span className="tabular-nums"><span className="font-semibold">{sold}</span> emitidos{s.pending ? ` · ${s.pending} por pagar` : ''}</span>
            <span className={`${MUTED} tabular-nums`}>{s.capacity ? `de ${s.capacity}` : 'sin funciones'}</span>
          </div>
          <ProgressBar value={ratio} className="h-1.5" aria-label="Ocupación" />
          <p className={MUTED}>{s.nextStartsAt ? `Próxima: ${formatDateTime(s.nextStartsAt, event.timezone ?? 'UTC')}` : 'Sin próximas funciones'}</p>
        </div>
      </button>
    </li>
  )
}
