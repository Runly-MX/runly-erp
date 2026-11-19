import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  BackButton, Button, CheckboxField, ChipTabs, EmptyState, ErrorState, LoadingState, NotFoundState, PageHeader, SectionCard, Skeleton, StatCard,
} from '@runly/ui'
import { CalendarClock, CalendarDays, CalendarPlus, ConciergeBell, LayoutDashboard, ListChecks, Loader2, Settings2, ShieldCheck, Users } from 'lucide-react'
import { runly } from '../../../lib/runly.js'
import { BookingFormDialog } from '../components/BookingDialogs.jsx'
import { ExceptionsPanel } from '../components/ExceptionsPanel.jsx'
import { MembersPanel } from '../components/MembersPanel.jsx'
import { ScheduleEditor } from '../components/ScheduleEditor.jsx'
import { SessionsPanel } from '../components/SessionsPanel.jsx'
import { SpaceServicesTab } from '../components/SpaceServicesTab.jsx'
import { SpaceSettingsTab } from '../components/SpaceSettingsTab.jsx'
import { MUTED, PageShell, StatusBadge } from '../components/shared.jsx'
import {
  useBookingRole, useBookingsMe, useBookingsMutation, useResources, useSchedule, useServices, useSpace, useSpaceResourceIds, useSummary,
} from '../hooks/useBookings.js'
import { MODE, RESOURCE_TYPE, ROLE, bookingsPath } from '../lib/bookingsLabels.js'
import { formatDateTime } from '../lib/bookingsTime.js'

const TABS = [
  { value: 'overview', label: 'Resumen', icon: LayoutDashboard },
  { value: 'services', label: 'Servicios', icon: ConciergeBell },
  { value: 'resources', label: 'Recursos', icon: Users },
  { value: 'availability', label: 'Disponibilidad', icon: CalendarClock },
  { value: 'team', label: 'Equipo', icon: ShieldCheck },
  { value: 'settings', label: 'Configuración', icon: Settings2 },
]

export default function BookingsSpace() {
  // Module screens are mounted under a wildcard route: "/spaces/:spaceId" -> segment 1.
  const { '*': wildcard } = useParams()
  const spaceId = String(wildcard ?? '').split('/').filter(Boolean)[1] ?? null
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab = TABS.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'overview'
  const setTab = (value) => setParams((p) => { const n = new URLSearchParams(p); n.set('tab', value); return n }, { replace: true })
  const space = useSpace(spaceId)
  const me = useBookingsMe()
  const { canOperate, canConfigure, role } = useBookingRole(space.data)
  const services = useServices(spaceId)
  const resources = useResources()
  const linked = useSpaceResourceIds(spaceId)
  const [booking, setBooking] = useState(false)

  // isPending, not isLoading: before the session token exists the query is idle with no data.
  if (space.isPending) return <PageShell><LoadingState /></PageShell>
  if (space.isError) {
    return (
      <PageShell>
        {space.error?.status === 404 || space.error?.status === 403
          ? <NotFoundState title="Sistema no disponible" description="No existe o no tienes acceso a este sistema de reservaciones." />
          : <ErrorState title="No se pudo abrir el sistema" onRetry={() => space.refetch()} />}
      </PageShell>
    )
  }
  const s = space.data
  const spaceResources = (resources.data ?? []).filter((r) => (linked.data ?? []).includes(r.id))

  return (
    <PageShell>
      <BackButton onClick={() => navigate(bookingsPath('/spaces'))} label="Mis sistemas" />
      <PageHeader
        eyebrow={`Reservaciones · ${ROLE[role] ?? ''}`}
        title={s.name}
        description={`${MODE[s.mode]} · ${s.timezone}${s.enabled ? '' : ' · Desactivado'}`}
        actions={(
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <Button type="button" variant="outline" onClick={() => navigate(bookingsPath(`/agenda?space=${s.id}`))}><CalendarDays />Agenda</Button>
            {canOperate && s.enabled ? <Button type="button" onClick={() => setBooking(true)}><CalendarPlus />Nueva reservación</Button> : null}
          </div>
        )}
      />
      <ChipTabs tabs={TABS} value={tab} onChange={setTab} tone="teal" ariaLabel="Secciones del sistema" />
      {tab === 'overview' ? <Overview space={s} onOpenList={() => navigate(bookingsPath(`/reservations?space=${s.id}`))} /> : null}
      {tab === 'services' ? <SpaceServicesTab space={s} services={services.data ?? []} resources={spaceResources} canEdit={canConfigure} /> : null}
      {tab === 'resources' ? <ResourcesTab space={s} resources={resources} linkedIds={linked.data ?? []} canEdit={canConfigure} canManageCatalog={Boolean(me.data?.canManageCatalog)} /> : null}
      {tab === 'availability' ? <AvailabilityTab space={s} services={services.data ?? []} resources={spaceResources} canEdit={canConfigure} canEditResources={Boolean(me.data?.canManageCatalog)} /> : null}
      {tab === 'team' ? <MembersPanel space={s} canEdit={canConfigure} /> : null}
      {tab === 'settings' ? <SpaceSettingsTab space={s} canEdit={canConfigure} /> : null}
      {canOperate ? <BookingFormDialog open={booking} onOpenChange={setBooking} space={s} services={services.data ?? []} resources={spaceResources} /> : null}
    </PageShell>
  )
}

function Overview({ space, onOpenList }) {
  const summary = useSummary(space.id)
  const d = summary.data
  if (summary.isPending) return <Skeleton className="h-48 w-full" />
  if (summary.isError) return <ErrorState title="No se pudo cargar el resumen" onRetry={() => summary.refetch()} />
  const by = d.upcomingByStatus ?? {}
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Confirmadas próximas" value={by.CONFIRMED ?? 0} />
        <StatCard label="Pendientes" value={by.PENDING ?? 0} />
        <StatCard label="Servicios activos" value={d.services} />
        <StatCard label="Recursos" value={d.resources} />
      </div>
      <SectionCard title="Próximos horarios" icon={ListChecks} action={<Button type="button" variant="ghost" size="sm" onClick={onOpenList}>Ver reservaciones</Button>}>
        {d.next.length ? (
          <ul className="divide-y divide-[hsl(var(--border))]">
            {d.next.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{b.guestName || 'Sin nombre'}</p>
                  <p className={MUTED}>{formatDateTime(b.startsAt, space.timezone)}</p>
                </div>
                <StatusBadge status={b.status} size="sm" />
              </li>
            ))}
          </ul>
        ) : <EmptyState icon={CalendarClock} title="Sin reservaciones próximas" />}
      </SectionCard>
    </div>
  )
}

function ResourcesTab({ space, resources, linkedIds, canEdit, canManageCatalog }) {
  const navigate = useNavigate()
  const [selected, setSelected] = useState(linkedIds)
  useEffect(() => { setSelected(linkedIds) }, [linkedIds])
  const save = useBookingsMutation((t, ids) => runly.bookings.setSpaceResources(space.id, ids, t), { success: 'Recursos del sistema guardados.' })
  const list = resources.data ?? []
  const dirty = [...selected].sort().join() !== [...linkedIds].sort().join()
  const visible = canEdit ? list.filter((r) => r.enabled || linkedIds.includes(r.id)) : list.filter((r) => linkedIds.includes(r.id))

  return (
    <SectionCard
      title="Recursos de este sistema"
      icon={Users}
      description="Personas, salas, equipos o mesas que este sistema puede ocupar. Un recurso compartido entre sistemas nunca se reserva dos veces al mismo tiempo."
      action={canManageCatalog ? <Button type="button" variant="outline" size="sm" onClick={() => navigate(bookingsPath('/resources'))}>Administrar recursos</Button> : null}
    >
      {resources.isLoading ? <Skeleton className="h-24 w-full" /> : resources.isError ? <ErrorState title="No se pudieron cargar los recursos" onRetry={() => resources.refetch()} />
        : !visible.length ? <EmptyState icon={Users} title="Sin recursos" description={canManageCatalog ? 'Crea recursos en Administrar recursos y después actívalos aquí.' : 'Pide a quien administra los recursos que los dé de alta.'} />
          : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {visible.map((r) => (
                  <CheckboxField key={r.id} label={r.name} hint={`${RESOURCE_TYPE[r.type]}${r.enabled ? '' : ' · inactivo'}`} checked={selected.includes(r.id)} disabled={!canEdit}
                    onChange={(e) => setSelected((ids) => (e.target.checked ? [...ids, r.id] : ids.filter((x) => x !== r.id)))} />
                ))}
              </div>
              {canEdit ? (
                <div className="flex justify-end">
                  <Button type="button" disabled={!dirty || save.isPending} onClick={() => save.mutate(selected)}>{save.isPending ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}Guardar recursos</Button>
                </div>
              ) : null}
            </div>
          )}
    </SectionCard>
  )
}

function AvailabilityTab({ space, services, resources, canEdit, canEditResources }) {
  const schedule = useSchedule(space.id)
  const save = useBookingsMutation((t, rules) => runly.bookings.setSchedule(space.id, rules, t), { success: 'Horario guardado.' })
  return (
    <div className="space-y-4">
      <ScheduleEditor
        title="Horario semanal del sistema"
        description={`Horas en que se puede reservar, en ${space.timezone}. Los descansos son huecos entre horarios del mismo día. Los buffers de cada servicio se definen en Servicios.`}
        rules={schedule.data}
        loading={schedule.isLoading}
        canEdit={canEdit}
        saving={save.isPending}
        onSave={(rules) => save.mutateAsync(rules).catch(() => {})}
      />
      <ExceptionsPanel space={space} resources={resources} canEdit={canEdit} canEditResources={canEditResources} />
      <SessionsPanel space={space} services={services} resources={resources} canEdit={canEdit} />
    </div>
  )
}
