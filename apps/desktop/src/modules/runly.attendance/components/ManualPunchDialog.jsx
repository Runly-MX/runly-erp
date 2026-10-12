import { useEffect, useState } from 'react'
import {
  Button, ComboboxField, DateTimeField, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
  SelectField, TextareaField,
} from '@runly/ui'
import { useManualPunch } from '../hooks/useAttendanceData.js'
import { DIRECTION_LABELS, fullName } from '../lib/attendanceLabels.js'
import { toOptions } from './shared.jsx'

const DIRECTIONS = Object.entries(DIRECTION_LABELS).map(([value, label]) => ({ value, label }))
// Browser-local "YYYY-MM-DDTHH:mm", the format DateTimeField works with.
const nowLocal = () => {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export function ManualPunchDialog({ open, onOpenChange, people, lookups }) {
  const create = useManualPunch()
  const [form, setForm] = useState({ personId: null, direction: 'in', occurredAt: '', siteId: null, note: '' })
  const [error, setError] = useState('')
  useEffect(() => {
    if (open) { setForm({ personId: null, direction: 'in', occurredAt: nowLocal(), siteId: null, note: '' }); setError('') }
  }, [open])
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }))

  async function submit() {
    if (!form.personId) { setError('Selecciona una persona.'); return }
    if (!form.occurredAt) { setError('Indica la fecha y hora.'); return }
    try {
      await create.mutateAsync({
        personId: form.personId, direction: form.direction, occurredAt: new Date(form.occurredAt).toISOString(),
        siteId: form.siteId || null, note: form.note.trim() || null,
      })
      onOpenChange(false)
    } catch { /* toast shown */ }
  }

  const personOptions = (people ?? []).filter((p) => p.enabled !== false).map((p) => ({ value: p.id, label: `${fullName(p)} (${p.code})` }))
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Checada manual</DialogTitle>
          <DialogDescription>Registra una entrada o salida que no se pudo marcar en un kiosko. Quedará marcada como manual.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <ComboboxField label="Persona" required options={personOptions} value={form.personId} onChange={set('personId')} placeholder="Buscar persona…" error={error && !form.personId ? error : undefined} />
          <SelectField label="Dirección" options={DIRECTIONS} value={form.direction} onValueChange={set('direction')} />
          <DateTimeField label="Fecha y hora" value={form.occurredAt} onChange={(e) => set('occurredAt')(e.target.value)} />
          <ComboboxField label="Sitio" options={toOptions(lookups.rows.sites)} value={form.siteId} onChange={set('siteId')} clearable placeholder="Sin sitio" />
          <TextareaField label="Nota" value={form.note} onChange={(e) => set('note')(e.target.value)} placeholder="Motivo de la checada manual" />
          {error && form.personId ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={create.isPending}>{create.isPending ? 'Registrando…' : 'Registrar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
