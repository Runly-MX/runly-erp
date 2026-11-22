import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Alert, AlertDescription, AlertTitle, BackButton, Button, ChipTabs, ErrorState, LoadingState, NotFoundState, PageHeader } from '@runly/ui'
import { CalendarDays, LayoutDashboard, ListChecks, Pencil, ScanLine, ShieldCheck, Store, Ticket } from 'lucide-react'
import { useAuth } from '../../../auth/AuthProvider.jsx'
import { BoxOfficeTab } from '../components/BoxOfficeTab.jsx'
import { EventOverview } from '../components/EventOverview.jsx'
import { OrdersTab } from '../components/OrdersTab.jsx'
import { SessionsTab } from '../components/SessionsTab.jsx'
import { TeamTab } from '../components/TeamTab.jsx'
import { TypesTab } from '../components/TypesTab.jsx'
import { PageShell } from '../components/shared.jsx'
import { useEvent } from '../hooks/useTicketing.js'
import { ROLE, ticketingPath } from '../lib/ticketingLabels.js'
import TicketingEventEditor from './TicketingEventEditor.jsx'
import TicketingOrder from './TicketingOrder.jsx'

const TABS = [
  { value: 'overview', label: 'Resumen', icon: LayoutDashboard },
  { value: 'sessions', label: 'Funciones', icon: CalendarDays },
  { value: 'types', label: 'Boletos', icon: Ticket },
  { value: 'box-office', label: 'Taquilla', icon: Store },
  { value: 'orders', label: 'Órdenes y asistentes', icon: ListChecks },
  { value: 'team', label: 'Equipo', icon: ShieldCheck },
]

// /events/new, /events/:id, /events/:id/edit and /events/:id/orders/:orderId.
export default function TicketingEvent() {
  const { '*': wildcard } = useParams()
  const [, eventId = null, sub = null, orderId = null] = String(wildcard ?? '').split('/').filter(Boolean)
  if (eventId === 'new') return <TicketingEventEditor />
  if (sub === 'edit') return <TicketingEventEditor eventId={eventId} />
  if (sub === 'orders' && orderId) return <TicketingOrder eventId={eventId} orderId={orderId} />
  return <EventScreen eventId={eventId} />
}

function EventScreen({ eventId }) {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab = TABS.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'overview'
  const setTab = (value) => setParams((p) => { const n = new URLSearchParams(p); n.set('tab', value); return n }, { replace: true })
  const event = useEvent(eventId)
  const { userProfile } = useAuth()
  const canCheckin = Boolean(userProfile?.isAdmin || userProfile?.permissions?.includes('ticketing.checkin'))

  if (event.isPending) return <PageShell><LoadingState /></PageShell>
  if (event.isError) {
    return (
      <PageShell>
        {event.error?.status === 404 || event.error?.status === 403
          ? <NotFoundState title="Evento no disponible" description="No existe o no formas parte de su equipo." />
          : <ErrorState title="No se pudo abrir el evento" onRetry={() => event.refetch()} />}
      </PageShell>
    )
  }
  const e = event.data
  const isAdmin = e.role === 'admin', canSell = isAdmin || e.role === 'agent'
  const visible = TABS.filter((t) => (t.value === 'box-office' ? canSell : true))
  const current = visible.some((t) => t.value === tab) ? tab : 'overview'

  return (
    <PageShell>
      <BackButton onClick={() => navigate(ticketingPath('/events'))} label="Mis eventos" />
      <PageHeader
        eyebrow={`Boletos · ${ROLE[e.role] ?? ''}`}
        title={e.title}
        description={[e.venue, e.timezone?.replaceAll('_', ' ')].filter(Boolean).join(' · ')}
        actions={(
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            {isAdmin ? <Button type="button" variant="outline" onClick={() => navigate(ticketingPath(`/events/${e.id}/edit`))}><Pencil />Editar evento</Button> : null}
            {canCheckin && e.enabled && e.sessions?.length ? <Button type="button" variant="outline" onClick={() => navigate(ticketingPath('/checkin'))}><ScanLine />Control de acceso</Button> : null}
            {canSell && e.enabled ? <Button type="button" onClick={() => setTab('box-office')}><Store />Taquilla</Button> : null}
          </div>
        )}
      />
      {!e.enabled ? (
        <Alert><AlertTitle>Evento desactivado</AlertTitle><AlertDescription>Conserva sus boletos, pero no emite nuevos. Actívalo en Editar evento.</AlertDescription></Alert>
      ) : null}
      <ChipTabs tabs={visible} value={current} onChange={setTab} tone="amber" ariaLabel="Secciones del evento" />
      {current === 'overview' ? <EventOverview event={e} onGo={setTab} /> : null}
      {current === 'sessions' ? <SessionsTab event={e} canEdit={isAdmin} /> : null}
      {current === 'types' ? <TypesTab event={e} canEdit={isAdmin} /> : null}
      {current === 'box-office' ? <BoxOfficeTab event={e} /> : null}
      {current === 'orders' ? <OrdersTab event={e} /> : null}
      {current === 'team' ? <TeamTab event={e} canEdit={isAdmin} /> : null}
    </PageShell>
  )
}
