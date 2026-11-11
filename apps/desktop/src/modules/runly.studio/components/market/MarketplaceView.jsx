import { useMemo, useState } from 'react'
import { CheckboxField, EmptyState, SearchInput, Skeleton, cn, matchesSearch } from '@runly/ui'
import { PackageSearch, SearchX } from 'lucide-react'
import { catalogState, marketplaceError, publisherLabel } from '../../../../lib/marketplace-import.js'
import { MarketplaceState } from '../../../../components/marketplace/MarketplaceResourcePicker.jsx'
import { matchesShelf, shelfChips, shelvesFor } from '../../lib/curated-shelves.js'
import { MarketplaceCard, useMarketplaceTemplates } from './MarketplaceCards.jsx'

const GRID = 'grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-6'
const textOf = item => `${item.title} ${publisherLabel(item)} ${item.description ?? ''}`

function Chip({ active, onClick, children }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick}
      className={cn('inline-flex h-9 shrink-0 items-center rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]',
        active ? 'border-fuchsia-500 bg-fuchsia-500/12 text-fuchsia-700 dark:text-fuchsia-300' : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted)/0.6)] hover:text-[hsl(var(--foreground))]')}>
      {children}
    </button>
  )
}

function Row({ title, subtitle, items, token, onUse, id }) {
  return (
    <section aria-labelledby={id}>
      <div className="mb-3"><h2 id={id} className="text-lg font-semibold tracking-tight">{title}</h2>{subtitle ? <p className="mt-0.5 text-sm text-[hsl(var(--muted-foreground))]">{subtitle}</p> : null}</div>
      <ul className="-mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:px-0">
        {items.map(item => <li key={item.releaseId} className="w-40 shrink-0 snap-start sm:w-44"><MarketplaceCard item={item} token={token} onUse={onUse} /></li>)}
      </ul>
    </section>
  )
}

// The Marketplace tab: search, filters (official, by occasion) and, with no filter, sections by theme.
// `onUse(item, acknowledged)` opens the import dialog. `acknowledged` = consent to a catalog copy older than a day.
export function MarketplaceView({ token, onUse }) {
  const [search, setSearch] = useState(''), [chip, setChip] = useState('all'), [acknowledged, setAcknowledged] = useState(false)
  const { query, items } = useMarketplaceTemplates(token, acknowledged)
  const catalog = catalogState(query.data?.catalog), use = item => onUse(item, acknowledged)
  const chips = useMemo(() => shelfChips().filter(row => items.some(item => matchesShelf(row.id, textOf(item)))), [items])
  const filtering = Boolean(search.trim()) || chip !== 'all'
  const visible = items.filter(item => (!search.trim() || matchesSearch(textOf(item), search)) && (chip === 'all' || (chip === 'official' ? item.official === true : matchesShelf(chip, textOf(item)))))
  const sections = useMemo(() => {
    if (filtering) return null
    const shelves = shelvesFor(items.map(item => ({ key: item.releaseId, text: textOf(item), item })), { minItems: 1, maxShelves: 8, perShelf: 14 })
    const used = new Set(shelves.flatMap(shelf => shelf.entries.map(entry => entry.key)))
    return { shelves, rest: items.filter(item => !used.has(item.releaseId)) }
  }, [items, filtering])
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <SearchInput value={search} onChange={event => setSearch(event.target.value)} onClear={() => setSearch('')} placeholder="Buscar plantillas del Marketplace" aria-label="Buscar plantillas del Marketplace" maxLength={80} className="lg:max-w-md" />
        {items.length ? (
          <div role="group" aria-label="Filtrar por" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0">
            <Chip active={chip === 'all'} onClick={() => setChip('all')}>Todo</Chip>
            {items.some(item => item.official === true) ? <Chip active={chip === 'official'} onClick={() => setChip('official')}>Oficial de Runly</Chip> : null}
            {chips.map(row => <Chip key={row.id} active={chip === row.id} onClick={() => setChip(row.id)}>{row.title}</Chip>)}
          </div>
        ) : null}
      </div>
      {query.isError ? <MarketplaceState state={marketplaceError(query.error)} onRetry={() => query.refetch()} /> : null}
      {catalog.blocking ? <MarketplaceState state={catalog} onRetry={() => query.refetch()} /> : null}
      {catalog.stale ? <MarketplaceState state={catalog}><CheckboxField label="Continuar con la copia actual del catálogo" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} /></MarketplaceState> : null}
      {query.isLoading ? <div className={GRID} aria-busy="true">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="aspect-[4/5]" />)}</div> : null}
      {query.isSuccess && !items.length && !catalog.blocking && !catalog.stale ? <EmptyState icon={PackageSearch} title="El catálogo está vacío" description="El Marketplace verificado no tiene plantillas disponibles por ahora." /> : null}
      {filtering && items.length ? (visible.length
        ? <section aria-label="Resultados"><p className="mb-3 text-sm text-[hsl(var(--muted-foreground))]">{visible.length} {visible.length === 1 ? 'plantilla' : 'plantillas'}</p><ul className={GRID}>{visible.map(item => <li key={item.releaseId}><MarketplaceCard item={item} token={token} onUse={use} /></li>)}</ul></section>
        : <EmptyState icon={SearchX} title="Sin resultados" description="Prueba con otra búsqueda o quita el filtro." />) : null}
      {sections && items.length ? (
        <>
          <Row id="mk-new" title="Lo más nuevo" subtitle="Publicadas recientemente." items={items.slice(0, 8)} token={token} onUse={use} />
          {sections.shelves.map(shelf => <Row key={shelf.id} id={`mk-${shelf.id}`} title={shelf.title} subtitle={shelf.subtitle} items={shelf.entries.map(entry => entry.item)} token={token} onUse={use} />)}
          {sections.rest.length ? <section aria-labelledby="mk-rest"><h2 id="mk-rest" className="mb-3 text-lg font-semibold tracking-tight">{sections.shelves.length ? 'Más plantillas' : 'Todas las plantillas'}</h2><ul className={GRID}>{sections.rest.map(item => <li key={item.releaseId}><MarketplaceCard item={item} token={token} onUse={use} /></li>)}</ul></section> : null}
        </>
      ) : null}
    </div>
  )
}
