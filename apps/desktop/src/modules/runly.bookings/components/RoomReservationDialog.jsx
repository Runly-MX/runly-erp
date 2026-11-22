import { useEffect, useMemo, useState } from 'react'
import {
  Alert, AlertDescription, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, NumberField, SelectField, TextField, UserSearchModal,
} from '@runly/ui'
import { DoorOpen, Loader2, UserPlus, X } from 'lucide-react'
import { useAuth } from '../../../auth/AuthProvider.jsx'
import { useActiveCompany } from '../../../company/ActiveCompanyProvider'
import { getApiUrl } from '../../../lib/runtimeConfig.js'
import { runly } from '../../../lib/runly.js'
import { useBookingsMutation, useIdempotencyKey } from '../hooks/useBookings.js'
import { bookingsError } from '../lib/bookingsLabels.js'
import { dayKey, formatTime } from '../lib/bookingsTime.js'
import { TIME_OPTIONS, WallTimeFields, wallValueToIso } from './WallTimeFields.jsx'

const pad = (n) => String(n).padStart(2, '0')
const toMinutes = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m }
const toTime = (minutes) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`
const span = (minutes) => (minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ''}`)
const wall = (date, timeZone) => ({ date: dayKey(date, timeZone), time: formatTime(date, timeZone) })

// Reserve (or move) a room: room, motive, start, end, participants. Rooms of every
// resources space the person may use are offered together; the engine decides.
// initial: { spaceId, resourceId, startsAt, endsAt } | reservation: an existing one to move.
export function RoomReservationDialog({ open, onOpenChange, rooms, initial = null, reservation = null, onDone }) {
  const { session } = useAuth()
  const { activeCompanyId } = useActiveCompany()
  const moving = Boolean(reservation)
  const options = useMemo(() => (rooms ?? []).flatMap((space) => space.resources.map((r) => ({
    value: `${space.id}:${r.id}`,
    label: `${r.name}${r.capacity ? ` · ${r.capacity} personas` : ''}${(rooms?.length ?? 0) > 1 ? ` · ${space.name}` : ''}`,
  }))), [rooms])
  const blank = () => {
    const source = reservation ?? initial ?? {}
    const space = rooms?.find((s) => s.id === source.spaceId) ?? rooms?.[0]
    const tz = space?.timezone ?? 'UTC'
    const start = source.startsAt ? new Date(source.startsAt) : nextQuarter()
    const end = source.endsAt ? new Date(source.endsAt) : new Date(start.getTime() + 3600000)
    return {
      room: source.resourceId && space ? `${space.id}:${source.resourceId}` : options[0]?.value ?? '',
      title: reservation?.title ?? '', start: wall(start, tz), end: formatTime(end, tz), headcount: '',
      participants: reservation?.participants ?? [],
    }
  }
  const [form, setForm] = useState(blank)
  const [errors, setErrors] = useState({})
  const [failure, setFailure] = useState(null)
  const [picking, setPicking] = useState(false)
  const keyFor = useIdempotencyKey(open)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the dialog opens
  useEffect(() => { if (open) { setForm(blank()); setErrors({}); setFailure(null) } }, [open])

  const [spaceId, resourceId] = form.room.split(':')
  const space = rooms?.find((s) => s.id === spaceId)
  const tz = space?.timezone ?? 'UTC'
  const max = space?.maxMinutes ?? 480
  const startMin = form.start.time ? toMinutes(form.start.time) : 0
  const endOptions = TIME_OPTIONS.filter((o) => { const m = toMinutes(o.value) || 1440; return m > startMin && m - startMin <= max })
    .map((o) => ({ value: o.value, label: `${o.value} (${span((toMinutes(o.value) || 1440) - startMin)})` }))

  const save = useBookingsMutation((t, { body, key }) => (moving
    ? runly.bookings.rescheduleRoomReservation(reservation.id, body, t, key)
    : runly.bookings.reserveRoom(spaceId, body, t, key)), { success: moving ? 'Reservación movida.' : 'Sala reservada.' })

  async function submit(event) {
    event.preventDefault()
    const next = {}
    if (!form.room) next.room = 'Elige una sala.'
    if (!moving && !form.title.trim()) next.title = 'Escribe el motivo.'
    const startsAt = wallValueToIso(form.start, tz)
    if (!startsAt) next.start = 'Elige fecha y hora de inicio.'
    else if (new Date(startsAt).getTime() < Date.now()) next.start = 'El inicio ya pasó.'
    if (!form.end || !endOptions.some((o) => o.value === form.end)) next.end = 'Elige a qué hora termina.'
    const headcount = form.headcount ? Number.parseInt(form.headcount, 10) : null
    if (headcount != null && !(headcount >= 1 && headcount <= 1000)) next.headcount = 'Entre 1 y 1000 personas.'
    setErrors(next)
    if (Object.keys(next).length) return
    const endsAt = wallValueToIso({ date: form.start.date, time: form.end }, tz)
    const end = form.end === '00:00' ? new Date(new Date(endsAt).getTime() + 86400000).toISOString() : endsAt
    const body = moving
      ? { startsAt, endsAt: end, resourceId }
      : { resourceId, title: form.title.trim(), startsAt, endsAt: end, participantIds: form.participants.map((p) => p.id), ...(headcount ? { headcount } : {}) }
    setFailure(null)
    try {
      const saved = await save.mutateAsync({ body, key: keyFor({ moving, spaceId, ...body }) })
      onOpenChange(false)
      onDone?.(saved)
    } catch (error) {
      setFailure(error?.code === 'SLOT_TAKEN' ? 'Esa sala ya está ocupada en ese horario. Elige otra hora u otra sala.' : bookingsError(error))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent scrollable size="md" className="gap-0 p-0 md:p-0 md:pt-0!">
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" noValidate>
          <DialogHeader icon={DoorOpen} className="mb-0 shrink-0 px-5 pt-4 pb-3">
            <DialogTitle>{moving ? 'Mover reservación' : 'Reservar sala'}</DialogTitle>
            <DialogDescription>{moving ? reservation.title : 'Nadie más podrá reservarla en ese horario.'}</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            {failure ? <Alert variant="destructive"><AlertDescription>{failure}</AlertDescription></Alert> : null}
            {!options.length ? <Alert><AlertDescription>No hay salas disponibles para ti. Pide a quien administra Reservaciones que te habilite.</AlertDescription></Alert> : null}
            <SelectField label="Sala o recurso" options={options} value={form.room} onValueChange={(room) => setForm((f) => ({ ...f, room }))} error={errors.room} />
            {!moving ? <TextField label="Motivo" required value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} maxLength={200} error={errors.title} placeholder="Ej. Revisión de presupuesto" autoComplete="off" /> : null}
            <WallTimeFields label="Inicio" timeZone={tz} value={form.start} onChange={(start) => setForm((f) => ({ ...f, start }))} error={errors.start} />
            <SelectField label="Termina" icon={null} options={endOptions} value={form.end} onValueChange={(end) => setForm((f) => ({ ...f, end }))} error={errors.end} />
            {!moving ? (
              <>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">Participantes <span className="font-normal text-[hsl(var(--muted-foreground))]">(opcional)</span></p>
                    <Button type="button" variant="outline" size="sm" onClick={() => setPicking(true)}><UserPlus />Agregar</Button>
                  </div>
                  {form.participants.length ? (
                    <ul className="flex flex-wrap gap-1.5" aria-label="Participantes">
                      {form.participants.map((p) => (
                        <li key={p.id} className="flex items-center gap-1 rounded-md bg-[hsl(var(--muted))] py-1 pr-1 pl-2.5 text-sm">
                          {p.name}
                          <button type="button" aria-label={`Quitar a ${p.name}`} onClick={() => setForm((f) => ({ ...f, participants: f.participants.filter((x) => x.id !== p.id) }))} className="rounded p-0.5 hover:bg-black/10"><X className="size-3.5" /></button>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="text-xs text-[hsl(var(--muted-foreground))]">La reservación aparecerá en su calendario.</p>}
                </div>
                <NumberField label="Personas" suffix="personas" icon={null} min={1} max={1000} allowDecimal={false} value={form.headcount} onChange={(e) => setForm((f) => ({ ...f, headcount: e.target.value }))} error={errors.headcount} hint="Opcional. Cuenta a quien organiza y a los invitados sin cuenta." className="pr-24" />
              </>
            ) : null}
          </div>
          <DialogFooter className="mt-0 shrink-0 border-t border-[hsl(var(--border))] px-5 py-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={save.isPending || !options.length}>
              {save.isPending ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}
              {save.isPending ? 'Guardando…' : moving ? 'Mover' : 'Reservar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
      {picking ? (
        <UserSearchModal open onClose={() => setPicking(false)} apiBase={getApiUrl()} token={session?.access_token} companyId={activeCompanyId}
          excludeIds={form.participants.map((p) => p.id)} title="Agregar participante" description="Personas de esta empresa." confirmLabel="Agregar"
          onConfirm={(id, _role, user) => setForm((f) => ({ ...f, participants: f.participants.some((p) => p.id === id) ? f.participants : [...f.participants, { id, name: user?.display_name ?? 'Participante' }] }))} />
      ) : null}
    </Dialog>
  )
}

function nextQuarter() {
  const d = new Date(Date.now() + 15 * 60000)
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0)
  return d
}
