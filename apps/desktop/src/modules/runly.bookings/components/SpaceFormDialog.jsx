import { useEffect, useMemo, useState } from 'react'
import {
  Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, SelectField, TextField, TextareaField,
} from '@runly/ui'
import { CalendarClock, Loader2 } from 'lucide-react'
import { MODE, MODE_HINT, optionsOf } from '../lib/bookingsLabels.js'
import { browserTimeZone, supportedTimeZones } from '../lib/bookingsTime.js'

const slugify = (text) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64)

export function useTimeZoneOptions() {
  return useMemo(() => supportedTimeZones().map((tz) => ({ value: tz, label: tz.replaceAll('_', ' ') })), [])
}

// "Nuevo sistema": identity, mode and time zone; policies live in Configuración.
export function SpaceFormDialog({ open, onOpenChange, onSubmit, pending }) {
  const zones = useTimeZoneOptions()
  const [form, setForm] = useState({ name: '', slug: '', description: '', mode: 'internal', timezone: browserTimeZone() })
  const [slugTouched, setSlugTouched] = useState(false)
  const [errors, setErrors] = useState({})
  useEffect(() => {
    if (open) { setForm({ name: '', slug: '', description: '', mode: 'internal', timezone: browserTimeZone() }); setSlugTouched(false); setErrors({}) }
  }, [open])

  const setName = (event) => {
    const name = event.target.value
    setForm((f) => ({ ...f, name, slug: slugTouched ? f.slug : slugify(name) }))
  }

  async function submit(event) {
    event.preventDefault()
    const next = {}
    if (!form.name.trim()) next.name = 'Escribe un nombre.'
    if (!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(form.slug)) next.slug = 'Usa minúsculas, números y guiones.'
    if (!form.timezone) next.timezone = 'Elige la zona horaria.'
    setErrors(next)
    if (Object.keys(next).length) return
    await onSubmit({ name: form.name.trim(), slug: form.slug, description: form.description.trim() || null, mode: form.mode, timezone: form.timezone })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent scrollable size="md" className="gap-0 p-0 md:p-0 md:pt-0!">
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" noValidate>
          <DialogHeader icon={CalendarClock} className="mb-0 shrink-0 px-5 pt-4 pb-3">
            <DialogTitle>Nuevo sistema de reservaciones</DialogTitle>
            <DialogDescription>Cada sistema tiene sus propios servicios, horarios, equipo y políticas.</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <TextField label="Nombre" required value={form.name} onChange={setName} maxLength={160} error={errors.name} placeholder="Ej. Consultorio Centro" autoComplete="off" />
            <TextField
              label="Identificador"
              required
              value={form.slug}
              onChange={(e) => { setSlugTouched(true); setForm((f) => ({ ...f, slug: e.target.value.toLowerCase() })) }}
              maxLength={64}
              error={errors.slug}
              hint="Se usará en la dirección pública cuando se habilite la publicación."
            />
            <TextareaField label="Descripción" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <SelectField label="Modalidad" options={optionsOf(MODE)} value={form.mode} onValueChange={(mode) => setForm((f) => ({ ...f, mode }))} hint={MODE_HINT[form.mode]} />
              <SelectField label="Zona horaria" options={zones} value={form.timezone} onValueChange={(timezone) => setForm((f) => ({ ...f, timezone }))} error={errors.timezone} />
            </div>
          </div>
          <DialogFooter className="mt-0 shrink-0 border-t border-[hsl(var(--border))] px-5 py-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}
              {pending ? 'Creando…' : 'Crear sistema'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
