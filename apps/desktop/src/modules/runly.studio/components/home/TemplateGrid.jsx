import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, EmptyState, ErrorState, SearchInput, Skeleton } from '@runly/ui'
import { ChevronLeft, ChevronRight, SearchX } from 'lucide-react'
import { runly } from '../../../../lib/runly.js'
import { StudioTemplateThumbnail } from '../StudioTemplateThumbnail.jsx'
import { sizeLabel } from '../../lib/formats.js'
import { TemplatePreviewDialog } from './TemplatePreviewDialog.jsx'

// `limit` = compact teaser (no search, categories or pagination).
export function TemplateGrid({ token, scopeKey, creating, onUse, limit }) {
  const [search, setSearch] = useState(''), [q, setQ] = useState(''), [category, setCategory] = useState('all'), [page, setPage] = useState(1), [preview, setPreview] = useState(null)
  useEffect(() => { const timer = setTimeout(() => { setQ(search); setPage(1) }, 300); return () => clearTimeout(timer) }, [search])
  const catalog = useQuery({ queryKey: ['studio', ...scopeKey, 'templates', q, category, page], gcTime: 60000, staleTime: 60000,
    queryFn: async ({ signal }) => (await runly.studio.templates(token, { q, category, page }, signal)).data, enabled: Boolean(token), retry: false })
  const result = catalog.data && limit ? { ...catalog.data, data: catalog.data.data.slice(0, limit), pagination: { ...catalog.data.pagination, totalPages: 1 } } : catalog.data
  return <div className="space-y-4">
    {limit ? null : <>
      <SearchInput value={search} onChange={event => setSearch(event.target.value)} onClear={() => setSearch('')} placeholder="Buscar plantillas" aria-label="Buscar plantillas" maxLength={80} />
      <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Categorías de plantillas">
        {['all', ...(result?.categories ?? [])].map(value => <Button key={value} size="sm" variant={category === value ? 'secondary' : 'ghost'} aria-pressed={category === value}
          className="shrink-0" onClick={() => { setCategory(value); setPage(1) }}>{value === 'all' ? 'Todas' : value}</Button>)}
      </div>
    </>}
    {catalog.isPending ? <div className="grid grid-cols-2 gap-4 md:grid-cols-6" aria-label="Cargando plantillas" aria-busy="true">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="aspect-[4/5]" />)}</div> : null}
    {catalog.error ? <ErrorState title="No se pudieron cargar las plantillas" description={catalog.error.message} onRetry={catalog.refetch} /> : null}
    {result && !result.data.length ? <EmptyState icon={SearchX} title="Sin plantillas con estos filtros" description="Prueba otra búsqueda o categoría." /> : null}
    <ul className={limit ? '-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0 xl:grid-cols-6' : 'grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-6'}>
      {result?.data.map(template => <li key={template.key} className={limit ? 'w-[42%] shrink-0 snap-start sm:w-auto' : undefined}>
        <button type="button" onClick={() => setPreview(template)} aria-label={`Ver plantilla ${template.name}`} className="group w-full rounded-2xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]">
          <div className="flex aspect-[4/5] items-center justify-center overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.5)] p-4 transition-colors group-hover:border-fuchsia-500/40">
            <StudioTemplateThumbnail templateId={template.id} document={template.document} frameRatio={4 / 5} />
          </div>
          <p className="mt-2 truncate text-sm font-semibold">{template.name}</p>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">{template.category} · {sizeLabel(template)}</p>
        </button>
      </li>)}
    </ul>
    {result?.pagination.totalPages > 1 ? <nav className="flex items-center justify-center gap-2" aria-label="Paginación de plantillas">
      <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(value => value - 1)}><ChevronLeft />Anterior</Button>
      <span className="text-sm">{page} / {result.pagination.totalPages}</span>
      <Button size="sm" variant="outline" disabled={page >= result.pagination.totalPages} onClick={() => setPage(value => value + 1)}>Siguiente<ChevronRight /></Button>
    </nav> : null}
    <TemplatePreviewDialog templates={result?.data ?? []} template={preview} onChange={setPreview} onUse={onUse} creating={creating} />
  </div>
}
