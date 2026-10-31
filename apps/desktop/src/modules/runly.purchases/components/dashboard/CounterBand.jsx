import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@runly/ui'
import { ROOT } from '../../lib/purchases-constants.js'
import { bandColumns } from '../../lib/band-columns.js'

function Cell({ item, span = 1 }) {
  const body = (
    <>
      <span className={cn('block text-2xl font-semibold tabular-nums leading-tight',
        item.alert ? 'text-rose-700 dark:text-rose-300' : item.muted ? 'text-[hsl(var(--muted-foreground))]' : 'text-[hsl(var(--foreground))]')}>
        {item.value}
      </span>
      <span className="mt-1 block text-sm text-[hsl(var(--muted-foreground))]">{item.label}</span>
      {item.hint ? <span className="block text-xs text-[hsl(var(--muted-foreground))]">{item.hint}</span> : null}
    </>
  )
  const cls = 'block h-full bg-[hsl(var(--card))] px-4 py-3.5'
  return (
    <li className="min-w-0" style={span > 1 ? { gridColumn: `span ${span} / span ${span}` } : undefined}>
      {item.to ? (
        <Link to={`${ROOT}/${item.to}`} className={cn(cls, 'transition-colors hover:bg-[hsl(var(--muted))]/50 focus-visible:relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--brand-primary)/60')}>
          {body}
        </Link>
      ) : <div className={cls}>{body}</div>}
    </li>
  )
}

function CellRow({ group }) {
  const ref = useRef(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const node = ref.current
    if (!node) return undefined
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  const n = group.items.length
  const cols = width ? bandColumns(n, width) : Math.min(n, 2)
  const empty = (cols - (n % cols)) % cols
  return (
    <ul ref={ref} className="grid flex-1 gap-px bg-[hsl(var(--border))]" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }} aria-label={group.title}>
      {group.items.map((item, index) => <Cell key={item.key} item={item} span={index === n - 1 ? empty + 1 : 1} />)}
    </ul>
  )
}

// Inicio's top band: one card, one row per group of counters, 1px rules
// between cells. Columns balance by width and the last cell takes any
// leftover slots, so the band never leaves holes whatever the number of
// counters a role or flow shows.
// groups: [{ key, title, items: [{ key, label, value, to?, hint?, alert?, muted? }] }]
export function CounterBand({ groups, label = 'Resumen' }) {
  const visible = groups.filter((g) => g.items.length)
  if (!visible.length) return null
  return (
    <section aria-label={label} className="overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
      {visible.map((group, index) => (
        <div key={group.key} className={cn('md:flex', index > 0 && 'border-t border-[hsl(var(--border))]')}>
          <h2 className="px-4 pt-3 text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))] md:flex md:w-40 md:shrink-0 md:items-center md:border-r md:border-[hsl(var(--border))] md:py-3">
            {group.title}
          </h2>
          <CellRow group={group} />
        </div>
      ))}
    </section>
  )
}
