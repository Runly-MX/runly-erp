import { useEffect, useState } from 'react'
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, TextField } from '@runly/ui'
import { Layers, Loader2 } from 'lucide-react'

// Create or rename a section. `section` null = create.
export function SectionDialog({ open, onOpenChange, section, onSubmit, pending }) {
  const [title, setTitle] = useState('')
  const [error, setError] = useState('')
  useEffect(() => { if (open) { setTitle(section?.title ?? ''); setError('') } }, [open, section])

  async function submit(event) {
    event.preventDefault()
    const value = title.trim()
    if (!value) { setError('El nombre es obligatorio.'); return }
    await onSubmit(value)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <form onSubmit={submit}>
          <DialogHeader icon={Layers}>
            <DialogTitle>{section ? 'Renombrar sección' : 'Nueva sección'}</DialogTitle>
            <DialogDescription>Las secciones agrupan las lecciones del curso, por ejemplo por tema o semana.</DialogDescription>
          </DialogHeader>
          <TextField label="Nombre" required value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} error={error || undefined} placeholder="Ej. Módulo 1: Introducción" autoComplete="off" />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}
              {section ? 'Guardar' : 'Crear sección'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
