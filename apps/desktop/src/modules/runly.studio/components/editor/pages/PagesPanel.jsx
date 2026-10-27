import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, TextField, cn } from '@runly/ui'
import { Pencil, Plus } from 'lucide-react'
import { PageCard } from './PageCard.jsx'
import { usePageDrag } from './usePageDrag.js'

function RenameDialog({ page, onClose, onApply }) {
  const [value, setValue] = useState(page?.name ?? ''), fieldId = useId()
  const clean = value.trim()
  const submit = event => { event.preventDefault(); if (clean && clean.length <= 120) onApply(page.id, clean) }
  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent size="md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader icon={Pencil}>
            <DialogTitle>Cambiar nombre de la página</DialogTitle>
            <DialogDescription>El nombre ayuda a reconocer la página en el panel; no aparece en el diseño ni en la descarga.</DialogDescription>
          </DialogHeader>
          <TextField id={`${fieldId}-name`} label="Nombre" value={value} maxLength={120} autoFocus onChange={event => setValue(event.target.value)} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={!clean}>Guardar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// Page browser. `layout` list (side panel) or grid (phone sheet and the full
// page navigator). Everything shown comes from the real document; every action
// goes through the editor, which synchronizes it like any other change.
export function PagesPanel({ pages, layout = 'list', canEdit, selectedCount, people, thumbnails, onSelect, onAdd, onDuplicate, onRename, onRemove, onReorder, onTransfer, className }) {
  const box = useRef(null), [renaming, setRenaming] = useState(null), [message, setMessage] = useState('')
  const ids = useMemo(() => pages.map(page => page.id), [pages])
  const announce = useCallback((id, to) => {
    const page = pages.find(item => item.id === id)
    setMessage(`${page?.label ?? 'Página'} movida a la posición ${to + 1} de ${pages.length}.`)
  }, [pages])
  const { drag, start, handleKey } = usePageDrag({ ids, containerRef: box, onReorder, announce })
  // Moving a card in the DOM drops focus: give it back to the handle that was used.
  const refocus = useRef(null)
  useEffect(() => {
    if (!refocus.current) return
    box.current?.querySelector(`[data-page-id="${refocus.current}"] [data-handle]`)?.focus()
  }, [ids])
  const keyed = useCallback((event, id) => { if (event.key.startsWith('Arrow')) refocus.current = id; handleKey(event, id) }, [handleKey])
  const move = useCallback((id, to) => { const next = [...ids.filter(item => item !== id)]; next.splice(to, 0, id); onReorder(next); announce(id, to) }, [ids, onReorder, announce])
  const peopleOn = id => people.filter(person => !person.isSelf && person.sessions.some(session => (session.pageId ?? 'page-1') === id))
    return (
    <div className={cn('flex min-h-0 flex-col gap-3', className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-[hsl(var(--muted-foreground))]" aria-live="polite">{pages.length} {pages.length === 1 ? 'página' : 'páginas'}</p>
        {canEdit ? <Button size="sm" onClick={onAdd} className="h-8 gap-1.5 px-3"><Plus className="h-4 w-4" aria-hidden />Añadir página</Button> : null}
      </div>
      <ul ref={box} aria-label="Páginas del diseño" className={cn(layout === 'grid' ? 'grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2' : 'flex flex-col gap-1')}>
        {pages.map((page, index) => (
          <PageCard key={page.id} page={page} index={index} total={pages.length} layout={layout} canEdit={canEdit} selectedCount={selectedCount} people={peopleOn(page.id)}
            entry={thumbnails.thumbs[page.id]} failed={thumbnails.failed(page.id)} want={thumbnails.want} dragging={drag?.id === page.id} dropTarget={drag && drag.over === index && drag.id !== page.id}
            onSelect={onSelect} onDuplicate={onDuplicate} onRename={id => setRenaming(pages.find(item => item.id === id))} onRemove={onRemove} onMove={move}
            onTransfer={onTransfer} onDragStart={start} onHandleKey={keyed} />
        ))}
      </ul>
      <p role="status" aria-live="polite" className="sr-only">{message}</p>
      {renaming ? <RenameDialog key={renaming.id} page={renaming} onClose={() => setRenaming(null)} onApply={(id, name) => { setRenaming(null); onRename(id, name) }} /> : null}
    </div>
  )
}
