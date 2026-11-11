import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BadgeCheck, Store } from 'lucide-react'
import { Skeleton, cn } from '@runly/ui'
import { runly } from '../../../../lib/runly.js'
import { publisherLabel, releaseRef, resourceBlock } from '../../../../lib/marketplace-import.js'
import { StudioThumbnail } from '../StudioThumbnail.jsx'
import { previewDocument } from '../../lib/studio-import.js'

const newestFirst = (a, b) => String(b.publishedAt ?? '').localeCompare(String(a.publishedAt ?? ''))

// Verified Marketplace templates, newest first. Same query key as the import picker: fetched once.
export function useMarketplaceTemplates(token, acknowledged = false) {
  const query = useQuery({ queryKey: ['marketplace-resources', 'studio_template', acknowledged, token], enabled: Boolean(token), retry: false, staleTime: 30_000,
    queryFn: async () => (await runly.studio.marketplaceTemplates({ acknowledgeStale: acknowledged ? 'true' : undefined }, token))?.data })
  const items = (query.data?.items ?? []).filter(item => !resourceBlock(item)).sort(newestFirst)
  return { query, items }
}

// True once the node has been near the viewport: previews download a package, so off-screen cards wait.
function useSeen() {
  const ref = useRef(null), [seen, setSeen] = useState(false)
  useEffect(() => {
    const node = ref.current
    if (!node || seen) return undefined
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setSeen(true); observer.disconnect() } }, { rootMargin: '300px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [seen])
  return [ref, seen]
}

function Preview({ item, token, enabled, frameRatio }) {
  const preview = useQuery({ queryKey: ['studio', 'marketplace-preview', item.releaseId], enabled: Boolean(token && enabled), staleTime: 10 * 60_000, gcTime: 10 * 60_000, retry: false,
    queryFn: async ({ signal }) => (await runly.studio.marketplaceTemplatePreview(releaseRef(item), token, signal))?.data })
  if (!enabled || preview.isLoading) return <Skeleton className="absolute inset-4 rounded-md" />
  const data = preview.data, document = previewDocument(data?.document)
  if (data?.png) return <img src={data.png} alt="" className="max-h-full max-w-full rounded-sm object-contain shadow-sm" />
  if (document) return <StudioThumbnail document={document} images={data.images} frameRatio={frameRatio} />
  return <Store className="h-8 w-8 text-[hsl(var(--muted-foreground))]" aria-hidden />
}

// A template card like the installed ones: real preview, name and publisher. Click = use it.
export function MarketplaceCard({ item, token, onUse, className }) {
  const [ref, seen] = useSeen()
  return (
    <button ref={ref} type="button" onClick={() => onUse(item)} aria-label={`Usar ${item.title}`}
      className={cn('group w-full rounded-2xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]', className)}>
      <div className="relative flex aspect-[4/5] items-center justify-center overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.5)] p-4 transition-colors group-hover:border-fuchsia-500/40">
        {item.official === true ? <span className="absolute left-2 top-2 z-10 inline-flex items-center gap-1 rounded-full bg-[hsl(var(--card)/0.92)] px-2 py-0.5 text-[11px] font-medium shadow-sm backdrop-blur"><BadgeCheck className="h-3 w-3" aria-hidden />Oficial Runly</span> : null}
        <Preview item={item} token={token} enabled={seen} frameRatio={4 / 5} />
      </div>
      <p className="mt-2 truncate text-sm font-semibold">{item.title}</p>
      <p className="flex items-center gap-1 truncate text-xs text-[hsl(var(--muted-foreground))]">{publisherLabel(item)}{item.publisher?.verified ? <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-label="Publicador verificado" /> : null}</p>
    </button>
  )
}
