import { useEffect, useState } from 'react'
import {
  Badge, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, NumberField, SwitchField, TextField, TextareaField,
} from '@runly/ui'
import { ClipboardList, Loader2 } from 'lucide-react'
import { STATUS_VARIANTS } from '../../lib/lmsLabels.js'

const STATUS_LABELS = { draft: 'Borrador', published: 'Publicada', archived: 'Archivada' }

export function AssessmentStatusBadge({ status }) {
  return <Badge variant={STATUS_VARIANTS[status] ?? 'secondary'}>{STATUS_LABELS[status] ?? status}</Badge>
}

const EMPTY = { title: '', description: '', limited: true, minutes: '60' }

// "Nueva evaluación": title, optional instructions and the total time.
export function AssessmentFormDialog({ open, onOpenChange, onSubmit, pending }) {
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  useEffect(() => { if (open) { setForm(EMPTY); setErrors({}) } }, [open])
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))

  async function submit(event) {
    event.preventDefault()
    const next = {}
    if (!form.title.trim()) next.title = 'El título es obligatorio.'
    const minutes = Number(form.minutes)
    if (form.limited && !(Number.isInteger(minutes) && minutes >= 1 && minutes <= 600)) next.minutes = 'Escribe de 1 a 600 minutos.'
    setErrors(next)
    if (Object.keys(next).length) return
    await onSubmit({
      title: form.title.trim(),
      description: form.description.trim() || null,
      settings: { timeLimitMinutes: form.limited ? minutes : null, maxSessions: 1 },
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent scrollable size="md" className="gap-0 p-0 md:p-0 md:pt-0!">
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader icon={ClipboardList} className="mb-0 shrink-0 px-5 pt-4 pb-3">
            <DialogTitle>Nueva evaluación</DialogTitle>
            <DialogDescription>Un examen o prueba independiente, sin curso. Se crea como borrador y después agregas sus actividades.</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <TextField label="Título" required value={form.title} onChange={set('title')} maxLength={200} error={errors.title} placeholder="Ej. Evaluación técnica de analista" autoComplete="off" />
            <TextareaField label="Descripción" value={form.description} onChange={set('description')} rows={3} placeholder="Qué evalúa y cómo se presenta" />
            <SwitchField
              id="lms-new-assessment-limited" label="Tiempo límite" description="Un solo reloj para todas las actividades; empieza cuando la persona pulsa Iniciar."
              checked={form.limited} onChange={(limited) => setForm((current) => ({ ...current, limited }))}
            />
            {form.limited ? (
              <NumberField label="Duración total (minutos)" required value={form.minutes} onChange={set('minutes')} error={errors.minutes} min={1} max={600} allowNegative={false} allowDecimal={false} />
            ) : null}
          </div>
          <DialogFooter className="mt-0 shrink-0 border-t border-[hsl(var(--border))] px-5 py-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}
              {pending ? 'Creando…' : 'Crear evaluación'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
