import { useRef, useState } from 'react'
import { Star } from 'lucide-react'
import { cn } from '../lib/utils.js'

// Five-star rating. Without `onChange` it is a display (fractional values
// render a partially filled star). With `onChange` it is a keyboard-accessible
// input: a radiogroup where arrows/Home/End move the value and hover previews.
const SIZES = { xs: 'h-3 w-3', sm: 'h-3.5 w-3.5', md: 'h-5 w-5', lg: 'h-7 w-7' }
const FILLED = 'fill-amber-400 text-amber-400'
const EMPTY = 'text-[hsl(var(--muted-foreground))]/40'

const formatValue = (value) => (Number.isInteger(value) ? String(value) : value.toFixed(1))

function StarGlyph({ fill, sizeClass }) {
  return (
    <span className={cn('relative inline-flex shrink-0', sizeClass)} aria-hidden="true">
      <Star className={cn(sizeClass, EMPTY)} />
      {fill > 0 ? (
        <span className="absolute inset-0 overflow-hidden" style={{ width: `${Math.round(fill * 100)}%` }}>
          <Star className={cn(sizeClass, FILLED)} />
        </span>
      ) : null}
    </span>
  )
}

export function StarRating({
  value = 0,
  onChange,
  max = 5,
  size = 'sm',
  disabled = false,
  label = 'Calificación',
  className,
  ...rest
}) {
  const [hover, setHover] = useState(null)
  const refs = useRef([])
  const sizeClass = SIZES[size] ?? SIZES.sm
  const current = Math.max(0, Math.min(max, Number(value) || 0))
  const stars = Array.from({ length: max }, (_, index) => index + 1)

  if (!onChange) {
    return (
      <span role="img" aria-label={`${label}: ${formatValue(current)} de ${max}`} className={cn('inline-flex items-center gap-0.5', className)} {...rest}>
        {stars.map((star) => <StarGlyph key={star} sizeClass={sizeClass} fill={Math.max(0, Math.min(1, current - (star - 1)))} />)}
      </span>
    )
  }

  const shown = hover ?? Math.round(current)
  const focusIndex = Math.max(0, Math.round(current) - 1)

  function select(star) {
    if (disabled) return
    onChange(star)
    refs.current[star - 1]?.focus()
  }

  function onKeyDown(event) {
    const base = Math.round(current) || 0
    let next = null
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = Math.min(max, base + 1)
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = Math.max(1, base - 1)
    else if (event.key === 'Home') next = 1
    else if (event.key === 'End') next = max
    if (next === null) return
    event.preventDefault()
    select(next)
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || undefined}
      className={cn('inline-flex items-center gap-0.5', disabled && 'opacity-50', className)}
      onMouseLeave={() => setHover(null)}
      onKeyDown={onKeyDown}
      {...rest}
    >
      {stars.map((star) => (
        <button
          key={star}
          ref={(node) => { refs.current[star - 1] = node }}
          type="button"
          role="radio"
          aria-checked={Math.round(current) === star}
          aria-label={star === 1 ? '1 estrella' : `${star} estrellas`}
          tabIndex={star - 1 === focusIndex ? 0 : -1}
          disabled={disabled}
          onClick={() => select(star)}
          onMouseEnter={() => !disabled && setHover(star)}
          className="rounded-md p-0.5 outline-none transition-transform focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] enabled:hover:scale-110 motion-reduce:transition-none disabled:cursor-not-allowed"
        >
          <StarGlyph sizeClass={sizeClass} fill={star <= shown ? 1 : 0} />
        </button>
      ))}
    </div>
  )
}
