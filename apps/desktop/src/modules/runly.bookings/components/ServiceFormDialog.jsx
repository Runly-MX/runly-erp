import { useEffect, useState } from 'react'
import {
  Button, CheckboxField, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, SegmentedControl, SwitchField, TextField, TextareaField,
} from '@runly/ui'
import { ConciergeBell, Loader2 } from 'lucide-react'
import { KIND, MUTED_TEXT, RESOURCE_TYPE } from '../lib/bookingsLabels.js'

const EMPTY = { name: '', description: '', kind: 'appointment', durationMinutes: '60', bufferBeforeMinutes: '0', bufferAfterMinutes: '0', slotStepMinutes: '30', capacity: '10', minParty: '1', maxParty: '1', enabled: true, resourceIds: [] }
const toForm = (s, resourceIds) => ({
  name: s.name, description: s.description ?? '', kind: s.kind, durationMinutes: String(s.durationMinutes), bufferBeforeMinutes: String(s.bufferBeforeMinutes),
  bufferAfterMinutes: String(s.bufferAfterMinutes), slotStepMinutes: String(s.slotStepMinutes), capacity: String(s.capacity), minParty: String(s.minParty),
  maxParty: String(s.maxParty), enabled: s.enabled, resourceIds,
})
const int = (v) => Number.parseInt(v, 10)

// Create or edit one bookable service and the resources that can deliver it.
export function ServiceFormDialog({ open, onOpenChange, service, resourceIds = [], resources, onSubmit, pending }) {
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  useEffect(() => { if (open) { setForm(service ? toForm(service, resourceIds) : EMPTY); setErrors({}) } }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const session = form.kind === 'session'
  const toggleResource = (id, on) => setForm((f) => ({ ...f, resourceIds: on ? [...f.resourceIds, id] : f.resourceIds.filter((x) => x !== id) }))

  async function submit(event) {
    event.preventDefault()
    const next = {}
    if (!form.name.trim()) next.name = 'Escribe un nombre.'
    const range = (key, min, max, label) => { const v = int(form[key]); if (!(v >= min && v <= max)) next[key] = `${label} entre ${min} y ${max}.` }
    range('durationMinutes', 1, 1440, 'Duración')
    range('bufferBeforeMinutes', 0, 720, 'Minutos')
    range('bufferAfterMinutes', 0, 720, 'Minutos')
    range('slotStepMinutes', 5, 1440, 'Intervalo')
    range('minParty', 1, 100000, 'Personas')
    range('maxParty', 1, 100000, 'Personas')
    if (session) range('capacity', 1, 100000, 'Cupo')
    if (!next.maxParty && int(form.maxParty) < int(form.minParty)) next.maxParty = 'No puede ser menor al mínimo.'
    if (!session && !form.resourceIds.length) next.resources = 'Elige al menos un recurso: sin recurso no hay horario que ocupar.'
    setErrors(next)
    if (Object.keys(next).length) return
    const data = {
      name: form.name.trim(), description: form.description.trim() || null,
      durationMinutes: int(form.durationMinutes), bufferBeforeMinutes: int(form.bufferBeforeMinutes), bufferAfterMinutes: int(form.bufferAfterMinutes),
      slotStepMinutes: int(form.slotStepMinutes), minParty: int(form.minParty), maxParty: int(form.maxParty),
      ...(session ? { capacity: int(form.capacity) } : {}),
      ...(service ? { enabled: form.enabled } : { kind: form.kind }),
    }
    await onSubmit({ data, resourceIds: form.resourceIds })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent scrollable size="lg" className="gap-0 p-0 md:p-0 md:pt-0!">
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" noValidate>
          <DialogHeader icon={ConciergeBell} className="mb-0 shrink-0 px-5 pt-4 pb-3">
            <DialogTitle>{service ? 'Editar servicio' : 'Nuevo servicio'}</DialogTitle>
            <DialogDescription>Lo que se puede reservar en este sistema, cuánto dura y quién lo atiende.</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <TextField label="Nombre" required value={form.name} onChange={set('name')} maxLength={160} error={errors.name} placeholder="Ej. Consulta general" autoComplete="off" />
            <TextareaField label="Descripción" value={form.description} onChange={set('description')} rows={2} />
            {!service ? (
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Modalidad</p>
                <SegmentedControl ariaLabel="Modalidad del servicio" value={form.kind} onChange={(kind) => setForm((f) => ({ ...f, kind }))} options={Object.entries(KIND).map(([value, label]) => ({ value, label }))} />
                <p className={MUTED_TEXT}>{session ? 'Se reserva un lugar dentro de una sesión programada con cupo compartido.' : 'Cada reservación ocupa un recurso durante su duración.'}</p>
              </div>
            ) : <p className={MUTED_TEXT}>Modalidad: {KIND[service.kind]} (no se puede cambiar).</p>}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <TextField label="Duración (min)" type="number" inputMode="numeric" min={1} value={form.durationMinutes} onChange={set('durationMinutes')} error={errors.durationMinutes} />
              <TextField label="Buffer previo (min)" type="number" inputMode="numeric" min={0} value={form.bufferBeforeMinutes} onChange={set('bufferBeforeMinutes')} error={errors.bufferBeforeMinutes} />
              <TextField label="Buffer posterior (min)" type="number" inputMode="numeric" min={0} value={form.bufferAfterMinutes} onChange={set('bufferAfterMinutes')} error={errors.bufferAfterMinutes} />
              <TextField label="Horarios cada (min)" type="number" inputMode="numeric" min={5} value={form.slotStepMinutes} onChange={set('slotStepMinutes')} error={errors.slotStepMinutes} />
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {session ? <TextField label="Cupo por sesión" type="number" inputMode="numeric" min={1} value={form.capacity} onChange={set('capacity')} error={errors.capacity} /> : null}
              <TextField label="Mínimo de personas" type="number" inputMode="numeric" min={1} value={form.minParty} onChange={set('minParty')} error={errors.minParty} />
              <TextField label="Máximo de personas" type="number" inputMode="numeric" min={1} value={form.maxParty} onChange={set('maxParty')} error={errors.maxParty} />
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Recursos que lo atienden</legend>
              {resources.length ? (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {resources.map((r) => (
                    <CheckboxField key={r.id} label={r.name} hint={RESOURCE_TYPE[r.type]} checked={form.resourceIds.includes(r.id)} onChange={(e) => toggleResource(r.id, e.target.checked)} />
                  ))}
                </div>
              ) : <p className={MUTED_TEXT}>Este sistema aún no tiene recursos. Agrégalos en la pestaña Recursos.</p>}
              {errors.resources ? <p role="alert" className="text-xs text-[hsl(var(--destructive))]">{errors.resources}</p> : null}
            </fieldset>
            {service ? <SwitchField id="bookings-service-enabled" label="Servicio activo" description="Los servicios inactivos no aceptan nuevas reservaciones." checked={form.enabled} onChange={(enabled) => setForm((f) => ({ ...f, enabled }))} /> : null}
          </div>
          <DialogFooter className="mt-0 shrink-0 border-t border-[hsl(var(--border))] px-5 py-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}
              {pending ? 'Guardando…' : 'Guardar servicio'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
