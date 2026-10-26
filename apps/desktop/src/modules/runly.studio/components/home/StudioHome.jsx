import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, EmptyState, ErrorState, SegmentedControl } from '@runly/ui'
import { ChevronLeft, ChevronRight, PenTool, Plus, SearchX } from 'lucide-react'
import { toast } from 'sonner'
import { runly } from '../../../../lib/runly.js'
import { StudioHero } from './StudioHero.jsx'
import { FormatGrid } from './FormatGrid.jsx'
import { TemplateGrid } from './TemplateGrid.jsx'
import { DesignCard, DesignCardSkeleton } from './DesignCard.jsx'
import { StudioPageDialog } from '../StudioPageDialog.jsx'

const unwrap = response => response?.data ?? response
const PAGE_SIZE = 24
const GRID = 'grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5'
const SHARED = [{ value: 'all', label: 'Todos' }, { value: 'mine', label: 'Míos' }, { value: 'shared', label: 'Compartidos' }]

function SectionTitle({ id, title, description, children }) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h2 id={id} className="text-lg font-semibold tracking-tight text-[hsl(var(--foreground))] sm:text-xl">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-[hsl(var(--muted-foreground))]">{description}</p> : null}
      </div>
      {children}
    </div>
  )
}

function useDebounced(value, delay = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => { const timer = setTimeout(() => setDebounced(value), delay); return () => clearTimeout(timer) }, [value, delay])
  return debounced
}

export function StudioHome({ token, scopeKey, creating, onCreate, onOpen }) {
  const [query, setQuery] = useState(''), [category, setCategory] = useState('all')
  const [shared, setShared] = useState('all'), [page, setPage] = useState(1), [sizeOpen, setSizeOpen] = useState(false)
  const q = useDebounced(query.trim())
  useEffect(() => setPage(1), [q, shared])
  const searching = q.length > 0
  const designs = useQuery({
    queryKey: ['studio', ...scopeKey, 'designs', page, shared, q],
    queryFn: async () => unwrap(await runly.studio.listDesigns(token, { page, shared, ...(q ? { q } : {}) })),
    enabled: Boolean(token), placeholderData: previous => previous,
  })
  const list = designs.data ?? []
  async function duplicate(design) {
    try {
      const source = unwrap(await runly.studio.getDesign(design.id, token))
      await onCreate('copy', { name: `${design.name.slice(0, 145)} (copia)`, document: source.document, sourceDesignId: design.id })
    } catch (error) { toast.error(error.message) }
  }
  const designsSection = (
    <section aria-labelledby="studio-designs-title">
      <SectionTitle id="studio-designs-title" title={searching ? `Resultados para «${q}»` : 'Tus diseños'}
        description={searching ? null : 'Continúa donde lo dejaste. Se guardan en tu empresa y puedes compartirlos.'}>
        <SegmentedControl options={SHARED} value={shared} onChange={setShared} ariaLabel="Mostrar diseños" className="w-full sm:w-[22rem] sm:shrink-0" />
      </SectionTitle>
      {designs.isPending ? <div className={GRID} aria-busy="true" aria-label="Cargando diseños">{Array.from({ length: 8 }, (_, index) => <DesignCardSkeleton key={index} />)}</div> : null}
      {designs.isError ? <ErrorState title="No se pudieron cargar tus diseños" description={designs.error?.message} onRetry={() => designs.refetch()} /> : null}
      {designs.isSuccess && !list.length && page === 1 ? (
        searching || shared !== 'all'
          ? <EmptyState icon={SearchX} title="Sin resultados" description={searching ? `Ningún diseño coincide con «${q}».` : 'No hay diseños en esta vista.'}
            action={searching ? <Button variant="outline" onClick={() => setQuery('')}>Limpiar búsqueda</Button> : null} />
          : <EmptyState icon={PenTool} title="Tu próxima idea empieza aquí" description="Elige un formato o una plantilla para crear tu primer diseño."
            action={<Button onClick={() => onCreate('format', { key: 'post', width: 1080, height: 1080 })} disabled={Boolean(creating)}><Plus />Crear diseño</Button>} />
      ) : null}
      {list.length ? (
        <ul className={GRID} aria-busy={designs.isFetching}>
          {list.map(design => <li key={design.id} className="flex"><DesignCard design={design} onOpen={() => onOpen(design.id)} onDuplicate={() => duplicate(design)} /></li>)}
        </ul>
      ) : null}
      {page > 1 || list.length === PAGE_SIZE ? (
        <nav aria-label="Paginación de diseños" className="mt-5 flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page === 1 || designs.isFetching} onClick={() => setPage(value => value - 1)}><ChevronLeft />Anterior</Button>
          <span className="min-w-20 text-center text-sm tabular-nums text-[hsl(var(--muted-foreground))]">Página {page}</span>
          <Button variant="outline" size="sm" disabled={list.length !== PAGE_SIZE || designs.isFetching} onClick={() => setPage(value => value + 1)}>Siguiente<ChevronRight /></Button>
        </nav>
      ) : null}
    </section>
  )
  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-10 px-4 pb-10 pt-4 sm:px-6 sm:pt-6 lg:px-8">
      <StudioHero query={query} onQuery={setQuery} category={category} onCategory={setCategory} />
      {searching ? designsSection : (
        <>
          <section aria-labelledby="studio-formats-title">
            <SectionTitle id="studio-formats-title" title="Empieza con un formato" description="Un lienzo con la medida justa, listo para crear." />
            <FormatGrid category={category} creating={creating} onCreate={format => onCreate('format', format)} onCustom={() => setSizeOpen(true)} />
          </section>
          {designsSection}
          <section aria-labelledby="studio-templates-title">
            <SectionTitle id="studio-templates-title" title="Plantillas para inspirarte" description="Todo es editable: cambia textos, colores, formas e imágenes." />
            <TemplateGrid token={token} scopeKey={scopeKey} creating={creating} onUse={template => onCreate('template', template)} />
          </section>
        </>
      )}
      {sizeOpen ? <StudioPageDialog open creating page={{ width: 1080, height: 1080, background: '#ffffff' }} onClose={() => setSizeOpen(false)} onApply={page => onCreate('custom', page, true)} /> : null}
    </div>
  )
}
