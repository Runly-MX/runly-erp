import { cn } from '@runly/ui'
import { ImageOff } from 'lucide-react'
import { matchContext } from '../lib/label-search.js'

// Pieces shared by the inventory asset searches (Etiquetas picker, Escanear
// suggestions): both use GET /inventory/items?search= (inventory-search-service).

export function AssetThumb({ url, className }) {
  return (
    <span className={cn('flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-md bg-[hsl(var(--muted))]', className)}>
      {url ? <img src={url} alt="" loading="lazy" className="size-full object-cover" />
        : <ImageOff className="size-4 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />}
    </span>
  )
}

// "Coincide en Serie: ..." when the match is not in the name or folio already shown.
export function AssetMatchContext({ item, search }) {
  const context = search ? matchContext(item, search) : null
  if (!context) return null
  return (
    <span className="mt-0.5 block truncate text-xs text-[hsl(var(--muted-foreground))]">
      Coincide en {context.label}: <mark className="rounded-sm bg-amber-200/60 px-0.5 text-inherit dark:bg-amber-400/25">{context.value}</mark>
    </span>
  )
}
