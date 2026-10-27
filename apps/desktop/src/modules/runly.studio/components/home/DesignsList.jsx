import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, ConfirmDialog, EmptyState, ErrorState, PageFooter } from '@runly/ui'
import { PenTool, Plus, SearchX } from 'lucide-react'
import { toast } from 'sonner'
import { runly } from '../../../../lib/runly.js'
import { DesignCard, DesignCardSkeleton } from './DesignCard.jsx'
import { retireDesignCaches } from '../../lib/design-retirement.js'

const unwrap = response => response?.data ?? response
const PAGE_SIZE = 24
const GRID = 'grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5'
const RECENT_GRID = 'grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4'

// Designs grid. `limit` = "recent" teaser on the Inicio view: first page only,
// no pagination, and nothing at all when there are no designs yet.
export function DesignsList({ token, scopeKey, q = '', shared = 'all', limit, creating, onCreate, onOpen, onClearSearch }) {
  const queryClient = useQueryClient()
  const [removing, setRemoving] = useState(null)
  const [deleting, setDeleting] = useState(false), deletingRef = useRef(false)
  const filterKey=JSON.stringify([q,shared])
  const [pagination,setPagination]=useState({filterKey,page:1})
  const page=pagination.filterKey===filterKey?pagination.page:1
  const designs = useQuery({
    queryKey: ['studio', ...scopeKey, 'designs', page, shared, q],
    queryFn: async () => unwrap(await runly.studio.listDesigns(token, { page, shared, ...(q ? { q } : {}) })),
    enabled: Boolean(token), placeholderData: previous => previous,
    refetchInterval: 30000,
  })
  const all = designs.data ?? [], list = limit ? all.slice(0, limit) : all
  useEffect(() => { if (!designs.isFetching && !designs.isError && designs.data?.length === 0 && page > 1) setPagination({filterKey,page:page-1}) }, [designs.isFetching, designs.isError, designs.data, page,filterKey])
  async function remove() {
    if (!removing?.canDelete || deletingRef.current) return
    deletingRef.current = true; setDeleting(true)
    try {
      await runly.studio.deleteDesign(removing.id, removing.revision, token)
      retireDesignCaches(queryClient,scopeKey,removing.id)
      setRemoving(null)
      toast.success('Diseño eliminado.')
    } catch (error) {
      if ([404, 409].includes(error.status)) setRemoving(null)
      toast.error(error.status === 404 ? 'El diseño ya no está disponible.' : error.message)
    } finally { deletingRef.current = false; setDeleting(false); await queryClient.invalidateQueries({ queryKey: ['studio', ...scopeKey, 'designs'] }) }
  }
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
        {list.map(design => <li key={design.id} className="flex"><DesignCard design={design} onOpen={() => onOpen(design.id)} onDuplicate={() => duplicate(design)} onDelete={() => setRemoving(design)} /></li>)}
      </ul>
      <ConfirmDialog open={Boolean(removing)} loading={deleting} onOpenChange={open => { if (!open && !deletingRef.current) setRemoving(null) }} title="Eliminar diseño"
        description={removing ? `«${removing.name}» dejará de estar disponible para ti y sus colaboradores. Las plantillas y los archivos originales se conservarán.` : ''}
        confirmLabel="Eliminar diseño" onConfirm={remove} />
      {!limit && (page > 1 || all.length === PAGE_SIZE) ? (
        <PageFooter hideCount className="mt-2" pageIndex={page - 1} pageCount={all.length === PAGE_SIZE ? page + 1 : page} pageSize={PAGE_SIZE}
          canPrevious={page > 1 && !designs.isFetching} canNext={all.length === PAGE_SIZE && !designs.isFetching}
          onPrevious={() => setPagination({ filterKey, page: page - 1 })} onNext={() => setPagination({ filterKey, page: page + 1 })} onPageChange={index => setPagination({ filterKey, page: index + 1 })} />
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
    refetchInterval: 30000,
  })
  return Boolean(designs.data?.length)
}
