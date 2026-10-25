import { ActionMenu, Skeleton } from '@runly/ui'
import { Copy, ExternalLink, Layers, Users } from 'lucide-react'
import { StudioThumbnail } from '../StudioThumbnail.jsx'
import { editedAgo, sizeLabel } from '../../lib/formats.js'

const ROLE = { EDITOR: 'Puede editar', VIEWER: 'Solo lectura' }

// Card-wide button underneath + menu sibling on top (no nested controls).
export function DesignCard({ design, onOpen, onDuplicate }) {
  const shared = design.role && design.role !== 'OWNER'
  return (
    <div className="group relative flex w-full flex-col overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-fuchsia-500/40 hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0">
      <button type="button" onClick={onOpen} aria-label={`Abrir ${design.name}`}
        className="absolute inset-0 z-0 cursor-pointer rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2" />
      <div className="pointer-events-none relative flex aspect-[4/3] items-center justify-center bg-gradient-to-b from-[hsl(var(--muted)/0.35)] to-[hsl(var(--muted)/0.8)] p-4">
        <StudioThumbnail document={design.preview} />
        {design.preview?.page ? <span className="absolute left-2 top-2 rounded-full bg-[hsl(var(--card)/0.9)] px-2 py-0.5 text-[11px] font-medium tabular-nums text-[hsl(var(--muted-foreground))] backdrop-blur max-sm:hidden">{sizeLabel(design.preview.page)}</span> : null}
        {shared ? <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-fuchsia-600 px-2 py-0.5 text-[11px] font-semibold text-white shadow"><Users className="h-3 w-3" aria-hidden />Compartido</span> : null}
      </div>
      <div className="pointer-events-none relative flex flex-1 items-start gap-1 p-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-[hsl(var(--foreground))]" title={design.name}>{design.name}</h3>
          <p className="mt-0.5 truncate text-xs text-[hsl(var(--muted-foreground))]">
            {shared ? `${design.ownerName} · ${ROLE[design.role] ?? ''}` : `Editado ${editedAgo(design.updatedAt)}`}
          </p>
          <p className="mt-1 inline-flex items-center gap-1 text-[11px] tabular-nums text-[hsl(var(--muted-foreground))]">
            <Layers className="h-3 w-3" aria-hidden />{design.objectCount ?? 0} {design.objectCount === 1 ? 'elemento' : 'elementos'}
          </p>
        </div>
        <div className="pointer-events-auto -mr-1 -mt-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100">
          <ActionMenu label={`Opciones de ${design.name}`} items={[
            { label: 'Abrir', icon: ExternalLink, onClick: onOpen },
            { label: 'Duplicar', icon: Copy, onClick: onDuplicate },
          ]} />
        </div>
      </div>
    </div>
  )
}

export function DesignCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
      <Skeleton className="aspect-[4/3] rounded-none" />
      <div className="space-y-2 p-3"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/2" /></div>
    </div>
  )
}
