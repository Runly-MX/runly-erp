import { useCallback, useEffect, useState } from 'react'
import {
  Button, ContactPicker, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, NumberField, SelectField, TextField, TextareaField,
} from '@runly/ui'
import { CalendarPlus, CalendarSync, Loader2 } from 'lucide-react'
import { runly } from '../../../lib/runly.js'
import { useBookingsMutation, useIdempotencyKey, useToken } from '../hooks/useBookings.js'
import { MUTED_TEXT } from '../lib/bookingsLabels.js'
import { dayKey, formatDateTime } from '../lib/bookingsTime.js'
import { FormGroup } from './shared.jsx'
import { SlotPicker } from './SlotPicker.jsx'

const ANY = 'any'

// Manual reservation: service, free time from the engine, customer. The server
// re-checks availability in its transaction; a lost slot comes back as a 409.
export function BookingFormDialog({ open, onOpenChange, space, services, resources, initialDate }) {
  const token = useToken()
  const tz = space.timezone
  const keyFor = useIdempotencyKey(open)
  const active = services.filter((s) => s.enabled)
  const [form, setForm] = useState({})
  const [errors, setErrors] = useState({})
  useEffect(() => {
    if (open) {
      setForm({ serviceId: active[0]?.id ?? '', resourceId: ANY, date: initialDate ?? dayKey(new Date(), tz), slot: null, contact: null, guestName: '', guestEmail: '', guestPhone: '', partySize: String(active[0]?.minParty ?? 1), notes: '' })
      setErrors({})
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const service = active.find((s) => s.id === form.serviceId)
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const create = useBookingsMutation((t, { data, key }) => runly.bookings.createReservation(space.id, data, t, key), { success: 'Reservación registrada.' })
  const searchContacts = useCallback(async (q) => (await runly.contacts.picker(token, { q, limit: 10 }))?.data ?? [], [token])

  async function submit(event) {
    event.preventDefault()
    const next = {}
    if (!service) next.service = 'Elige un servicio.'
    if (!form.slot) next.slot = 'Elige un horario disponible.'
    if (!form.contact && !form.guestName.trim()) next.guest = 'Elige un contacto o escribe el nombre del cliente.'
    const party = Number.parseInt(form.partySize, 10)
    if (service && !(party >= service.minParty && party <= service.maxParty)) next.party = `Entre ${service.minParty} y ${service.maxParty} personas.`
    if (form.guestEmail && !/^\S+@\S+\.\S+$/.test(form.guestEmail)) next.email = 'Revisa el correo.'
    setErrors(next)
    if (Object.keys(next).length) return
    const data = {
      serviceId: service.id, partySize: party,
      ...(form.slot.sessionId ? { sessionId: form.slot.sessionId } : { startsAt: form.slot.startsAt, ...(form.resourceId !== ANY ? { resourceId: form.resourceId } : {}) }),
      contactId: form.contact?.id ?? null, guestName: form.guestName.trim() || form.contact?.name || null,
      guestEmail: form.guestEmail.trim() || null, guestPhone: form.guestPhone.trim() || null, notes: form.notes.trim() || null,
    }
    try {
      await create.mutateAsync({ data, key: keyFor(data) })
      onOpenChange(false)
    } catch (error) {
      if (error?.code === 'SLOT_TAKEN' || error?.code === 'SESSION_FULL') setForm((f) => ({ ...f, slot: null }))
    }
  }

  const serviceResources = resources.filter((r) => (service?.resourceIds ?? []).includes(r.id))
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent scrollable size="lg" className="gap-0 p-0 md:p-0 md:pt-0!">
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" noValidate>
          <DialogHeader icon={CalendarPlus} className="mb-0 shrink-0 px-5 pt-4 pb-3">
            <DialogTitle>Nueva reservación</DialogTitle>
            <DialogDescription>{space.name} · horario de {tz}</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
            <FormGroup title="Servicio y horario">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <SelectField label="Servicio" required options={active.map((s) => ({ value: s.id, label: s.name }))} value={form.serviceId ?? ''} error={errors.service}
                onValueChange={(serviceId) => setForm((f) => ({ ...f, serviceId, slot: null, resourceId: ANY, partySize: String(active.find((s) => s.id === serviceId)?.minParty ?? 1) }))} />
              {service?.kind === 'appointment' && serviceResources.length > 1 ? (
                <SelectField label="Recurso" options={[{ value: ANY, label: 'Cualquiera disponible' }, ...serviceResources.map((r) => ({ value: r.id, label: r.name }))]}
                  value={form.resourceId ?? ANY} onValueChange={(resourceId) => setForm((f) => ({ ...f, resourceId, slot: null }))} />
              ) : null}
            </div>
            <SlotPicker space={space} service={service} date={form.date ?? ''} onDateChange={(date) => setForm((f) => ({ ...f, date }))}
              resourceId={form.resourceId !== ANY ? form.resourceId : undefined} value={form.slot} onChange={(slot) => setForm((f) => ({ ...f, slot }))} />
            {errors.slot ? <p role="alert" className="text-xs text-[hsl(var(--destructive))]">{errors.slot}</p> : null}
            </FormGroup>
            <FormGroup title="Cliente">
              <ContactPicker label="Contacto (opcional)" value={form.contact} searchContacts={searchContacts} minQueryLength={0}
                onChange={(contact) => setForm((f) => ({ ...f, contact, guestName: f.guestName || contact?.name || '', guestEmail: f.guestEmail || contact?.email || '', guestPhone: f.guestPhone || contact?.phone || '' }))}
                hint="Vincula un contacto existente o registra solo los datos mínimos del cliente." />
              <TextField label="Nombre del cliente" value={form.guestName ?? ''} onChange={set('guestName')} maxLength={160} error={errors.guest} autoComplete="off" />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <TextField label="Correo" type="email" inputMode="email" value={form.guestEmail ?? ''} onChange={set('guestEmail')} error={errors.email} autoComplete="off" />
                <TextField label="Teléfono" type="tel" inputMode="tel" value={form.guestPhone ?? ''} onChange={set('guestPhone')} maxLength={40} autoComplete="off" />
              </div>
              {service && service.maxParty > 1 ? (
                <NumberField label="Personas" icon={null} min={service.minParty} max={service.maxParty} allowDecimal={false} value={form.partySize ?? '1'} onChange={set('partySize')} error={errors.party} hint={`De ${service.minParty} a ${service.maxParty}.`} className="sm:max-w-xs" />
              ) : errors.party ? <p role="alert" className="text-xs text-[hsl(var(--destructive))]">{errors.party}</p> : null}
              <TextareaField label="Notas internas" value={form.notes ?? ''} onChange={set('notes')} rows={2} />
            </FormGroup>
          </div>
          <DialogFooter className="mt-0 shrink-0 border-t border-[hsl(var(--border))] px-5 py-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}
              {create.isPending ? 'Reservando…' : 'Reservar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function RescheduleDialog({ open, onOpenChange, space, service, resources, booking }) {
  const tz = space.timezone
  const keyFor = useIdempotencyKey(open)
  const [date, setDate] = useState('')
  const [slot, setSlot] = useState(null)
  const [resourceId, setResourceId] = useState(ANY)
  useEffect(() => { if (open && booking) { setDate(dayKey(booking.startsAt, tz)); setSlot(null); setResourceId(ANY) } }, [open, booking, tz])
  const move = useBookingsMutation((t, { data, key }) => runly.bookings.reschedule(booking.id, data, t, key), { success: 'Reservación reprogramada.' })
  const serviceResources = resources.filter((r) => (service?.resourceIds ?? []).includes(r.id))

  async function submit(event) {
    event.preventDefault()
    if (!slot) return
    const data = { expectedVersion: booking.version, ...(slot.sessionId ? { sessionId: slot.sessionId } : { startsAt: slot.startsAt, ...(resourceId !== ANY ? { resourceId } : {}) }) }
    try {
      await move.mutateAsync({ data, key: keyFor(data) })
      onOpenChange(false)
    } catch (error) {
      if (error?.code === 'SLOT_TAKEN' || error?.code === 'SESSION_FULL') setSlot(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent scrollable size="lg" className="gap-0 p-0 md:p-0 md:pt-0!">
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" noValidate>
          <DialogHeader icon={CalendarSync} className="mb-0 shrink-0 px-5 pt-4 pb-3">
            <DialogTitle>Reprogramar reservación</DialogTitle>
            <DialogDescription>{booking ? `Ahora: ${formatDateTime(booking.startsAt, tz)}. El horario actual se libera solo si el nuevo se confirma.` : null}</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            {service?.kind === 'appointment' && serviceResources.length > 1 ? (
              <SelectField label="Recurso" options={[{ value: ANY, label: 'Cualquiera disponible' }, ...serviceResources.map((r) => ({ value: r.id, label: r.name }))]}
                value={resourceId} onValueChange={(v) => { setResourceId(v); setSlot(null) }} />
            ) : null}
            {service ? <SlotPicker space={space} service={service} date={date} onDateChange={setDate} resourceId={resourceId !== ANY ? resourceId : undefined} value={slot} onChange={setSlot} />
              : <p className={MUTED_TEXT}>El servicio de esta reservación ya no está activo.</p>}
          </div>
          <DialogFooter className="mt-0 shrink-0 border-t border-[hsl(var(--border))] px-5 py-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={!slot || move.isPending}>
              {move.isPending ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}
              {move.isPending ? 'Reprogramando…' : 'Reprogramar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
