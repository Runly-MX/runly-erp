import { useEffect, useState } from 'react'
import { Alert, AlertDescription, AlertTitle, NumberField, SectionCard, SelectField, SwitchField, TextField, TextareaField } from '@runly/ui'
import { CalendarClock, Globe, Settings2, ShieldCheck } from 'lucide-react'
import { runly } from '../../../lib/runly.js'
import { useBookingsMutation } from '../hooks/useBookings.js'
import { MODE, MODE_HINT, MUTED_TEXT, optionsOf } from '../lib/bookingsLabels.js'
import { FormActionBar, useLeaveGuard } from '../../../components/form-page/FormPage.jsx'
import { useTimeZoneOptions } from './SpaceFormDialog.jsx'

const fromSpace = (s) => ({
  name: s.name, description: s.description ?? '', mode: s.mode, timezone: s.timezone, enabled: s.enabled,
  leadMinutes: String(s.policy?.leadMinutes ?? 0), horizonDays: String(s.policy?.horizonDays ?? 90),
  requiresApproval: Boolean(s.policy?.requiresApproval), holdMinutes: s.policy?.holdMinutes == null ? '' : String(s.policy.holdMinutes),
  cancelUntilHours: s.policy?.cancelUntilMinutes == null ? '' : String(s.policy.cancelUntilMinutes / 60),
  rescheduleUntilHours: s.policy?.rescheduleUntilMinutes == null ? '' : String(s.policy.rescheduleUntilMinutes / 60),
  reservers: s.policy?.reservers ?? 'company', maxHours: String((s.policy?.maxMinutes ?? 480) / 60),
})
const hoursToMinutes = (v) => (v === '' ? null : Math.round(Number(v) * 60))

// General rules of the space; publication lives in "Reservas online".
export function SpaceSettingsTab({ space, canEdit }) {
  const zones = useTimeZoneOptions()
  const server = fromSpace(space)
  const serverKey = JSON.stringify(server)
  const [initial, setInitial] = useState(server)
  const [form, setForm] = useState(server)
  const [errors, setErrors] = useState({})
  const dirty = JSON.stringify(form) !== JSON.stringify(initial)
  const { dialog } = useLeaveGuard(dirty)
  // Follow the server only while nothing is being edited: a background refetch
  // (window focus, another tab's save) must never wipe what the person typed.
  useEffect(() => {
    if (dirty) return
    setInitial(server); setForm(server); setErrors({})
  }, [serverKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const save = useBookingsMutation((t, data) => runly.bookings.updateSpace(space.id, data, t), { success: 'Configuración guardada.' })
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  async function submit(event) {
    event.preventDefault()
    const next = {}
    const lead = Number.parseInt(form.leadMinutes, 10), horizon = Number.parseInt(form.horizonDays, 10), hold = form.holdMinutes === '' ? null : Number.parseInt(form.holdMinutes, 10)
    if (!form.name.trim()) next.name = 'Escribe un nombre.'
    if (!(lead >= 0 && lead <= 525600)) next.leadMinutes = 'Entre 0 y 525600 minutos.'
    if (!(horizon >= 1 && horizon <= 730)) next.horizonDays = 'Entre 1 y 730 días.'
    if (hold !== null && !(hold >= 1 && hold <= 10080)) next.holdMinutes = 'Entre 1 y 10080 minutos, o vacío.'
    const cancelUntil = hoursToMinutes(form.cancelUntilHours), rescheduleUntil = hoursToMinutes(form.rescheduleUntilHours)
    if (cancelUntil !== null && !(cancelUntil >= 0 && cancelUntil <= 525600)) next.cancelUntilHours = 'Entre 0 y 8760 horas, o vacío.'
    if (rescheduleUntil !== null && !(rescheduleUntil >= 0 && rescheduleUntil <= 525600)) next.rescheduleUntilHours = 'Entre 0 y 8760 horas, o vacío.'
    const rooms = space.purpose === 'resources'
    const maxMinutes = Math.round(Number(form.maxHours) * 60)
    if (rooms && !(maxMinutes >= 15 && maxMinutes <= 720 && maxMinutes % 15 === 0)) next.maxHours = 'Entre 0.25 y 12 horas, en cuartos de hora.'
    setErrors(next)
    if (Object.keys(next).length) return
    const saved = await save.mutateAsync({
      name: form.name.trim(), description: form.description.trim() || null, mode: form.mode, timezone: form.timezone, enabled: form.enabled,
      policy: { leadMinutes: lead, horizonDays: horizon, requiresApproval: form.requiresApproval, holdMinutes: hold, cancelUntilMinutes: cancelUntil, rescheduleUntilMinutes: rescheduleUntil, ...(rooms ? { reservers: form.reservers, maxMinutes } : {}) },
    }).then(() => true).catch(() => false)
    // Baseline = what was saved; the refetch then confirms it without a flash.
    if (saved) setInitial(form)
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <SectionCard title="General" icon={Settings2}>
        <div className="space-y-4">
          <TextField label="Nombre" required value={form.name} onChange={set('name')} error={errors.name} disabled={!canEdit} maxLength={160} />
          <TextareaField label="Descripción" value={form.description} onChange={set('description')} rows={2} disabled={!canEdit} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SelectField label="Modalidad" options={optionsOf(MODE)} value={form.mode} onValueChange={(mode) => setForm((f) => ({ ...f, mode }))} hint={MODE_HINT[form.mode]} disabled={!canEdit} />
            <SelectField label="Zona horaria" options={zones} value={form.timezone} onValueChange={(timezone) => setForm((f) => ({ ...f, timezone }))} disabled={!canEdit}
              hint="Los horarios semanales se interpretan en esta zona. Las reservaciones ya hechas conservan su instante." />
          </div>
          <SwitchField id="bookings-space-enabled" label="Sistema operando" description="Un sistema desactivado conserva sus datos, pero no acepta reservaciones nuevas." checked={form.enabled} onChange={(enabled) => setForm((f) => ({ ...f, enabled }))} disabled={!canEdit} />
        </div>
      </SectionCard>
      <SectionCard title="Políticas de reservación" icon={ShieldCheck} description="El Booking Engine las aplica al crear y reprogramar.">
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <NumberField label="Anticipación mínima" suffix="min" icon={null} min={0} max={525600} allowDecimal={false} value={form.leadMinutes} onChange={set('leadMinutes')} error={errors.leadMinutes} disabled={!canEdit} hint="0 permite reservar desde ahora." />
            <NumberField label="Reservar con hasta" suffix="días" icon={null} min={1} max={730} allowDecimal={false} value={form.horizonDays} onChange={set('horizonDays')} error={errors.horizonDays} disabled={!canEdit} hint="Qué tan lejos en el futuro se puede reservar." />
          </div>
          <SwitchField id="bookings-space-approval" label="Requiere aprobación" description="Las reservaciones nuevas quedan Pendientes hasta que alguien del equipo las confirme." checked={form.requiresApproval} onChange={(requiresApproval) => setForm((f) => ({ ...f, requiresApproval }))} disabled={!canEdit} />
          {space.purpose === 'resources' ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <SelectField label="Quién puede reservar" options={[{ value: 'company', label: 'Toda la empresa' }, { value: 'members', label: 'Solo el equipo del sistema' }]} value={form.reservers} onValueChange={(reservers) => setForm((f) => ({ ...f, reservers }))} disabled={!canEdit}
                hint={form.reservers === 'company' ? 'Cualquier persona con permiso para reservar salas.' : 'Solo quienes están en la pestaña Equipo.'} />
              <NumberField label="Duración máxima" suffix="horas" icon={null} min={0.25} max={12} value={form.maxHours} onChange={set('maxHours')} error={errors.maxHours} disabled={!canEdit} className="pr-20" />
            </div>
          ) : null}
          {form.requiresApproval ? (
            <NumberField label="Vencer pendientes después de" suffix="min" icon={null} min={1} max={10080} allowDecimal={false} value={form.holdMinutes} onChange={set('holdMinutes')} error={errors.holdMinutes} disabled={!canEdit}
              hint="Vacío: la pendiente aparta el horario hasta que se confirme o rechace." className="sm:max-w-xs" />
          ) : null}
        </div>
      </SectionCard>
      {space.purpose !== 'resources' ? (<>
      <SectionCard title="Cambios del cliente en línea" icon={CalendarClock} description="Hasta cuándo puede el cliente cancelar o reprogramar desde su enlace. Tu equipo siempre puede hacerlo.">
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <NumberField label="Cancelar hasta" suffix="h antes" icon={null} min={0} max={8760} value={form.cancelUntilHours} onChange={set('cancelUntilHours')} error={errors.cancelUntilHours} disabled={!canEdit}
              hint="Vacío: hasta la hora de inicio." className="pr-20" />
            <NumberField label="Reprogramar hasta" suffix="h antes" icon={null} min={0} max={8760} value={form.rescheduleUntilHours} onChange={set('rescheduleUntilHours')} error={errors.rescheduleUntilHours} disabled={!canEdit}
              hint="Vacío: hasta la hora de inicio." className="pr-20" />
          </div>
          <p className={MUTED_TEXT}>Cambiar estas políticas pide a los clientes aceptarlas de nuevo.</p>
        </div>
      </SectionCard>
      <Alert>
        <Globe className="h-4 w-4" />
        <AlertTitle>Reservas online</AlertTitle>
        <AlertDescription>
          {space.published ? 'Este sistema está publicado.' : 'Este sistema no está publicado.'} Las páginas públicas, sus textos y el enlace se administran en la pestaña Reservas online.
        </AlertDescription>
      </Alert>
      </>) : null}
      {canEdit ? (
        <FormActionBar
          status={dirty ? <span className="font-medium text-[hsl(var(--foreground))]">Cambios sin guardar</span> : 'Sin cambios'}
          pending={save.isPending} submitLabel="Guardar configuración" cancelLabel="Descartar"
          onCancel={() => { setForm(initial); setErrors({}) }}
        />
      ) : null}
      {dialog}
    </form>
  )
}
