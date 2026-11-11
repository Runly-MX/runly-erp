import { useState } from 'react'
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, TextField, cn } from '@runly/ui'
import { Folder, FolderPlus, Heart, Loader2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useCollections } from './CollectionsProvider.jsx'

// Create or rename a collection.
export function CollectionFormDialog({ open, collection, onOpenChange, onSaved }) {
  const api = useCollections()
  const [name, setName] = useState(collection?.name ?? ''), [busy, setBusy] = useState(false), [error, setError] = useState('')
  async function submit(event) {
    event.preventDefault()
    if (!name.trim() || busy) return
    setBusy(true); setError('')
    try {
      const row = collection ? (await api.rename(collection.id, name.trim()), collection) : await api.create(name.trim())
      toast.success(collection ? 'Colección renombrada.' : 'Colección creada.')
      onSaved?.({ ...row, name: name.trim() }); onOpenChange(false)
    } catch (failure) { setError(failure?.message ?? 'No se pudo guardar la colección.') } finally { setBusy(false) }
  }
  return (
    <Dialog open={open} onOpenChange={next => { if (!busy) onOpenChange(next) }}>
      <DialogContent size="md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader icon={FolderPlus}>
            <DialogTitle>{collection ? 'Renombrar colección' : 'Nueva colección'}</DialogTitle>
            <DialogDescription>Agrupa diseños y plantillas por campaña, cliente o tema.</DialogDescription>
          </DialogHeader>
          <TextField label="Nombre" required autoFocus value={name} maxLength={60} disabled={busy} onChange={event => setName(event.target.value)} />
          {error ? <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={busy || !name.trim()}>{busy ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}{collection ? 'Guardar' : 'Crear colección'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

const rowKey = row => (row.isFavorites ? 'favorites' : row.id)

// Sidebar list (desktop) or chip row (phones) of the user's collections. `selected` is 'favorites' or an id.
export function CollectionsNav({ selected, onSelect, layout = 'list' }) {
  const api = useCollections(), [creating, setCreating] = useState(false)
  if (!api) return null
  const row = layout === 'list'
  return (
    <section aria-label="Colecciones" className={row ? 'mt-6' : 'mt-3'}>
      {row ? <h2 className="mb-1 flex items-center justify-between px-3 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Colecciones</h2> : null}
      <ul className={row ? 'space-y-1' : '-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-6 sm:px-6'}>
        {api.collections.map(item => {
          const active = selected === rowKey(item), Icon = item.isFavorites ? Heart : Folder
          return (
            <li key={rowKey(item)} className={row ? '' : 'shrink-0'}>
              <button type="button" aria-current={active ? 'true' : undefined} onClick={() => onSelect(rowKey(item))}
                className={cn(row ? 'flex h-10 w-full items-center gap-3 rounded-md px-3 text-sm font-medium' : 'inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-full border px-4 text-sm font-medium',
                  'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]',
                  active ? (row ? 'bg-fuchsia-500/12 text-fuchsia-700 dark:text-fuchsia-300' : 'border-fuchsia-500 bg-fuchsia-500/12 text-fuchsia-700 dark:text-fuchsia-300') : (row ? 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted)/0.6)] hover:text-[hsl(var(--foreground))]' : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]'))}>
                <Icon className={cn('h-[18px] w-[18px] shrink-0', item.isFavorites && 'text-rose-500')} aria-hidden />
                <span className="min-w-0 flex-1 truncate text-left">{item.name}</span>
                {row ? <span className="text-xs tabular-nums text-[hsl(var(--muted-foreground))]">{item.itemCount}</span> : null}
              </button>
            </li>
          )
        })}
        <li className={row ? '' : 'shrink-0'}>
          <button type="button" onClick={() => setCreating(true)}
            className={cn(row ? 'flex h-10 w-full items-center gap-3 rounded-md px-3 text-sm font-medium text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted)/0.6)] hover:text-[hsl(var(--foreground))]' : 'inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-full border border-dashed border-[hsl(var(--border))] px-4 text-sm font-medium text-[hsl(var(--muted-foreground))]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]')}>
            <Plus className="h-[18px] w-[18px]" aria-hidden />Nueva colección
          </button>
        </li>
      </ul>
      {creating ? <CollectionFormDialog open onOpenChange={setCreating} onSaved={row2 => onSelect(row2.id)} /> : null}
    </section>
  )
}
