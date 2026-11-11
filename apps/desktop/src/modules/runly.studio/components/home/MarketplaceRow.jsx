import { useQuery } from '@tanstack/react-query'
import { BadgeCheck, Store } from 'lucide-react'
import { Badge, Button, Skeleton } from '@runly/ui'
import { runly } from '../../../../lib/runly.js'
import { publisherLabel, resourceBlock } from '../../../../lib/marketplace-import.js'

// Discovery strip of verified Marketplace templates. Same query key as the import picker, so the
// list is fetched once. Hidden when the catalog is not configured or empty: Inicio never shows an error for it.
export function MarketplaceRow({ token, onUse, onSeeAll }) {
  const query = useQuery({ queryKey: ['marketplace-resources', 'studio_template', false, token], enabled: Boolean(token), retry: false, staleTime: 30_000,
    queryFn: async () => (await runly.studio.marketplaceTemplates({}, token))?.data })
  const items = (query.data?.items ?? []).filter(item => !resourceBlock(item)).slice(0, 8)
  if (query.isError || (!query.isLoading && !items.length)) return null
  return (
    <section aria-labelledby="studio-market-title">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id="studio-market-title" className="text-lg font-semibold tracking-tight sm:text-xl">Explora el Marketplace</h2>
          <p className="mt-0.5 text-sm text-[hsl(var(--muted-foreground))]">Plantillas verificadas de Runly y la comunidad. Se importan como una copia tuya.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => onSeeAll()} className="shrink-0 text-fuchsia-700 hover:text-fuchsia-800 dark:text-fuchsia-300">Ver todas</Button>
      </div>
      <ul className="-mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:px-0">
        {query.isLoading ? [0, 1, 2, 3].map(i => <li key={i} className="w-56 shrink-0"><Skeleton className="h-40 rounded-2xl" /></li>) : items.map(item => (
          <li key={item.releaseId} className="w-56 shrink-0 snap-start">
            <button type="button" onClick={() => onUse(item)} aria-label={`Usar ${item.title}`} className="group flex h-full w-full flex-col overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-left transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] motion-reduce:transition-none motion-reduce:hover:transform-none">
              <span className="relative flex h-24 items-center justify-center bg-gradient-to-br from-fuchsia-500/15 via-violet-500/10 to-sky-500/15 text-fuchsia-700 dark:text-fuchsia-300">
                <Store className="h-8 w-8" aria-hidden />
                {item.official === true ? <Badge variant="outline" className="absolute left-2 top-2 bg-[hsl(var(--card)/0.92)]"><BadgeCheck className="mr-1 h-3.5 w-3.5" aria-hidden />Oficial Runly</Badge> : null}
              </span>
              <span className="flex flex-1 flex-col gap-0.5 p-3">
                <span className="truncate text-sm font-semibold">{item.title}</span>
                <span className="flex items-center gap-1 truncate text-xs text-[hsl(var(--muted-foreground))]">{publisherLabel(item)}{item.publisher?.verified ? <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-label="Publicador verificado" /> : null}<span aria-hidden>·</span><span className="tabular-nums">v{item.version}</span></span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
