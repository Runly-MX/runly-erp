import { useEffect, useState } from 'react'
import {
  Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, SelectField, TextField, TextareaField,
} from '@runly/ui'
import { GraduationCap, Loader2 } from 'lucide-react'
import { LEVEL_LABELS, toOptions } from '../lib/lmsLabels.js'

const EMPTY = { title: '', summary: '', category: '', level: 'basic' }
const LEVEL_OPTIONS = toOptions(LEVEL_LABELS)

// "Nuevo curso": the minimum to create a draft; the editor takes it from there.
export function CourseFormDialog({ open, onOpenChange, onSubmit, pending }) {
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState('')
  useEffect(() => { if (open) { setForm(EMPTY); setError('') } }, [open])
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))

  async function submit(event) {
    event.preventDefault()
    const title = form.title.trim()
    if (!title) { setError('El título es obligatorio.'); return }
    await onSubmit({ title, summary: form.summary.trim() || null, category: form.category.trim() || null, level: form.level })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent scrollable size="md" className="gap-0 p-0 md:p-0 md:pt-0!">
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader icon={GraduationCap} className="mb-0 shrink-0 px-5 pt-4 pb-3">
            <DialogTitle>Nuevo curso</DialogTitle>
            <DialogDescription>Se crea como borrador. Después agregas secciones, lecciones y lo publicas.</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <TextField label="Título" required value={form.title} onChange={set('title')} maxLength={200} error={error || undefined} placeholder="Ej. Inducción a la empresa" autoComplete="off" />
            <TextareaField label="Resumen" value={form.summary} onChange={set('summary')} rows={2} placeholder="Qué aprenderá la persona en este curso" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextField label="Categoría" value={form.category} onChange={set('category')} placeholder="Ej. Seguridad" />
              <SelectField label="Nivel" options={LEVEL_OPTIONS} value={form.level} onValueChange={(level) => setForm((current) => ({ ...current, level }))} />
            </div>
          </div>
          <DialogFooter className="mt-0 shrink-0 border-t border-[hsl(var(--border))] px-5 py-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}
              {pending ? 'Creando…' : 'Crear curso'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
