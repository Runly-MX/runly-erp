import { useEffect, useState } from 'react'
import {
  Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, MarkdownField, TextField,
} from '@runly/ui'
import { Loader2, Megaphone } from 'lucide-react'

// Create or edit an announcement. `announcement` null = create.
export function AnnouncementDialog({ open, onOpenChange, announcement, onSubmit, pending }) {
  const [form, setForm] = useState({ title: '', body: '' })
  const [error, setError] = useState('')
  useEffect(() => {
    if (open) { setForm({ title: announcement?.title ?? '', body: announcement?.body ?? '' }); setError('') }
  }, [open, announcement])
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))

  async function submit(event) {
    event.preventDefault()
    const title = form.title.trim(), body = form.body.trim()
    if (!title || !body) { setError(!title ? 'title' : 'body'); return }
    await onSubmit({ title, body })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent scrollable size="lg" className="gap-0 p-0 md:p-0 md:pt-0!">
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader icon={Megaphone} className="mb-0 shrink-0 px-5 pt-4 pb-3">
            <DialogTitle>{announcement ? 'Editar anuncio' : 'Nuevo anuncio'}</DialogTitle>
            <DialogDescription>
              {announcement ? 'Los cambios se ven de inmediato en el curso.' : 'Se avisa a todos los alumnos activos del curso y aparece en la pestaña Anuncios.'}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <TextField
              label="Título" required value={form.title} onChange={set('title')} maxLength={200} autoComplete="off"
              error={error === 'title' ? 'El título es obligatorio.' : undefined} placeholder="Ej. Nueva lección sobre seguridad"
            />
            <MarkdownField
              label="Mensaje" required value={form.body} onChange={set('body')} maxLength={10000}
              error={error === 'body' ? 'El mensaje es obligatorio.' : undefined} placeholder="Escribe el anuncio para los alumnos…"
              hint="Usa la barra para dar formato: negritas, listas y enlaces." className="[&_.mdxeditor-root-contenteditable]:min-h-[14rem]!"
            />
          </div>
          <DialogFooter className="mt-0 shrink-0 border-t border-[hsl(var(--border))] px-5 py-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}
              {announcement ? 'Guardar' : 'Publicar anuncio'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
