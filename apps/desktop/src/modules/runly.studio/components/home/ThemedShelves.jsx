import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Sparkles } from 'lucide-react'
import { runly } from '../../../../lib/runly.js'
import { shelvesFor } from '../../lib/curated-shelves.js'
import { StudioTemplateThumbnail } from '../StudioTemplateThumbnail.jsx'
import { MarketplaceCard, useMarketplaceTemplates } from '../market/MarketplaceCards.jsx'
import { TemplatePreviewDialog } from './TemplatePreviewDialog.jsx'
import { sizeLabel } from '../../lib/formats.js'

// Every installed template (a few pages of the catalog), so shelves can pick from the whole set.
function useTemplatePool({ token, scopeKey }) {
  return useQuery({ queryKey: ['studio', ...scopeKey, 'templates', 'pool'], enabled: Boolean(token), staleTime: 60_000, retry: false,
    queryFn: async ({ signal }) => {
      const rows = []
      for (let page = 1; page <= 5; page += 1) {
        const result = (await runly.studio.templates(token, { scope: 'all', q: '', category: 'all', page, order: 'recent' }, signal)).data
        rows.push(...result.data)
        if (page >= result.pagination.totalPages) break
      }
      return rows
    } })
}

function TemplateShelfCard({ template, onOpen }) {
  return (
    <button type="button" onClick={() => onOpen(template)} aria-label={`Ver plantilla ${template.name}`} className="group w-full rounded-2xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]">
      <div className="relative flex aspect-[4/5] items-center justify-center overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.5)] p-4 transition-colors group-hover:border-fuchsia-500/40">
        <StudioTemplateThumbnail templateId={template.id} document={template.preview ?? template.document} frameRatio={4 / 5} />
      </div>
      <p className="mt-2 truncate text-sm font-semibold">{template.name}</p>
      <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">{template.category}{template.scope === 'runly' ? '' : ` · ${sizeLabel(template)}`}</p>
    </button>
  )
}

// Themed rows on Inicio: what is coming up in the calendar first, then evergreen occasions. Installed
// templates and Marketplace ones share the same shelf; the Marketplace ones import directly.
export function ThemedShelves({ token, scopeKey, creating, onUse, onImportDirect }) {
  const pool = useTemplatePool({ token, scopeKey }), market = useMarketplaceTemplates(token), [preview, setPreview] = useState(null)
  const shelves = useMemo(() => {
    const entries = [
      ...market.items.map(item => ({ key: `m:${item.releaseId}`, text: `${item.title} ${item.description ?? ''}`, market: item })),
      ...(pool.data ?? []).map(template => ({ key: `t:${template.id ?? template.key}`, text: `${template.name} ${template.category} ${template.description ?? ''}`, template })),
    ]
    return shelvesFor(entries)
  }, [pool.data, market.items])
  if (!shelves.length) return null
  return (
    <>
      {shelves.map(shelf => (
        <section key={shelf.id} aria-labelledby={`studio-shelf-${shelf.id}`}>
          <div className="mb-4 min-w-0">
            <h2 id={`studio-shelf-${shelf.id}`} className="flex items-center gap-2 text-lg font-semibold tracking-tight sm:text-xl">{shelf.seasonal ? <Sparkles className="h-4 w-4 text-fuchsia-600 dark:text-fuchsia-300" aria-hidden /> : null}{shelf.title}</h2>
            <p className="mt-0.5 text-sm text-[hsl(var(--muted-foreground))]">{shelf.subtitle}</p>
          </div>
          <ul className="-mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:px-0">
            {shelf.entries.map(entry => (
              <li key={entry.key} className="w-40 shrink-0 snap-start sm:w-44">
                {entry.market ? <MarketplaceCard item={entry.market} token={token} onUse={onImportDirect} /> : <TemplateShelfCard template={entry.template} onOpen={setPreview} />}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <TemplatePreviewDialog templates={pool.data ?? []} template={preview} onChange={setPreview} onUse={onUse} creating={creating} actions={[]} />
    </>
  )
}
