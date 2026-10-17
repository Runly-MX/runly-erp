import { StarRating, cn } from '@runly/ui'
import { formatRating, reviewCountLabel } from '../../lib/lmsLabels.js'

// "4.5 ★★★★½ (12)". With `onClick` it is a button that opens the reviews.
// Renders nothing when the course has no reviews and `showEmpty` is off.
export function CourseRating({ avg, count, onClick, showEmpty = false, size = 'xs', className }) {
  const total = Number(count) || 0
  if (!total && !showEmpty) return null
  const content = total ? (
    <>
      <span className="font-semibold tabular-nums text-amber-700 dark:text-amber-300">{formatRating(avg)}</span>
      <StarRating value={Number(avg) || 0} size={size} />
      <span className="text-[hsl(var(--muted-foreground))] tabular-nums">({total})</span>
    </>
  ) : <span className="text-[hsl(var(--muted-foreground))]">Sin reseñas</span>
  const base = 'inline-flex items-center gap-1 text-xs'
  if (!onClick) return <span className={cn(base, className)}>{content}</span>
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={total ? `Calificación ${formatRating(avg)} de 5, ${reviewCountLabel(total)}. Ver reseñas` : 'Ver reseñas'}
      className={cn(base, 'rounded-md px-1.5 py-1 outline-none transition-colors hover:bg-[hsl(var(--muted))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]', className)}
    >
      {content}
    </button>
  )
}
