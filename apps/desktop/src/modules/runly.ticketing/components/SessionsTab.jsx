import { useState } from 'react'
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, EmptyState, NumberField, SectionCard } from '@runly/ui'
import { CalendarDays, CalendarPlus, Loader2 } from 'lucide-react'
import { runly } from '../../../lib/runly.js'
import { WallTimeFields, wallValueToIso } from '../../runly.bookings/components/WallTimeFields.jsx'
import { dayKey } from '../../runly.bookings/lib/bookingsTime.js'
import { useTicketingMutation } from '../hooks/useTicketing.js'
import { SessionRow } from './EventOverview.jsx'

// Functions of the event. Each one is a session of the event's booking space: the room
// capacity is the hard limit for every ticket type together.
export function SessionsTab({ event, canEdit }) {
  const [open, setOpen] = useState(false)
  const sessions = event.sessions ?? []
  const add = canEdit ? <Button type="button" onClick={() => setOpen(true)}><CalendarPlus />Nueva función</Button> : null
  return (
    <SectionCard title="Funciones" icon={CalendarDays} description="Fecha, hora y lugares de cada presentación. El cupo de la sala limita a todos los tipos de boleto juntos." action={sessions.length ? add : null}>
      {!sessions.length ? (
        <EmptyState icon={CalendarDays} title="Sin funciones" description={canEdit ? 'Agrega la primera función para poder emitir boletos.' : 'Quien administra el evento aún no agrega funciones.'} action={add} />
      ) : (
        <ul className="divide-y divide-[hsl(var(--border))]">{sessions.map((s) => <SessionRow key={s.id} session={s} timezone={event.timezone} />)}</ul>
      )}
      {open ? <SessionDialog event={event} onClose={() => setOpen(false)} /> : null}
    </SectionCard>
  )
}

function SessionDialog({ event, onClose }) {
  const tz = event.timezone ?? 'UTC'
  const [start, setStart] = useState({ date: dayKey(new Date(Date.now() + 7 * 86400000), tz), time: '20:00' })
  const [capacity, setCapacity] = useState('100')
  const [before, setBefore] = useState('120')
  const [after, setAfter] = useState('60')
  const [errors, setErrors] = useState({})
  const create = useTicketingMutation((t, data) => runly.ticketing.createSession(event.id, data, t), { success: 'Función agregada.' })

  async function submit(e) {
    e.preventDefault()
    const startsAt = wallValueToIso(start, tz), cap = Number.parseInt(capacity, 10), next = {}
    if (!startsAt) next.start = 'Elige fecha y hora.'
    else if (new Date(startsAt).getTime() < Date.now()) next.start = 'La función debe ser en el futuro.'
    if (!(cap >= 1 && cap <= 100000)) next.capacity = 'Entre 1 y 100000 lugares.'
    const admitBeforeMinutes = Number.parseInt(before, 10), admitAfterMinutes = Number.parseInt(after, 10)
    if (!(admitBeforeMinutes >= 0 && admitBeforeMinutes <= 1440)) next.before = 'Entre 0 y 1440 minutos.'
    if (!(admitAfterMinutes >= 0 && admitAfterMinutes <= 1440)) next.after = 'Entre 0 y 1440 minutos.'
    setErrors(next)
    if (Object.keys(next).length) return
    if (await create.mutateAsync({ startsAt, capacity: cap, admitBeforeMinutes, admitAfterMinutes }).then(() => true).catch(() => false)) onClose()
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent scrollable size="md" className="gap-0 p-0 md:p-0 md:pt-0!">
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" noValidate>
          <DialogHeader icon={CalendarPlus} className="mb-0 shrink-0 px-5 pt-4 pb-3">
            <DialogTitle>Nueva función</DialogTitle>
            <DialogDescription>La duración la define el evento. Los tipos de boleto se pueden limitar por función en Boletos.</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
            <WallTimeFields label="Inicio" timeZone={tz} value={start} onChange={setStart} error={errors.start} />
            <NumberField label="Lugares de la sala" suffix="lugares" icon={null} min={1} max={100000} allowDecimal={false} value={capacity} onChange={(e) => setCapacity(e.target.value)} error={errors.capacity} className="pr-20" />
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberField label="Admisión desde" suffix="min antes" icon={null} min={0} max={1440} allowDecimal={false} value={before} onChange={(e) => setBefore(e.target.value)} error={errors.before} className="pr-24" />
              <NumberField label="Admisión hasta" suffix="min después" icon={null} min={0} max={1440} allowDecimal={false} value={after} onChange={(e) => setAfter(e.target.value)} error={errors.after} className="pr-28" />
            </div>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">Control de acceso admite boletos solo dentro de este horario, contado desde el inicio de la función.</p>
          </div>
          <DialogFooter className="mt-0 shrink-0 border-t border-[hsl(var(--border))] px-5 py-3">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={create.isPending}>{create.isPending ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}{create.isPending ? 'Agregando…' : 'Agregar función'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
