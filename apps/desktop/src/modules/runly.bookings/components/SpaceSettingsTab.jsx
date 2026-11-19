import { useEffect, useState } from 'react'
import { Alert, AlertDescription, AlertTitle, Button, SectionCard, SelectField, SwitchField, TextField, TextareaField } from '@runly/ui'
import { Globe, Loader2, Settings2 } from 'lucide-react'
import { runly } from '../../../lib/runly.js'
import { useBookingsMutation } from '../hooks/useBookings.js'
import { MODE, MODE_HINT, optionsOf } from '../lib/bookingsLabels.js'
import { useTimeZoneOptions } from './SpaceFormDialog.jsx'

const fromSpace = (s) => ({
  name: s.name, description: s.description ?? '', mode: s.mode, timezone: s.timezone, enabled: s.enabled,
  leadMinutes: String(s.policy?.leadMinutes ?? 0), horizonDays: String(s.policy?.horizonDays ?? 90),
  requiresApproval: Boolean(s.policy?.requiresApproval), holdMinutes: s.policy?.holdMinutes == null ? '' : String(s.policy.holdMinutes),
})

// General rules of the space. The public portal does not exist yet, so
// publication is described, not offered as a switch.
export function SpaceSettingsTab({ space, canEdit }) {
  const zones = useTimeZoneOptions()
  const [form, setForm] = useState(() => fromSpace(space))
  const [errors, setErrors] = useState({})
  useEffect(() => { setForm(fromSpace(space)); setErrors({}) }, [space])
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
    setErrors(next)
    if (Object.keys(next).length) return
    await save.mutateAsync({
      name: form.name.trim(), description: form.description.trim() || null, mode: form.mode, timezone: form.timezone, enabled: form.enabled,
      policy: { leadMinutes: lead, horizonDays: horizon, requiresApproval: form.requiresApproval, holdMinutes: hold },
    }).catch(() => {})
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
          <SwitchField label="Sistema operando" description="Un sistema desactivado conserva sus datos, pero no acepta reservaciones nuevas." checked={form.enabled} onChange={(enabled) => setForm((f) => ({ ...f, enabled }))} disabled={!canEdit} />
        </div>
      </SectionCard>
      <SectionCard title="Políticas de reservación" icon={Settings2} description="El Booking Engine las aplica al crear y reprogramar.">
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField label="Anticipación mínima (min)" type="number" inputMode="numeric" min={0} value={form.leadMinutes} onChange={set('leadMinutes')} error={errors.leadMinutes} disabled={!canEdit} hint="0 permite reservar desde ahora." />
            <TextField label="Reservar hasta (días)" type="number" inputMode="numeric" min={1} value={form.horizonDays} onChange={set('horizonDays')} error={errors.horizonDays} disabled={!canEdit} />
          </div>
          <SwitchField label="Requiere aprobación" description="Las reservaciones nuevas quedan Pendientes hasta que alguien del equipo las confirme." checked={form.requiresApproval} onChange={(requiresApproval) => setForm((f) => ({ ...f, requiresApproval }))} disabled={!canEdit} />
          {form.requiresApproval ? (
            <TextField label="Vencer pendientes después de (min)" type="number" inputMode="numeric" min={1} value={form.holdMinutes} onChange={set('holdMinutes')} error={errors.holdMinutes} disabled={!canEdit}
              hint="Vacío: la pendiente aparta el horario hasta que se confirme o rechace." />
          ) : null}
        </div>
      </SectionCard>
      <Alert>
        <Globe className="h-4 w-4" />
        <AlertTitle>Publicación online</AlertTitle>
        <AlertDescription>
          {space.published ? 'Este sistema está marcado como publicado.' : 'Este sistema todavía no se publica.'} El portal para que los clientes reserven solos llega en la siguiente fase; usará estos mismos servicios, horarios y políticas.
        </AlertDescription>
      </Alert>
      {canEdit ? (
        <div className="flex justify-end">
          <Button type="submit" disabled={save.isPending}>{save.isPending ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}Guardar configuración</Button>
        </div>
      ) : null}
    </form>
  )
}
