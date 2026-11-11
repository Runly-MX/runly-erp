import { Heart } from 'lucide-react'
import { cn } from '@runly/ui'
import { useCollections } from './CollectionsProvider.jsx'

// Heart overlay for a card. Sits above the card-wide button (z-10) and is always visible once marked.
export function FavoriteButton({ item, name, className }) {
  const api = useCollections()
  if (!api) return null
  const on = api.isFavorite(item)
  return (
    <button type="button" aria-pressed={on} aria-label={on ? `Quitar «${name}» de favoritos` : `Marcar «${name}» como favorito`} onClick={event => { event.stopPropagation(); api.toggleFavorite(item) }}
      className={cn('pointer-events-auto absolute z-10 flex h-9 w-9 items-center justify-center rounded-full bg-[hsl(var(--card)/0.92)] shadow-sm backdrop-blur transition-opacity focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]',
        on ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-hover/card:opacity-100 [@media(hover:none)]:opacity-100', className)}>
      <Heart className={cn('h-[18px] w-[18px]', on ? 'fill-rose-500 text-rose-500' : 'text-[hsl(var(--foreground))]')} aria-hidden />
    </button>
  )
}
