import { useEffect, useRef } from 'react'
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, PersonAvatar, cn } from '@runly/ui'
import { ArrowDown, ArrowUp, ClipboardCopy, Copy, GripVertical, ImageOff, MoreVertical, MoveRight, Pencil, Trash2 } from 'lucide-react'

function Presence({ people }) {
  if (!people.length) return null
  return (
    <span className="flex items-center -space-x-1.5" role="img" aria-label={`Editando esta página: ${people.map(person => person.name).join(', ')}`}>
      {people.slice(0, 3).map(person => <PersonAvatar key={person.userId} name={person.name} src={person.avatarUrl} size="sm" title={person.name}
        className="h-5 w-5 ring-2 ring-offset-0" style={{ '--tw-ring-color': person.color }} />)}
      {people.length > 3 ? <span className="z-10 flex h-5 min-w-5 items-center justify-center rounded-full bg-[hsl(var(--muted))] px-1 text-[10px] font-medium">+{people.length - 3}</span> : null}
    </span>
  )
}

// Lazy thumbnail: asks for its render only while it is (almost) on screen.
function Thumb({ page, entry, failed, want, compact }) {
  const node = useRef(null)
  useEffect(() => {
    const element = node.current
    if (!element) return undefined
    if (typeof IntersectionObserver === 'undefined') { want(page.id, true); return () => want(page.id, false) }
    const observer = new IntersectionObserver(([hit]) => want(page.id, hit.isIntersecting), { rootMargin: '160px' })
    observer.observe(element)
    return () => { observer.disconnect(); want(page.id, false) }
  }, [page.id, want])
  const ratio = page.width / page.height
  return (
    <span ref={node} data-thumb={entry ? 'ready' : failed ? 'failed' : 'loading'}
      className={cn('relative flex shrink-0 items-center justify-center overflow-hidden rounded-md border-2 bg-[hsl(var(--muted)/0.6)]', page.active ? 'border-fuchsia-500' : 'border-[hsl(var(--border))]')}
      style={compact ? { width: 64, height: 64 } : { width: '100%', aspectRatio: String(Math.max(0.4, Math.min(2.5, ratio))) }}>
      {entry ? <img src={entry.url} alt="" draggable={false} className="h-full w-full object-contain" />
        : failed ? <ImageOff className="h-5 w-5 text-[hsl(var(--muted-foreground))]" aria-label="Sin vista previa" />
          : <span className="h-full w-full animate-pulse bg-[hsl(var(--muted))] motion-reduce:animate-none" aria-hidden />}
    </span>
  )
}

// One page of the document: thumbnail, number, name, who is on it, and its actions.
export function PageCard({ page, index, total, layout, canEdit, selectedCount, people, entry, failed, want, dragging, dropTarget,
  onSelect, onDuplicate, onRename, onRemove, onMove, onTransfer, onDragStart, onHandleKey }) {
  const label = page.label, tile = layout === 'grid'
  const handle = canEdit && total > 1 ? (
    <button type="button" aria-label={`Reordenar ${label}. Flechas para mover`} data-handle onPointerDown={event => onDragStart(event, page.id)} onKeyDown={event => onHandleKey(event, page.id)}
      className={cn('flex shrink-0 touch-none cursor-grab items-center justify-center rounded-md text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] active:cursor-grabbing',
        tile ? 'absolute left-2 top-2 z-10 h-8 w-8 bg-[hsl(var(--card)/0.9)]' : 'h-10 w-6')}>
      <GripVertical className="h-4 w-4" aria-hidden />
    </button>
  ) : null
  const transferLabel = verb => `${verb} selección aquí${selectedCount && !page.active ? ` (${selectedCount})` : ''}`
  const menu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Opciones de ${label}`} className={cn('h-8 w-8 shrink-0', tile && 'absolute right-2 top-2 z-10 bg-[hsl(var(--card)/0.9)]')}><MoreVertical className="h-4 w-4" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuItem onSelect={() => onSelect(page.id)} className="gap-2.5"><MoveRight className="h-4 w-4" />Ir a esta página</DropdownMenuItem>
        {canEdit ? <>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => onDuplicate(page.id)} className="gap-2.5"><Copy className="h-4 w-4" />Duplicar página</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onRename(page.id)} className="gap-2.5"><Pencil className="h-4 w-4" />Cambiar nombre</DropdownMenuItem>
          <DropdownMenuItem disabled={index === 0} onSelect={() => onMove(page.id, index - 1)} className="gap-2.5"><ArrowUp className="h-4 w-4" />Mover antes</DropdownMenuItem>
          <DropdownMenuItem disabled={index === total - 1} onSelect={() => onMove(page.id, index + 1)} className="gap-2.5"><ArrowDown className="h-4 w-4" />Mover después</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={page.active || !selectedCount} onSelect={() => onTransfer(page.id, true)} className="gap-2.5"><ClipboardCopy className="h-4 w-4" />{transferLabel('Copiar')}</DropdownMenuItem>
          <DropdownMenuItem disabled={page.active || !selectedCount} onSelect={() => onTransfer(page.id, false)} className="gap-2.5"><MoveRight className="h-4 w-4" />{transferLabel('Mover')}</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={total < 2} onSelect={() => onRemove(page.id)} className="gap-2.5 text-[hsl(var(--destructive))] focus:text-[hsl(var(--destructive))]"><Trash2 className="h-4 w-4" />Eliminar página</DropdownMenuItem>
        </> : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
  const body = (
    <button type="button" onClick={() => onSelect(page.id)} aria-current={page.active ? 'page' : undefined} aria-label={`${label}, página ${index + 1} de ${total}${page.active ? ', activa' : ''}`}
      className={cn('min-w-0 flex-1 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]', tile ? 'flex w-full flex-col gap-1.5 p-1.5' : 'flex items-center gap-3 p-1.5')}>
      <Thumb page={page} entry={entry} failed={failed} want={want} compact={!tile} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5"><span className="shrink-0 text-xs font-semibold tabular-nums text-[hsl(var(--muted-foreground))]">{index + 1}</span><span className="truncate text-sm font-medium">{label}</span></span>
        <span className="mt-0.5 flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
          <span className="truncate tabular-nums">{page.width} × {page.height} · {page.objectCount} {page.objectCount === 1 ? 'elemento' : 'elementos'}</span>
          <Presence people={people} />
        </span>
      </span>
    </button>
  )
  return (
    <li data-page-id={page.id} data-active={page.active ? 'true' : undefined}
      className={cn('relative flex rounded-md transition-colors', tile ? 'flex-col' : 'items-center gap-0.5', page.active ? 'bg-[hsl(var(--muted))]' : 'hover:bg-[hsl(var(--muted)/0.6)]',
        dragging && 'opacity-40', dropTarget && 'outline outline-2 -outline-offset-2 outline-fuchsia-500')}>
      {handle}{body}{menu}
    </li>
  )
}
