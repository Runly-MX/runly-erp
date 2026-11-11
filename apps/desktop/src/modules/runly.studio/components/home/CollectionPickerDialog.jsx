import { useState } from 'react'
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, TextField } from '@runly/ui'
import { FolderPlus, Heart, Loader2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useCollections } from './CollectionsProvider.jsx'

// "Agregar a colección": pick an existing collection or create one on the spot.
export function CollectionPickerDialog({ item, onClose }) {
  const api = useCollections()
  const [name, setName] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const own = (api?.collections ?? []).filter(row => row.id && !row.isFavorites)
  const close = () => { setName(''); setError(''); onClose() }
  async function run(task, message) {
    setBusy(true); setError('')
    try { await task(); toast.success(message); close() } catch (failure) { setError(failure?.message ?? 'No se pudo agregar.') } finally { setBusy(false) }
  }
  return (
    <Dialog open={Boolean(item)} onOpenChange={open => { if (!open && !busy) close() }}>
      <DialogContent size="md">
        <DialogHeader icon={FolderPlus}>
          <DialogTitle>Agregar a colección</DialogTitle>
          <DialogDescription>Organiza tus diseños y plantillas. Las colecciones son solo tuyas.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <ul className="max-h-60 space-y-1 overflow-y-auto" aria-label="Tus colecciones">
            <li><Button variant="ghost" disabled={busy} className="h-11 w-full justify-start gap-2" onClick={() => run(async () => { await api.toggleFavorite(item) }, 'Favoritos actualizado.')}><Heart className="h-4 w-4 text-rose-500" aria-hidden />Favoritos</Button></li>
            {own.map(row => (
              <li key={row.id}><Button variant="ghost" disabled={busy} className="h-11 w-full justify-start gap-2" onClick={() => run(() => api.add(row.id, item), `Agregado a «${row.name}».`)}><FolderPlus className="h-4 w-4" aria-hidden /><span className="min-w-0 flex-1 truncate text-left">{row.name}</span><span className="text-xs tabular-nums text-[hsl(var(--muted-foreground))]">{row.itemCount}</span></Button></li>
            ))}
          </ul>
          <form className="flex items-end gap-2" onSubmit={event => { event.preventDefault(); if (name.trim()) run(async () => { const created = await api.create(name.trim()); await api.add(created.id, item) }, `Agregado a «${name.trim()}».`) }}>
            <TextField label="Nueva colección" value={name} maxLength={60} disabled={busy} onChange={event => setName(event.target.value)} className="flex-1" />
            <Button type="submit" disabled={busy || !name.trim()} className="mb-0.5 gap-1.5">{busy ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <Plus />}Crear y agregar</Button>
          </form>
          {error ? <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p> : null}
        </div>
        <DialogFooter><Button variant="outline" disabled={busy} onClick={close}>Cerrar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
