import { CalendarClock } from 'lucide-react'
import { useState, useEffect } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Button, TextField,
} from '@runly/ui'

function toLocalDatetimeValue() {
  const d = new Date()
  const mins = d.getMinutes()
  d.setMinutes(mins < 30 ? 30 : 60, 0, 0)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function ReservationFormDialog({ open, onOpenChange, tableName, tableId, outletId, onSubmit, loading }) {
  const [form, setForm] = useState({
    guestName: '',
    guestPhone: '',
    partySize: '2',
    scheduledAt: toLocalDatetimeValue(),
    durationMinutes: '90',
    notes: '',
  })

  useEffect(() => {
    if (open) {
      setForm({
        guestName: '',
        guestPhone: '',
        partySize: '2',
        scheduledAt: toLocalDatetimeValue(),
        durationMinutes: '90',
        notes: '',
      })
    }
  }, [open, tableId])

  function handleChange(field) {
    return (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.guestName.trim() || !outletId) return
    onSubmit({
      outletId,
      tableId: tableId ?? null,
      guestName: form.guestName.trim(),
      guestPhone: form.guestPhone.trim() || null,
      partySize: Math.max(1, parseInt(form.partySize, 10) || 2),
      scheduledAt: new Date(form.scheduledAt).toISOString(),
      durationMinutes: Math.max(15, parseInt(form.durationMinutes, 10) || 90),
      notes: form.notes.trim() || null,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" aria-describedby={undefined}>
        <DialogHeader icon={CalendarClock}>
          <DialogTitle>Reservar {tableName}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 pt-1">
          <TextField
            label="Nombre del cliente"
            required
            value={form.guestName}
            onChange={handleChange('guestName')}
            placeholder="Ej. Juan García"
            autoFocus
            maxLength={160}
          />
          <TextField
            label="Teléfono"
            value={form.guestPhone}
            onChange={handleChange('guestPhone')}
            placeholder="Ej. 55 1234 5678"
            maxLength={60}
          />
          <div className="grid grid-cols-2 gap-3">
            <TextField
              label="Comensales"
              type="number"
              min="1"
              max="50"
              value={form.partySize}
              onChange={handleChange('partySize')}
            />
            <TextField
              label="Duración (min)"
              type="number"
              min="15"
              max="720"
              step="15"
              value={form.durationMinutes}
              onChange={handleChange('durationMinutes')}
            />
          </div>
          <TextField
            label="Fecha y hora"
            type="datetime-local"
            required
            value={form.scheduledAt}
            onChange={handleChange('scheduledAt')}
          />
          <TextField
            label="Notas"
            value={form.notes}
            onChange={handleChange('notes')}
            placeholder="Alergias, peticiones especiales..."
            maxLength={1000}
          />
          <DialogFooter>
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={!form.guestName.trim() || !outletId || loading}>
              {loading ? 'Guardando...' : 'Confirmar reserva'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
