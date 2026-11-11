import { Button, Skeleton } from '@runly/ui'
import { MarketplaceCard, useMarketplaceTemplates } from '../market/MarketplaceCards.jsx'

// Discovery strip of verified Marketplace templates, with real previews. Hidden when the catalog is not
// configured or empty: Inicio never shows an error for it. Choosing one imports it directly.
export function MarketplaceRow({ token, onUse, onSeeAll }) {
  const { query, items: all } = useMarketplaceTemplates(token), items = all.slice(0, 10)
  if (query.isError || (!query.isLoading && !items.length)) return null
  return (
    <section aria-labelledby="studio-market-title">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id="studio-market-title" className="text-lg font-semibold tracking-tight sm:text-xl">Explora el Marketplace</h2>
          <p className="mt-0.5 text-sm text-[hsl(var(--muted-foreground))]">Plantillas verificadas de Runly y la comunidad. Al elegir una se crea tu copia y se abre para editar.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => onSeeAll()} className="shrink-0 text-fuchsia-700 hover:text-fuchsia-800 dark:text-fuchsia-300">Ver todas</Button>
      </div>
      <ul className="-mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:px-0">
        {query.isLoading ? [0, 1, 2, 3, 4, 5].map(i => <li key={i} className="w-40 shrink-0 sm:w-44"><Skeleton className="aspect-[4/5] rounded-2xl" /></li>)
          : items.map(item => <li key={item.releaseId} className="w-40 shrink-0 snap-start sm:w-44"><MarketplaceCard item={item} token={token} onUse={onUse} /></li>)}
      </ul>
    </section>
  )
}
