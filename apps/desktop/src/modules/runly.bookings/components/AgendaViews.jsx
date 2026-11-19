import { useMemo } from 'react'
import { cn } from '@runly/ui'
import { STATUS } from '../lib/bookingsLabels.js'
import { addDays, dayKey, daysInMonth, formatKey, formatTime, minuteOfDay, monthStart, weekStart, weekdayOf } from '../lib/bookingsTime.js'
import { StatusBadge } from './shared.jsx'

const PX_PER_MIN = 0.9
const TONE_CLASS = {
  brand: 'border-l-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10',
  warning: 'border-l-amber-500 bg-amber-500/10',
  success: 'border-l-emerald-600 bg-emerald-600/10',
  danger: 'border-l-red-600 bg-red-600/10',
  neutral: 'border-l-[hsl(var(--muted-foreground))] bg-[hsl(var(--muted))]',
}

// Bookings of one local day split into the minutes of that day (a booking that
// crosses midnight shows on both days).
function segmentsOf(bookings, key, tz) {
  const next = addDays(key, 1)
  return bookings.flatMap((b) => {
    const startKey = dayKey(b.startsAt, tz), endKey = dayKey(new Date(new Date(b.endsAt).getTime() - 1), tz)
    if (key < startKey || key > endKey) return []
    const start = startKey === key ? minuteOfDay(b.startsAt, tz) : 0
    const end = endKey === key && dayKey(b.endsAt, tz) !== next ? minuteOfDay(b.endsAt, tz) : 1440
    return [{ booking: b, start, end: Math.max(end, start + 15) }]
  })
}

// Overlapping segments (different resources) get side-by-side lanes.
function lanes(segments) {
  const sorted = [...segments].sort((a, b) => a.start - b.start || b.end - a.end)
  const ends = []
  for (const seg of sorted) {
    let lane = ends.findIndex((end) => end <= seg.start)
    if (lane === -1) { lane = ends.length; ends.push(0) }
    ends[lane] = seg.end
    seg.lane = lane
  }
  for (const seg of sorted) seg.lanes = Math.max(1, ...sorted.filter((o) => o.start < seg.end && seg.start < o.end).map((o) => o.lane + 1))
  return sorted
}

export function rangeHours(bookings, days, tz) {
  let min = 8 * 60, max = 20 * 60
  for (const key of days) for (const s of segmentsOf(bookings, key, tz)) { min = Math.min(min, s.start); max = Math.max(max, s.end) }
  return { startHour: Math.floor(min / 60), endHour: Math.min(24, Math.ceil(max / 60)) }
}

export function TimeGrid({ days, bookings, tz, today, onSelect, nameOf }) {
  const { startHour, endHour } = useMemo(() => rangeHours(bookings, days, tz), [bookings, days, tz])
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i)
  const height = (endHour - startHour) * 60 * PX_PER_MIN
  return (
    <div className="overflow-hidden rounded-md border border-[hsl(var(--border))]">
      <div className="grid border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]/40" style={{ gridTemplateColumns: `3.25rem repeat(${days.length}, minmax(0, 1fr))` }}>
        <span />
        {days.map((key) => (
          <div key={key} className={cn('px-2 py-2 text-center text-xs font-semibold first-letter:uppercase', key === today && 'text-[hsl(var(--primary))]')}>
            {formatKey(key, days.length > 1 ? { weekday: 'short', day: 'numeric' } : { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
        ))}
      </div>
      <div className="grid" style={{ gridTemplateColumns: `3.25rem repeat(${days.length}, minmax(0, 1fr))` }}>
        <div className="relative" style={{ height }}>
          {hours.map((h) => <span key={h} className="absolute right-1.5 -translate-y-1/2 text-[10px] text-[hsl(var(--muted-foreground))] tabular-nums" style={{ top: (h - startHour) * 60 * PX_PER_MIN }}>{h ? `${String(h).padStart(2, '0')}:00` : ''}</span>)}
        </div>
        {days.map((key) => (
          <div key={key} className="relative border-l border-[hsl(var(--border))]" style={{ height }}>
            {hours.map((h) => <div key={h} className="absolute inset-x-0 border-t border-[hsl(var(--border))]/60" style={{ top: (h - startHour) * 60 * PX_PER_MIN }} />)}
            {lanes(segmentsOf(bookings, key, tz)).map((seg) => {
              const b = seg.booking, tone = STATUS[b.status]?.tone ?? 'neutral'
              return (
                <button
                  key={`${b.id}-${key}`}
                  type="button"
                  onClick={() => onSelect(b.id)}
                  className={cn('absolute overflow-hidden rounded-md border-l-4 px-1.5 py-1 text-left text-[11px] leading-tight focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:outline-none', TONE_CLASS[tone], ['CANCELLED', 'REJECTED', 'EXPIRED'].includes(b.status) && 'opacity-60 line-through')}
                  style={{ top: (seg.start - startHour * 60) * PX_PER_MIN, height: Math.max(22, (seg.end - seg.start) * PX_PER_MIN - 2), left: `calc(${(seg.lane / seg.lanes) * 100}% + 2px)`, width: `calc(${100 / seg.lanes}% - 4px)` }}
                  aria-label={`${formatTime(b.startsAt, tz)} ${b.guestName || ''} ${nameOf(b)} ${STATUS[b.status]?.label ?? ''}`}
                >
                  <span className="block truncate font-semibold tabular-nums">{formatTime(b.startsAt, tz)} {b.guestName || 'Sin nombre'}</span>
                  <span className="block truncate opacity-80">{nameOf(b)}</span>
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

// Phone layout for day/week: one list per day, ordered by time.
export function DayList({ days, bookings, tz, onSelect, nameOf }) {
  return (
    <div className="space-y-4">
      {days.map((key) => {
        const items = segmentsOf(bookings, key, tz).sort((a, b) => a.start - b.start)
        return (
          <section key={key} aria-label={formatKey(key)}>
            <h3 className="mb-1.5 text-sm font-semibold first-letter:uppercase">{formatKey(key)}</h3>
            {items.length ? (
              <ul className="divide-y divide-[hsl(var(--border))] rounded-md border border-[hsl(var(--border))]">
                {items.map(({ booking: b }) => (
                  <li key={b.id}>
                    <button type="button" onClick={() => onSelect(b.id)} className="flex min-h-11 w-full items-center justify-between gap-2 px-3 py-2 text-left focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:outline-none">
                      <span className="min-w-0">
                        <span className="block text-sm font-medium tabular-nums">{formatTime(b.startsAt, tz)} a {formatTime(b.endsAt, tz)}</span>
                        <span className="block truncate text-xs text-[hsl(var(--muted-foreground))]">{b.guestName || 'Sin nombre'} · {nameOf(b)}</span>
                      </span>
                      <StatusBadge status={b.status} size="sm" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : <p className="text-xs text-[hsl(var(--muted-foreground))]">Sin reservaciones.</p>}
          </section>
        )
      })}
    </div>
  )
}

export function MonthGrid({ anchor, bookings, tz, today, onPickDay }) {
  const first = monthStart(anchor), count = daysInMonth(anchor)
  const lead = (weekdayOf(first) + 6) % 7
  const cells = [...Array(lead).fill(null), ...Array.from({ length: count }, (_, i) => addDays(first, i))]
  const byDay = useMemo(() => {
    const map = new Map()
    for (const b of bookings) { const k = dayKey(b.startsAt, tz); map.set(k, [...(map.get(k) ?? []), b]) }
    return map
  }, [bookings, tz])
  const week = weekStart(first)
  return (
    <div className="overflow-hidden rounded-md border border-[hsl(var(--border))]">
      <div className="grid grid-cols-7 border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]/40">
        {Array.from({ length: 7 }, (_, i) => <div key={i} className="py-2 text-center text-xs font-semibold first-letter:uppercase">{formatKey(addDays(week, i), { weekday: 'short' })}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((key, i) => {
          if (!key) return <div key={`e${i}`} className="min-h-16 border-b border-r border-[hsl(var(--border))]/60" />
          const items = (byDay.get(key) ?? []).filter((b) => ['PENDING', 'CONFIRMED', 'COMPLETED'].includes(b.status))
          return (
            <button key={key} type="button" onClick={() => onPickDay(key)}
              className="min-h-16 border-b border-r border-[hsl(var(--border))]/60 p-1.5 text-left hover:bg-[hsl(var(--muted))]/50 focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:outline-none"
              aria-label={`${formatKey(key)}: ${items.length} reservaciones`}>
              <span className={cn('text-xs font-semibold tabular-nums', key === today && 'text-[hsl(var(--primary))]')}>{Number(key.slice(8))}</span>
              {items.length ? <span className="mt-1 block truncate rounded-md bg-[hsl(var(--primary))]/10 px-1 text-[11px] font-medium tabular-nums">{items.length} {items.length === 1 ? 'reserva' : 'reservas'}</span> : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
