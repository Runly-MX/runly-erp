import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button, ConfirmDialog, EmptyState, ErrorState, PageHeader, Skeleton, cn } from '@runly/ui'
import { CalendarClock, ChevronLeft, ChevronRight, DoorOpen, Pencil, Plus, Users, X } from 'lucide-react'
import { RoomReservationDialog } from '../components/RoomReservationDialog.jsx'
import { MUTED, PageShell, SpaceSwitcher } from '../components/shared.jsx'
import { useBookingsMe, useBookingsMutation, useMyRoomReservations, useRoomAgenda, useRooms } from '../hooks/useBookings.js'
import { bookingsPath } from '../lib/bookingsLabels.js'
import { addDays, dayKey, formatDay, formatTime, keyParts, minuteOfDay, wallToInstant } from '../lib/bookingsTime.js'
import { runly } from '../../../lib/runly.js'

const ROW = 30 // minutes per cell
const CELL = 28 // px per cell
const at = (day, minute, tz) => wallToInstant({ ...keyParts(day), hour: Math.floor(minute / 60), minute: minute % 60 }, tz)

// "Reservar sala": a day of every room, free half hours as buttons; tap one to reserve.
// Phones show one room at a time. The engine decides; the agenda refreshes every 30 s.
export default function BookingsRooms() {
  const navigate = useNavigate()
  const rooms = useRooms()
  const mine = useMyRoomReservations()
  const me = useBookingsMe()
  const [params, setParams] = useSearchParams()
  const spaces = rooms.data ?? []
  const space = spaces.find((s) => s.id === params.get('space')) ?? spaces[0] ?? null
  const tz = space?.timezone ?? 'UTC'
  const today = dayKey(new Date(), tz)
  const day = /^\d{4}-\d{2}-\d{2}$/.test(params.get('date') ?? '') ? params.get('date') : today
  const from = space ? at(day, 0, tz).toISOString() : null
  const to = space ? at(addDays(day, 1), 0, tz).toISOString() : null
  const agenda = useRoomAgenda(space?.id, from, to)
  const [focus, setFocus] = useState(null)
  const [dialog, setDialog] = useState(null)
  const [cancelling, setCancelling] = useState(null)
  const set = (key, value) => setParams((p) => { const n = new URLSearchParams(p); n.set(key, value); return n }, { replace: true })
  const cancel = useBookingsMutation((t, id) => runly.bookings.cancelRoomReservation(id, {}, t, crypto.randomUUID()), { success: 'Reservación cancelada.' })

  const newButton = spaces.length ? <Button type="button" onClick={() => setDialog({ initial: { spaceId: space?.id } })} className="w-full sm:w-auto"><Plus />Nueva reservación</Button> : null

  if (rooms.isPending) return <PageShell><Skeleton className="h-96 w-full rounded-xl" /></PageShell>
  if (rooms.isError) return <PageShell><ErrorState title="No se pudieron cargar las salas" onRetry={() => rooms.refetch()} /></PageShell>

  return (
    <PageShell>
      <PageHeader eyebrow="Reservaciones" title="Reservar sala" description="Elige un horario libre de una sala o equipo. Nadie más podrá tomarlo." actions={newButton} />
      {!spaces.length ? (
        <EmptyState icon={DoorOpen} title="No hay salas para reservar"
          description={me.data?.canManageCatalog ? 'Crea un sistema de «Salas y recursos» y agrega tus salas o equipos.' : 'Pide a quien administra Reservaciones que habilite las salas de tu empresa.'}
          action={me.data?.canManageCatalog ? <Button type="button" variant="outline" onClick={() => navigate(bookingsPath('/spaces?new=resources'))}>Crear sistema de salas</Button> : null} />
      ) : (
        <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <section aria-label="Disponibilidad" className="min-w-0 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
            <div className="flex flex-wrap items-end gap-3 border-b border-[hsl(var(--border))] p-3 sm:p-4">
              {spaces.length > 1 ? <SpaceSwitcher spaces={spaces} value={space?.id} onChange={(v) => set('space', v)} className="sm:w-60" /> : null}
              <div className="flex items-center gap-1">
                <Button type="button" variant="outline" size="icon" aria-label="Día anterior" onClick={() => set('date', addDays(day, -1))}><ChevronLeft /></Button>
                <Button type="button" variant="outline" size="icon" aria-label="Día siguiente" onClick={() => set('date', addDays(day, 1))}><ChevronRight /></Button>
                {day !== today ? <Button type="button" variant="ghost" size="sm" onClick={() => set('date', today)}>Hoy</Button> : null}
              </div>
              <p className="min-w-0 flex-1 truncate pb-2 text-sm font-semibold capitalize">{formatDay(at(day, 720, tz), tz)}</p>
            </div>
            {agenda.isPending ? <Skeleton className="m-4 h-80" /> : agenda.isError ? <ErrorState title="No se pudo cargar la disponibilidad" onRetry={() => agenda.refetch()} /> : (
              <DayGrid agenda={agenda.data} day={day} tz={tz} focus={focus ?? agenda.data.resources[0]?.id} onFocus={setFocus}
                onPick={(resource, start) => setDialog({ initial: { spaceId: space.id, resourceId: resource.id, startsAt: start, endsAt: new Date(start.getTime() + 3600000) } })} />
            )}
          </section>

          <aside aria-label="Mis reservaciones" className="min-w-0 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
            <h2 className="text-base font-semibold">Mis reservaciones</h2>
            <p className={MUTED}>Las que organizas y a las que te invitaron.</p>
            {mine.isPending ? <Skeleton className="mt-3 h-24" /> : !(mine.data ?? []).length ? (
              <p className="py-8 text-center text-sm text-[hsl(var(--muted-foreground))]">No tienes reservaciones próximas.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {mine.data.map((r) => (
                  <li key={r.id} className="rounded-lg border border-[hsl(var(--border))] p-3">
                    <p className="truncate font-medium">{r.title}</p>
                    <p className={MUTED}>{r.resourceName} · <span className="capitalize">{formatDay(r.startsAt, r.timezone, { weekday: 'short', day: 'numeric', month: 'short' })}</span>, {formatTime(r.startsAt, r.timezone)}–{formatTime(r.endsAt, r.timezone)}</p>
                    <p className={cn(MUTED, 'mt-1 flex items-center gap-1')}><Users className="size-3.5" aria-hidden="true" />{r.isOrganizer ? 'Organizas' : `Organiza ${r.organizerName ?? '—'}`}{r.participants.length ? ` · ${r.participants.length} ${r.participants.length === 1 ? 'participante' : 'participantes'}` : ''}</p>
                    {r.isOrganizer ? (
                      <div className="mt-2 flex gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => setDialog({ reservation: r })}><Pencil />Mover</Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setCancelling(r)}><X />Cancelar</Button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      )}
      <RoomReservationDialog open={Boolean(dialog)} onOpenChange={(v) => !v && setDialog(null)} rooms={spaces} initial={dialog?.initial ?? null} reservation={dialog?.reservation ?? null} />
      <ConfirmDialog open={Boolean(cancelling)} onOpenChange={(v) => !v && setCancelling(null)} title="Cancelar reservación"
        description={cancelling ? `${cancelling.title} · ${cancelling.resourceName}. La sala queda libre y se quita de los calendarios.` : ''}
        confirmLabel="Cancelar reservación" cancelLabel="Conservar" loading={cancel.isPending}
        onConfirm={async () => { await cancel.mutateAsync(cancelling.id).catch(() => {}); setCancelling(null) }} />
    </PageShell>
  )
}

// One column per resource (all on wide screens, the focused one on phones).
function DayGrid({ agenda, day, tz, focus, onFocus, onPick }) {
  const resources = agenda.resources
  const { first, last } = useMemo(() => {
    const opens = resources.flatMap((r) => r.hours).map((h) => ({ s: Math.max(0, minuteOfDay(h.start, tz)), e: dayKey(h.end, tz) !== day ? 1440 : minuteOfDay(h.end, tz) }))
    if (!opens.length) return { first: 8 * 60, last: 20 * 60 }
    return { first: Math.floor(Math.min(...opens.map((o) => o.s)) / 60) * 60, last: Math.ceil(Math.max(...opens.map((o) => o.e)) / 60) * 60 }
  }, [resources, tz, day])
  if (!resources.length) return <EmptyState icon={CalendarClock} title="Este sistema no tiene salas" description="Agrégalas en la pestaña Recursos del sistema." />
  const rows = Math.max(1, (last - first) / ROW)
  const now = Date.now()
  return (
    <div className="p-3 sm:p-4">
      <div role="tablist" aria-label="Sala" className="mb-3 flex gap-1.5 overflow-x-auto pb-1 lg:hidden">
        {resources.map((r) => (
          <button key={r.id} type="button" role="tab" aria-selected={r.id === focus} onClick={() => onFocus(r.id)}
            className={cn('shrink-0 rounded-md border px-3 py-1.5 text-sm', r.id === focus ? 'border-transparent bg-teal-600 text-white' : 'border-[hsl(var(--border))]')}>{r.name}</button>
        ))}
      </div>
      <div className="flex min-w-0 overflow-x-auto">
        <div className="w-12 shrink-0 pt-9" aria-hidden="true">
          <div className="relative" style={{ height: rows * CELL }}>
            {Array.from({ length: rows }, (_, i) => ((first + i * ROW) % 60 === 0 ? (
              <span key={i} style={{ top: i * CELL - 7 }} className="absolute left-0 text-[11px] tabular-nums text-[hsl(var(--muted-foreground))]">{`${String((first + i * ROW) / 60).padStart(2, '0')}:00`}</span>
            ) : null))}
          </div>
        </div>
        {resources.map((r) => {
          const open = (m) => r.hours.some((h) => at(day, m, tz) >= new Date(h.start) && at(day, m + ROW, tz) <= new Date(h.end))
          const taken = (m) => r.busy.some((b) => at(day, m, tz) < new Date(b.end) && at(day, m + ROW, tz) > new Date(b.start))
          return (
            <div key={r.id} className={cn('min-w-40 flex-1 border-l border-[hsl(var(--border))]', r.id !== focus && 'hidden lg:block')}>
              <div className="h-9 truncate px-2 text-sm font-semibold">{r.name}<span className="ml-1 font-normal text-[hsl(var(--muted-foreground))]">{r.capacity ? `· ${r.capacity}` : ''}</span></div>
              <div className="relative" style={{ height: rows * CELL }}>
                {Array.from({ length: rows }, (_, i) => {
                  const m = first + i * ROW, start = at(day, m, tz)
                  const free = open(m) && !taken(m) && start.getTime() > now - ROW * 60000
                  return free ? (
                    <button key={i} type="button" onClick={() => onPick(r, start.getTime() < now ? roundUp(now) : start)} aria-label={`Reservar ${r.name} a las ${formatTime(start, tz)}`}
                      style={{ top: i * CELL, height: CELL }}
                      className="group absolute inset-x-1 rounded-sm border-t border-dashed border-[hsl(var(--border))] text-left text-[11px] text-transparent hover:bg-teal-500/10 hover:text-teal-700 focus-visible:bg-teal-500/10 focus-visible:text-teal-700 focus-visible:outline-2 focus-visible:outline-teal-600 dark:hover:text-teal-300">
                      <span className="px-1.5">+ {formatTime(start, tz)}</span>
                    </button>
                  ) : <div key={i} style={{ top: i * CELL, height: CELL }} className={cn('absolute inset-x-0 border-t border-[hsl(var(--border))]/60', !open(m) && 'bg-[hsl(var(--muted))]/60')} />
                })}
                {r.busy.map((b) => {
                  const s = Math.max(first, dayKey(b.start, tz) !== day ? 0 : minuteOfDay(b.start, tz))
                  const e = Math.min(last, dayKey(b.end, tz) !== day ? 1440 : minuteOfDay(b.end, tz))
                  if (e <= s) return null
                  return (
                    <div key={`${b.start}-${b.bookingId ?? b.organizerName}`} style={{ top: ((s - first) / ROW) * CELL + 1, height: ((e - s) / ROW) * CELL - 2 }}
                      className={cn('absolute inset-x-1 overflow-hidden rounded-md px-2 py-1 text-xs', b.mine ? 'bg-teal-600 text-white' : 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100')}>
                      <p className="truncate font-semibold">{b.label}</p>
                      <p className="truncate opacity-80">{formatTime(b.start, tz)}–{formatTime(b.end, tz)}{b.organizerName ? ` · ${b.organizerName}` : ''}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function roundUp(ms) {
  const d = new Date(ms + 60000)
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0)
  return d
}
