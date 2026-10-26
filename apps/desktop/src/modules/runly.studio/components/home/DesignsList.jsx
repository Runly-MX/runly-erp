import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, EmptyState, ErrorState } from '@runly/ui'
import { ChevronLeft, ChevronRight, PenTool, Plus, SearchX } from 'lucide-react'
import { toast } from 'sonner'
import { runly } from '../../../../lib/runly.js'
import { DesignCard, DesignCardSkeleton } from './DesignCard.jsx'

const unwrap = response => response?.data ?? response
const PAGE_SIZE = 24
const GRID = 'grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5'
const RECENT_GRID = 'grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4'

// Designs grid. `limit` = "recent" teaser on the Inicio view: first page only,
// no pagination, and nothing at all when there are no designs yet.
export function DesignsList({ token, scopeKey, q = '', shared = 'all', limit, creating, onCreate, onOpen, onClearSearch }) {
  const [page, setPage] = useState(1)
  useEffect(() => setPage(1), [q, shared])
  const designs = useQuery({
    queryKey: ['studio', ...scopeKey, 'designs', page, shared, q],
    queryFn: async () => unwrap(await runly.studio.listDesigns(token, { page, shared, ...(q ? { q } : {}) })),
    enabled: Boolean(token), placeholderData: previous => previous,
  })
  const all = designs.data ?? [], list = limit ? all.slice(0, limit) : all
  async function duplicate(design) {
    try {
      const source = unwrap(await runly.studio.getDesign(design.id, token))
      await onCreate('copy', { name: `${design.name.slice(0, 145)} (copia)`, document: source.document, sourceDesignId: design.id })
    } catch (error) { toast.error(error.message) }
  }
  if (designs.isPending) return <div className={limit ? RECENT_GRID : GRID} aria-busy="true" aria-label="Cargando diseños">{Array.from({ length: limit ?? 8 }, (_, index) => <DesignCardSkeleton key={index} />)}</div>
  if (designs.isError) return <ErrorState title="No se pudieron cargar tus diseños" description={designs.error?.message} onRetry={() => designs.refetch()} />
  if (!list.length && page === 1) {
    if (limit) return null
    return q || shared !== 'all'
      ? <EmptyState icon={SearchX} title="Sin resultados" description={q ? `Ningún diseño coincide con «${q}».` : 'No hay diseños en esta vista.'}
        action={q && onClearSearch ? <Button variant="outline" onClick={onClearSearch}>Limpiar búsqueda</Button> : null} />
      : <EmptyState icon={PenTool} title="Tu próxima idea empieza aquí" description="Elige un formato o una plantilla para crear tu primer diseño."
        action={<Button onClick={() => onCreate('format', { key: 'post', width: 1080, height: 1080 })} disabled={Boolean(creating)}><Plus />Crear diseño</Button>} />
  }
  return (
    <>
      <ul className={limit ? RECENT_GRID : GRID} aria-busy={designs.isFetching}>
        {list.map(design => <li key={design.id} className="flex"><DesignCard design={design} onOpen={() => onOpen(design.id)} onDuplicate={() => duplicate(design)} /></li>)}
      </ul>
      {!limit && (page > 1 || all.length === PAGE_SIZE) ? (
        <nav aria-label="Paginación de diseños" className="mt-5 flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page === 1 || designs.isFetching} onClick={() => setPage(value => value - 1)}><ChevronLeft />Anterior</Button>
          <span className="min-w-20 text-center text-sm tabular-nums text-[hsl(var(--muted-foreground))]">Página {page}</span>
          <Button variant="outline" size="sm" disabled={all.length !== PAGE_SIZE || designs.isFetching} onClick={() => setPage(value => value + 1)}>Siguiente<ChevronRight /></Button>
        </nav>
      ) : null}
    </>
  )
}

// Whether the user has any design (shares the page-1 cache with DesignsList).
export function useHasDesigns({ token, scopeKey }) {
  const designs = useQuery({
    queryKey: ['studio', ...scopeKey, 'designs', 1, 'all', ''],
    queryFn: async () => unwrap(await runly.studio.listDesigns(token, { page: 1, shared: 'all' })),
    enabled: Boolean(token),
  })
  return Boolean(designs.data?.length)
}
