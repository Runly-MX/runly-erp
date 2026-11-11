import { useState } from 'react'
import { CheckboxField, EmptyState, SearchInput, Skeleton, matchesSearch } from '@runly/ui'
import { PackageSearch, SearchX } from 'lucide-react'
import { catalogState, marketplaceError, publisherLabel } from '../../../../lib/marketplace-import.js'
import { MarketplaceState } from '../../../../components/marketplace/MarketplaceResourcePicker.jsx'
import { MarketplaceCard, useMarketplaceTemplates } from './MarketplaceCards.jsx'

// Full catalog of verified external templates, searchable, with real previews. Choosing one imports it
// directly: `onUse(item, acknowledged)`. `acknowledged` is the explicit consent to use a catalog copy older than a day.
export function MarketplaceCatalog({ token, onUse, columns = 'grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-6' }) {
  const [search, setSearch] = useState(''), [acknowledged, setAcknowledged] = useState(false)
  const { query, items } = useMarketplaceTemplates(token, acknowledged)
  const catalog = catalogState(query.data?.catalog)
  const visible = items.filter(item => !search.trim() || matchesSearch(`${item.title} ${publisherLabel(item)} ${item.description ?? ''}`, search))
  return (
    <div className="space-y-4">
      <SearchInput value={search} onChange={event => setSearch(event.target.value)} onClear={() => setSearch('')} placeholder="Buscar en el catálogo del Marketplace" aria-label="Buscar en el catálogo del Marketplace" maxLength={80} className="lg:max-w-sm" />
      {query.isError ? <MarketplaceState state={marketplaceError(query.error)} onRetry={() => query.refetch()} /> : null}
      {catalog.blocking ? <MarketplaceState state={catalog} onRetry={() => query.refetch()} /> : null}
      {catalog.stale ? <MarketplaceState state={catalog}><CheckboxField label="Continuar con la copia actual del catálogo" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} /></MarketplaceState> : null}
      {query.isLoading ? <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-6" aria-busy="true">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="aspect-[4/5]" />)}</div> : null}
      {query.isSuccess && !items.length && !catalog.blocking && !catalog.stale ? <EmptyState icon={PackageSearch} title="El catálogo está vacío" description="El Marketplace verificado no tiene plantillas disponibles por ahora." /> : null}
      {items.length && !visible.length ? <EmptyState icon={SearchX} title="Sin resultados" description="Ninguna plantilla del catálogo coincide con la búsqueda." /> : null}
      <ul className={`grid ${columns}`}>
        {visible.map(item => <li key={item.releaseId}><MarketplaceCard item={item} token={token} onUse={chosen => onUse(chosen, acknowledged)} /></li>)}
      </ul>
    </div>
  )
}
