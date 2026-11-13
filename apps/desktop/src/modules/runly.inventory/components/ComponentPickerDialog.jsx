import { useEffect, useState } from 'react'
import { Boxes, ChevronLeft, ChevronRight, Link2, PackageSearch } from 'lucide-react'
import {
  Button, Checkbox, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, EmptyState, ErrorState, SearchInput, Skeleton, cn,
} from '@runly/ui'
import { toast } from 'sonner'
import { useInventoryItems, useLinkInventoryComponents } from '../hooks/useInventoryItems.js'
import { InventoryStatusBadge } from './InventoryStatusBadge.jsx'

const PAGE_SIZE = 20

// Detail card action: search existing items (same search as the inventory list)
// and link the chosen ones as components of `parent`. Only items with no links
// are offered (link=standalone). Selection survives searches and pages.
export function ComponentPickerDialog({ open, onOpenChange, parent, onCreateNew }) {
  const link = useLinkInventoryComponents()
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [page, setPage] = useState(1)
  const [picked, setPicked] = useState(new Set())
  useEffect(() => { if (open) { setPicked(new Set()); setSearch(''); setPage(1) } }, [open])
  useEffect(() => { const t = setTimeout(() => { setDebounced(search.trim()); setPage(1) }, 250); return () => clearTimeout(t) }, [search])

  const query = useInventoryItems({ search: debounced || undefined, link: 'standalone', page, pageSize: PAGE_SIZE }, { enabled: open })
  const rows = (query.data?.data ?? []).filter((item) => item.id !== parent?.id)
  const total = query.data?.total ?? rows.length
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const toggle = (id) => setPicked((current) => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  async function confirm() {
    try {
      const result = await link.mutateAsync({ itemIds: [...picked], parentItemId: parent.id })
      toast.success(`${result?.data?.linked ?? picked.size} ${picked.size === 1 ? 'componente agregado' : 'componentes agregados'}`)
      onOpenChange(false)
    } catch (err) { toast.error(err?.message ?? 'No se pudieron agregar los componentes') }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent scrollable size="2xl">
        <DialogHeader className="shrink-0" icon={Link2}>
          <DialogTitle>Agregar componentes</DialogTitle>
          <DialogDescription>Elige los activos que forman parte de {parent?.name ? `«${parent.name}»` : 'este activo'}. Se muestran los que aún no tienen vínculos.</DialogDescription>
        </DialogHeader>
        <div className="mt-3 shrink-0">
          <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} onClear={() => setSearch('')}
            placeholder="Buscar por serie, activo, nombre, colaborador, compra, comentario..." autoFocus />
        </div>
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain px-0.5">
          {query.isError ? (
            <ErrorState title="No se pudieron cargar los activos" onRetry={() => query.refetch()} />
          ) : query.isLoading ? (
            <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
          ) : !rows.length ? (
            <EmptyState icon={PackageSearch} title="Sin coincidencias" description="Prueba con otra búsqueda. Los activos que ya son principales o componentes no se ofrecen." />
          ) : (
            <ul className="space-y-1.5">
              {rows.map((item) => {
                const checked = picked.has(item.id)
                return (
                  <li key={item.id}>
                    <div role="button" tabIndex={0} onClick={() => toggle(item.id)} onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(item.id) } }}
                      className={cn('flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand-primary)/40',
                        checked ? 'border-(--brand-primary)/50 bg-(--brand-primary)/10' : 'border-transparent bg-[hsl(var(--muted))]/35 hover:bg-[hsl(var(--muted))]/70')}>
                      <Checkbox checked={checked} onCheckedChange={() => toggle(item.id)} onClick={(e) => e.stopPropagation()} aria-label={`Elegir ${item.name}`} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{item.name}</span>
                        <span className="block truncate text-xs text-[hsl(var(--muted-foreground))]">
                          {[item.folio, item.assetTag ? `Activo: ${item.assetTag}` : null, item.serialNumber ? `Serie: ${item.serialNumber}` : null, item.categoryName, item.brandName].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      <InventoryStatusBadge status={item.status} />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
        <DialogFooter className="shrink-0 items-center gap-2 sm:justify-between">
          <div className="flex items-center gap-1 text-sm text-[hsl(var(--muted-foreground))]">
            {pageCount > 1 ? (
              <>
                <Button variant="ghost" size="icon-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Página anterior"><ChevronLeft className="h-4 w-4" /></Button>
                <span className="tabular-nums">{page} / {pageCount}</span>
                <Button variant="ghost" size="icon-sm" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)} aria-label="Página siguiente"><ChevronRight className="h-4 w-4" /></Button>
              </>
            ) : null}
            <span className="ml-2">{picked.size} {picked.size === 1 ? 'elegido' : 'elegidos'}</span>
          </div>
          <div className="flex gap-2">
            {onCreateNew ? <Button variant="ghost" onClick={onCreateNew}><Boxes className="h-4 w-4" />Crear nuevo</Button> : null}
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button disabled={!picked.size || link.isPending} onClick={confirm}>{link.isPending ? 'Agregando...' : 'Agregar'}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
