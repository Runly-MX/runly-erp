import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckboxField, LoadingState, NotFoundState, NumberField, SelectField, SwitchField, TextField, TextareaField } from '@runly/ui'
import { CalendarClock, CheckCircle2, Circle, FileText, ShieldCheck, ToggleRight } from 'lucide-react'
import { runly } from '../../../lib/runly.js'
import { FormActionBar, FormPage, FormSection, useLeaveGuard } from '../../../components/form-page/FormPage.jsx'
import { useTimeZoneOptions } from '../../runly.bookings/components/SpaceFormDialog.jsx'
import { browserTimeZone } from '../../runly.bookings/lib/bookingsTime.js'
import { useEvent, useTicketingMutation } from '../hooks/useTicketing.js'
import { MUTED, slugOf, ticketingPath } from '../lib/ticketingLabels.js'

const SLUG = /^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])$/
const empty = () => ({
  title: '', slug: '', description: '', venue: '', timezone: browserTimeZone(), durationMinutes: '120',
  maxPerOrder: '10', holdMinutes: '15', transferAllowed: true, transferCutoffHours: '', holderNameRequired: false, refundText: '', salesOpen: false, enabled: true,
})
const fromEvent = (e) => ({
  title: e.title, slug: e.slug, description: e.description ?? '', venue: e.venue ?? '', timezone: e.timezone ?? 'UTC', durationMinutes: '',
  maxPerOrder: String(e.policy.maxPerOrder), holdMinutes: String(e.policy.holdMinutes), transferAllowed: e.policy.transferAllowed,
  transferCutoffHours: e.policy.transferCutoffMinutes == null ? '' : String(e.policy.transferCutoffMinutes / 60), holderNameRequired: e.policy.holderNameRequired,
  refundText: e.policy.refundText ?? '', salesOpen: e.salesOpen, enabled: e.enabled,
})
const int = (v) => Number.parseInt(v, 10)

function validate(form, editing) {
  const errors = {}
  if (!form.title.trim()) errors.title = 'Escribe el nombre del evento.'
  if (!editing && !SLUG.test(form.slug)) errors.slug = 'De 3 a 64 caracteres: minúsculas, números y guiones.'
  if (!editing && !(int(form.durationMinutes) >= 1 && int(form.durationMinutes) <= 1440)) errors.durationMinutes = 'Entre 1 y 1440 minutos.'
  if (!(int(form.maxPerOrder) >= 1 && int(form.maxPerOrder) <= 100)) errors.maxPerOrder = 'Entre 1 y 100.'
  if (!(int(form.holdMinutes) >= 1 && int(form.holdMinutes) <= 1440)) errors.holdMinutes = 'Entre 1 y 1440 minutos.'
  if (form.transferCutoffHours !== '' && !(Number(form.transferCutoffHours) >= 0 && Number(form.transferCutoffHours) <= 168)) errors.transferCutoffHours = 'Entre 0 y 168 horas, o vacío.'
  return errors
}

export default function TicketingEventEditor({ eventId }) {
  const isNew = !eventId
  const event = useEvent(eventId)
  if (!isNew && event.isPending) return <LoadingState />
  if (!isNew && (event.isError || !event.data)) return <NotFoundState title="Evento no encontrado" description="No existe o no tienes acceso." />
  if (!isNew && event.data.role !== 'admin') return <NotFoundState title="Sin permiso" description="Solo quien administra el evento lo edita." />
  return <EditorForm key={eventId ?? 'new'} event={isNew ? null : event.data} />
}

function EditorForm({ event }) {
  const navigate = useNavigate()
  const zones = useTimeZoneOptions()
  const [initial] = useState(() => (event ? fromEvent(event) : empty()))
  const [form, setForm] = useState(initial)
  const [slugTouched, setSlugTouched] = useState(Boolean(event))
  const [attempted, setAttempted] = useState(false)
  const dirty = JSON.stringify(form) !== JSON.stringify(initial)
  const { leave, commit, dialog } = useLeaveGuard(dirty)
  const problems = validate(form, Boolean(event))
  const errors = attempted ? problems : {}
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const back = () => navigate(event ? ticketingPath(`/events/${event.id}`) : ticketingPath('/events'))
  const save = useTicketingMutation((t, data) => (event ? runly.ticketing.updateEvent(event.id, data, t) : runly.ticketing.createEvent(data, t)), { success: event ? 'Evento guardado.' : 'Evento creado. Ahora agrega sus funciones y boletos.' })

  async function submit(e) {
    e.preventDefault()
    setAttempted(true)
    if (Object.keys(problems).length) { requestAnimationFrame(() => document.querySelector('form [aria-invalid="true"]')?.focus()); return }
    const policy = {
      maxPerOrder: int(form.maxPerOrder), holdMinutes: int(form.holdMinutes), transferAllowed: form.transferAllowed,
      transferCutoffMinutes: form.transferCutoffHours === '' ? null : Math.round(Number(form.transferCutoffHours) * 60), holderNameRequired: form.holderNameRequired, refundText: form.refundText.trim() || null,
    }
    const common = { title: form.title.trim(), description: form.description.trim() || null, venue: form.venue.trim() || null, policy }
    const data = event ? { ...common, salesOpen: form.salesOpen, enabled: form.enabled } : { ...common, slug: form.slug, timezone: form.timezone, durationMinutes: int(form.durationMinutes) }
    const saved = await save.mutateAsync(data).catch(() => null)
    if (saved) commit(() => navigate(ticketingPath(`/events/${(saved.data ?? saved).id}${event ? '' : '?tab=sessions'}`)))
  }

  const missing = [problems.title && 'nombre', problems.slug && 'dirección'].filter(Boolean)
  const status = save.isPending ? 'Guardando…' : missing.length ? `Falta: ${missing.join(' y ')}` : dirty ? <span className="font-medium text-[hsl(var(--foreground))]">Cambios sin guardar</span> : event ? 'Sin cambios' : ''
  const steps = [
    { ok: !problems.title, label: 'Nombre del evento' },
    { ok: Boolean(event) || !problems.slug, label: 'Dirección del evento' },
    { ok: false, label: 'Funciones (fecha, hora y cupo)', later: true },
    { ok: false, label: 'Tipos de boleto', later: true },
  ]

  return (
    <>
      <FormPage
        onSubmit={submit}
        onBack={() => leave(back)}
        backLabel={event ? event.title : 'Mis eventos'}
        eyebrow="Boletos"
        title={event ? `Editar ${event.title}` : 'Nuevo evento'}
        description="Datos generales y reglas de venta. Las funciones y los tipos de boleto se agregan después, dentro del evento."
        aside={event ? null : (
          <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
            <p className="text-xs font-medium tracking-wide text-[hsl(var(--muted-foreground))] uppercase">Pasos</p>
            <ul className="mt-3 space-y-2.5">
              {steps.map((s) => (
                <li key={s.label} className="flex items-center gap-2 text-sm">
                  {s.ok ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" /> : <Circle className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />}
                  <span className={s.ok ? '' : 'text-[hsl(var(--muted-foreground))]'}>{s.label}{s.later ? ' · después de crear' : ''}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        footer={<FormActionBar status={status} pending={save.isPending} submitLabel={event ? 'Guardar cambios' : 'Crear evento'} onCancel={() => leave(back)} />}
      >
        <FormSection icon={FileText} title="Evento" description="Cómo se llama y dónde es.">
          <TextField label="Nombre" required value={form.title} error={errors.title} maxLength={160} placeholder="Ej. Concierto de primavera" autoFocus={!event}
            onChange={(e) => { const title = e.target.value; setForm((f) => ({ ...f, title, ...(slugTouched ? {} : { slug: slugOf(title) }) })) }} />
          {event ? <p className={MUTED}>Dirección: {event.slug}</p> : (
            <TextField label="Dirección (slug)" required value={form.slug} error={errors.slug} autoComplete="off" hint="Se usará en la página pública del evento; no cambia después."
              onChange={(e) => { setSlugTouched(true); setForm((f) => ({ ...f, slug: e.target.value.toLowerCase() })) }} />
          )}
          <TextField label="Lugar" value={form.venue} onChange={set('venue')} maxLength={500} placeholder="Teatro, foro o dirección" />
          <TextareaField label="Descripción" value={form.description} onChange={set('description')} rows={3} />
        </FormSection>

        <FormSection icon={CalendarClock} title="Horario" description={event ? 'La zona horaria y la duración de las funciones se fijan al crear el evento.' : 'Las funciones se interpretan en esta zona; cada una dura lo que indiques aquí.'}>
          {event ? <p className="text-sm">Zona horaria: <span className="font-medium">{form.timezone.replaceAll('_', ' ')}</span></p> : (
            <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2">
              <SelectField label="Zona horaria" options={zones} value={form.timezone} onValueChange={(timezone) => setForm((f) => ({ ...f, timezone }))} />
              <NumberField label="Duración de cada función" suffix="min" icon={null} min={1} max={1440} allowDecimal={false} value={form.durationMinutes} onChange={set('durationMinutes')} error={errors.durationMinutes} />
            </div>
          )}
        </FormSection>

        <FormSection icon={ShieldCheck} title="Reglas de venta" description="Se aplican en taquilla y, más adelante, en la venta en línea.">
          <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2">
            <NumberField label="Máximo de boletos por orden" icon={null} min={1} max={100} allowDecimal={false} value={form.maxPerOrder} onChange={set('maxPerOrder')} error={errors.maxPerOrder} />
            <NumberField label="Apartar boletos por pagar durante" suffix="min" icon={null} min={1} max={1440} allowDecimal={false} value={form.holdMinutes} onChange={set('holdMinutes')} error={errors.holdMinutes} hint="Si no se cobran en Caja a tiempo, los lugares se liberan." />
          </div>
          <CheckboxField label="Pedir el nombre de cada asistente" hint="Cada boleto lleva el nombre de quien entra." checked={form.holderNameRequired} onChange={(e) => setForm((f) => ({ ...f, holderNameRequired: e.target.checked }))} />
          <SwitchField id="ticketing-transfer" label="Permitir transferir boletos" description="Cambiar el titular emite un QR nuevo y el anterior deja de servir." checked={form.transferAllowed} onChange={(transferAllowed) => setForm((f) => ({ ...f, transferAllowed }))} />
          {form.transferAllowed ? (
            <NumberField label="Transferir hasta" suffix="h antes" icon={null} min={0} max={168} value={form.transferCutoffHours} onChange={set('transferCutoffHours')} error={errors.transferCutoffHours} hint="Vacío: hasta el inicio de la función." className="pr-20 sm:max-w-xs" />
          ) : null}
          <TextareaField label="Política de reembolso" value={form.refundText} onChange={set('refundText')} rows={3} hint="Texto que verá el comprador. Los boletos pagados se cancelan después de devolver el cobro en Caja." />
        </FormSection>

        {event ? (
          <FormSection icon={ToggleRight} title="Estado">
            <SwitchField id="ticketing-sales-open" label="Venta en línea abierta" description="La taquilla siempre puede emitir. La venta en línea llega en una fase posterior." checked={form.salesOpen} onChange={(salesOpen) => setForm((f) => ({ ...f, salesOpen }))} />
            <SwitchField id="ticketing-enabled" label="Evento activo" description="Un evento desactivado conserva sus boletos, pero no emite nuevos." checked={form.enabled} onChange={(enabled) => setForm((f) => ({ ...f, enabled }))} />
          </FormSection>
        ) : null}
      </FormPage>
      {dialog}
    </>
  )
}
