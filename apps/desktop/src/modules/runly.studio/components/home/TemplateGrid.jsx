import { useEffect, useMemo, useRef, useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { ActionMenu, Button, EmptyState, ErrorState, SearchInput, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton, cn } from '@runly/ui'
import { Building2, LayoutTemplate, SearchX, Sparkles, Store, User } from 'lucide-react'
import { runly } from '../../../../lib/runly.js'
import { StudioTemplateThumbnail } from '../StudioTemplateThumbnail.jsx'
import { editedAgo, sizeLabel } from '../../lib/formats.js'
import { TemplatePreviewDialog } from './TemplatePreviewDialog.jsx'
import { useTemplateActions } from '../templates/useTemplateActions.jsx'

const SCOPES = [{ value: 'all', label: 'Todas las plantillas' }, { value: 'runly', label: 'De Runly' }, { value: 'marketplace', label: 'Del Marketplace' }, { value: 'personal', label: 'Mis plantillas' }, { value: 'company', label: 'De mi empresa' }]
const EMPTY = {
  personal: { title: 'Aún no tienes plantillas', description: 'Abre un diseño y usa «Guardar como plantilla» para reutilizarlo cuando quieras.' },
  marketplace: { title: 'Aún no has importado plantillas', description: 'Las plantillas que importes desde el Marketplace aparecerán aquí.' },
  company: { title: 'Tu empresa aún no comparte plantillas', description: 'Quien tenga permiso de publicación puede compartir una plantilla con todo el equipo.' },
}

// Small, neutral marks: where the template comes from (Runly has none).
function ScopeMark({ template }) {
  const marks = [
    template.scope === 'company' ? { icon: Building2, label: 'Empresa' } : null,
    template.scope === 'personal' ? { icon: User, label: 'Mía' } : null,
    template.source === 'marketplace' ? { icon: Store, label: 'Marketplace' } : null,
    template.source === 'ai' ? { icon: Sparkles, label: 'IA', title: 'Creada con un asistente de IA' } : null,
  ].filter(Boolean)
  if (!marks.length) return null
  return (
    <span className="absolute left-2 top-2 z-10 flex gap-1">
      {marks.map(({ icon: Icon, label, title }) => (
        <span key={label} title={title ?? label} className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--card)/0.92)] px-2 py-0.5 text-[11px] font-medium text-[hsl(var(--foreground))] shadow-sm backdrop-blur">
          <Icon className="h-3 w-3" aria-hidden />{label}
        </span>
      ))}
    </span>
  )
}

function metaLine(template) {
  if (template.scope === 'runly') return `Runly · ${sizeLabel(template)}`
  return [template.ownerName, template.updatedAt ? editedAgo(template.updatedAt) : null].filter(Boolean).join(' · ')
}

// `limit` = compact teaser (no search, filters or pagination).
export function TemplateGrid({ token, scopeKey, creating, onUse, onEditContent, limit }) {
  const [search, setSearch] = useState(''), [q, setQ] = useState(''), [category, setCategory] = useState('all'), [scope, setScope] = useState('all')
  const [preview, setPreview] = useState(null), sentinel = useRef(null)
  useEffect(() => { const timer = setTimeout(() => setQ(search), 300); return () => clearTimeout(timer) }, [search])
  const catalog = useInfiniteQuery({ queryKey: ['studio', ...scopeKey, 'templates', scope, q, category, limit ? 'featured' : 'recent'], gcTime: 60000, staleTime: 60000, initialPageParam: 1,
    queryFn: async ({ signal, pageParam }) => (await runly.studio.templates(token, { scope, q, category, page: pageParam, ...(limit ? {} : { order: 'recent' }) }, signal)).data,
    getNextPageParam: last => last.pagination.page < last.pagination.totalPages ? last.pagination.page + 1 : undefined, enabled: Boolean(token), retry: false })
  const result = useMemo(() => {
    if (!catalog.data) return undefined
    const first = catalog.data.pages[0]
    const data = catalog.data.pages.flatMap(item => item.data)
    return limit ? { ...first, data: data.slice(0, limit) } : { ...first, data }
  }, [catalog.data, limit])
  const hasMore = !limit && Boolean(catalog.hasNextPage)
  // Infinite scroll: load the next page when the end of the grid approaches.
  useEffect(() => {
    const node = sentinel.current
    if (!node || !hasMore) return undefined
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting && !catalog.isFetchingNextPage) catalog.fetchNextPage() }, { rootMargin: '400px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasMore, catalog.isFetchingNextPage, catalog.fetchNextPage]) // eslint-disable-line react-hooks/exhaustive-deps
  const actions = useTemplateActions({ token, scopeKey, categories: result?.categories ?? [], onUse, onEditContent })
  // Keep the open viewer in sync after an edit/publish (fresh revision and flags).
  useEffect(() => {
    if (!preview) return
    const fresh = result?.data.find(item => item.id === preview.id)
    if (fresh && fresh.revision !== preview.revision) setPreview(fresh)
    if (!fresh && preview.scope !== 'runly' && catalog.isSuccess && !catalog.isFetching) setPreview(null)
  }, [result]) // eslint-disable-line react-hooks/exhaustive-deps
  const empty = result && !result.data.length
  const filtered = Boolean(q) || category !== 'all'
  return <div className="space-y-4">
    {limit ? null : <>
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <SearchInput value={search} onChange={event => setSearch(event.target.value)} onClear={() => setSearch('')} placeholder="Buscar plantillas" aria-label="Buscar plantillas" maxLength={80} className="lg:max-w-sm lg:flex-1" />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:ml-auto lg:flex">
          <Select value={scope} onValueChange={value => { setScope(value); setCategory('all') }}>
            <SelectTrigger aria-label="Origen de las plantillas" className="min-w-0 lg:w-52"><SelectValue /></SelectTrigger>
            <SelectContent>{SCOPES.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger aria-label="Categoría de las plantillas" className="min-w-0 lg:w-52"><SelectValue /></SelectTrigger>
            <SelectContent>{['all', ...(result?.categories ?? [])].map(value => <SelectItem key={value} value={value}>{value === 'all' ? 'Todas las categorías' : value}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
    </>}
    {catalog.isPending ? <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6" aria-label="Cargando plantillas" aria-busy="true">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="aspect-[4/5]" />)}</div> : null}
    {catalog.error ? <ErrorState title="No se pudieron cargar las plantillas" description={catalog.error.message} onRetry={catalog.refetch} /> : null}
    {empty ? (filtered || !EMPTY[scope]
      ? <EmptyState icon={SearchX} title="Sin plantillas con estos filtros" description="Prueba otra búsqueda o categoría." />
      : <EmptyState icon={LayoutTemplate} title={EMPTY[scope].title} description={EMPTY[scope].description} />) : null}
    <ul className={limit ? '-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0 xl:grid-cols-6' : 'grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-6'}
      aria-busy={catalog.isFetching}>
      {result?.data.map(template => {
        const items = limit ? [] : actions.items(template)
        return (
          <li key={template.id ?? template.key} className={cn('group/card relative', limit && 'w-[42%] shrink-0 snap-start sm:w-auto')}>
            <button type="button" onClick={() => setPreview(template)} aria-label={`Ver plantilla ${template.name}`} className="group w-full rounded-2xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]">
              <div className="relative flex aspect-[4/5] items-center justify-center overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.5)] p-4 transition-colors group-hover:border-fuchsia-500/40">
                <ScopeMark template={template} />
                <StudioTemplateThumbnail templateId={template.id} document={template.preview ?? template.document} frameRatio={4 / 5} />
              </div>
              <p className="mt-2 truncate pr-8 text-sm font-semibold">{template.name}</p>
              <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">{template.category}{template.scope === 'runly' ? '' : ` · ${sizeLabel(template)}`}</p>
              <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">{metaLine(template)}</p>
            </button>
            {items.length ? (
              <div className="absolute right-0 top-[calc(100%-3.6rem)] opacity-0 transition-opacity focus-within:opacity-100 group-hover/card:opacity-100 [@media(hover:none)]:opacity-100">
                <ActionMenu label={`Opciones de ${template.name}`} items={[actions.useItem(template), ...items].filter(Boolean)} />
              </div>
            ) : null}
          </li>
        )
      })}
    </ul>
    {hasMore ? <div ref={sentinel} className="flex justify-center py-2">
      <Button type="button" variant="outline" disabled={catalog.isFetchingNextPage} onClick={() => catalog.fetchNextPage()}>{catalog.isFetchingNextPage ? 'Cargando...' : 'Cargar más plantillas'}</Button>
    </div> : null}
    <TemplatePreviewDialog templates={result?.data ?? []} template={preview} onChange={setPreview} onUse={onUse} creating={creating} actions={preview ? actions.items(preview) : []} />
    {actions.dialogs}
  </div>
}
