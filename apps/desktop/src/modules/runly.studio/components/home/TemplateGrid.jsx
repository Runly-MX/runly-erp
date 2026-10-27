import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ActionMenu, Button, EmptyState, ErrorState, PageFooter, SearchInput, SegmentedControl, Skeleton, cn } from '@runly/ui'
import { Building2, LayoutTemplate, SearchX, Sparkles, User } from 'lucide-react'
import { runly } from '../../../../lib/runly.js'
import { StudioTemplateThumbnail } from '../StudioTemplateThumbnail.jsx'
import { editedAgo, sizeLabel } from '../../lib/formats.js'
import { TemplatePreviewDialog } from './TemplatePreviewDialog.jsx'
import { useTemplateActions } from '../templates/useTemplateActions.jsx'

// Short labels on phones so the four filters fit in one row.
const label = (short, full) => <><span className="sm:hidden">{short}</span><span className="max-sm:hidden">{full}</span></>
const SCOPES = [{ value: 'all', label: 'Todas' }, { value: 'runly', label: label('Runly', 'De Runly') }, { value: 'personal', label: label('Mías', 'Mis plantillas') }, { value: 'company', label: label('Empresa', 'De mi empresa') }]
const EMPTY = {
  personal: { title: 'Aún no tienes plantillas', description: 'Abre un diseño y usa «Guardar como plantilla» para reutilizarlo cuando quieras.' },
  company: { title: 'Tu empresa aún no comparte plantillas', description: 'Quien tenga permiso de publicación puede compartir una plantilla con todo el equipo.' },
}

// Small, neutral marks: where the template comes from (Runly has none).
function ScopeMark({ template }) {
  const marks = [
    template.scope === 'company' ? { icon: Building2, label: 'Empresa' } : null,
    template.scope === 'personal' ? { icon: User, label: 'Mía' } : null,
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
  const [page, setPage] = useState(1), [preview, setPreview] = useState(null)
  useEffect(() => { const timer = setTimeout(() => { setQ(search); setPage(1) }, 300); return () => clearTimeout(timer) }, [search])
  const catalog = useQuery({ queryKey: ['studio', ...scopeKey, 'templates', scope, q, category, page], gcTime: 60000, staleTime: 60000,
    queryFn: async ({ signal }) => (await runly.studio.templates(token, { scope, q, category, page }, signal)).data, enabled: Boolean(token), retry: false })
  const result = catalog.data && limit ? { ...catalog.data, data: catalog.data.data.slice(0, limit), pagination: { ...catalog.data.pagination, totalPages: 1 } } : catalog.data
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
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchInput value={search} onChange={event => setSearch(event.target.value)} onClear={() => setSearch('')} placeholder="Buscar plantillas" aria-label="Buscar plantillas" maxLength={80} className="lg:max-w-sm lg:flex-1" />
        <SegmentedControl ariaLabel="Origen de las plantillas" options={SCOPES} value={scope} onChange={value => { setScope(value); setCategory('all'); setPage(1) }}
          className="w-full flex-nowrap lg:ml-auto lg:w-auto [&_button]:min-w-0 [&_button]:px-2 [&_button]:max-sm:text-xs lg:[&_button]:px-3.5" />
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]" role="group" aria-label="Categorías de plantillas">
        {['all', ...(result?.categories ?? [])].map(value => <Button key={value} size="sm" variant={category === value ? 'secondary' : 'ghost'} aria-pressed={category === value}
          className="shrink-0" onClick={() => { setCategory(value); setPage(1) }}>{value === 'all' ? 'Todas las categorías' : value}</Button>)}
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
    {!limit && result?.pagination.totalPages > 1 ? <PageFooter total={result.pagination.total} pageIndex={page - 1} pageCount={result.pagination.totalPages} pageSize={result.pagination.pageSize}
      canPrevious={page > 1} canNext={page < result.pagination.totalPages} onPrevious={() => setPage(value => value - 1)} onNext={() => setPage(value => value + 1)} onPageChange={index => setPage(index + 1)} /> : null}
    <TemplatePreviewDialog templates={result?.data ?? []} template={preview} onChange={setPreview} onUse={onUse} creating={creating} actions={preview ? actions.items(preview) : []} />
    {actions.dialogs}
  </div>
}
