import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@runly/ui'
import { ROOT } from '../../lib/purchases-constants.js'
import { bandColumns } from '../../lib/band-columns.js'

// Measures the row and balances its columns (bandColumns), so the cards
// always fill whole rows whatever the number a role or flow shows.
function useBalancedColumns(n, minCell) {
  const ref = useRef(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const node = ref.current
    if (!node) return undefined
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  return [ref, width ? bandColumns(n, width, minCell) : Math.min(n, 2)]
}

function KpiCard({ item, span }) {
  const Icon = item.icon
  const tone = item.alert ? '#e11d48' : item.tone ?? 'var(--brand-primary)'
  const body = (
    <>
      {Icon ? (
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: `color-mix(in oklab, ${tone} 14%, transparent)`, color: tone }}>
          <Icon className="h-5 w-5" aria-hidden />
        </span>
      ) : null}
      <span className="min-w-0">
        <span className={cn('block text-2xl font-semibold tabular-nums leading-tight',
          item.alert ? 'text-rose-700 dark:text-rose-300' : item.muted ? 'text-[hsl(var(--muted-foreground))]' : 'text-[hsl(var(--foreground))]')}>
          {item.value}
        </span>
        <span className="mt-0.5 block text-sm text-[hsl(var(--muted-foreground))]">{item.label}</span>
        {item.hint ? <span className="block text-xs text-[hsl(var(--muted-foreground))]">{item.hint}</span> : null}
      </span>
    </>
  )
  const cls = 'flex h-full items-center gap-4 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-5 py-4'
  return (
    <li className="min-w-0" style={span > 1 ? { gridColumn: `span ${span} / span ${span}` } : undefined}>
      {item.to ? (
        <Link to={`${ROOT}/${item.to}`} className={cn(cls, 'transition-colors hover:border-(--brand-primary)/40 hover:bg-[hsl(var(--muted))]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand-primary)/60')}>
          {body}
        </Link>
      ) : <div className={cls}>{body}</div>}
    </li>
  )
}

// Inicio's top row: one card per figure, icon on a tinted disc, value and
// label. The last card takes any leftover slots so the row has no holes.
// items: [{ key, label, value, icon?, tone?, to?, hint?, alert?, muted? }]
export function KpiCards({ items, label = 'Resumen' }) {
  const n = items.length
  const [ref, cols] = useBalancedColumns(n, 210)
  if (!n) return null
  const empty = (cols - (n % cols)) % cols
  return (
    <ul ref={ref} aria-label={label} className="grid gap-4" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {items.map((item, index) => <KpiCard key={item.key} item={item} span={index === n - 1 ? empty + 1 : 1} />)}
    </ul>
  )
}
