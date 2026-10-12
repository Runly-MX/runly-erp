import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { DAYS_HEADER, MONTHS, buildCalendarGrid, parseDate } from './date-picker-shared.jsx'
import { DATE_RANGE_PRESETS, findActivePreset, formatShortDate, localIso } from './date-range-shared.js'
import { cn } from '../lib/utils.js'

// Single-month calendar that picks a range: first click sets the start, the
// second the end (clicking before the start restarts the range). Hover
// previews the range being picked.
function RangeCalendar({ from, to, onPick }) {
  const initial = parseDate(from || to) ?? new Date()
  const [year, setYear] = useState(initial.getFullYear())
  const [month, setMonth] = useState(initial.getMonth())
  const [hover, setHover] = useState('')
  const todayIso = localIso(new Date())
  const cells = buildCalendarGrid(year, month)
  const iso = (day) => localIso(new Date(year, month, day))
  const picking = Boolean(from && !to)
  const end = picking && hover > from ? hover : to

  const shift = (delta) => {
    const next = new Date(year, month + delta, 1)
    setYear(next.getFullYear())
    setMonth(next.getMonth())
  }

  function pick(day) {
    const value = iso(day)
    if (!from || to || value < from) onPick(value, '')
    else onPick(from, value)
  }

  return (
    <div className="w-full select-none" onMouseLeave={() => setHover('')}>
      <div className="mb-2 flex items-center justify-between">
        <button type="button" onClick={() => shift(-1)} aria-label="Mes anterior"
          className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-[hsl(var(--muted))]">
          <ChevronLeft size={16} />
        </button>
        <span className="text-sm font-semibold">{MONTHS[month]} {year}</span>
        <button type="button" onClick={() => shift(1)} aria-label="Mes siguiente"
          className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-[hsl(var(--muted))]">
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="mb-1 grid grid-cols-7">
        {DAYS_HEADER.map((d) => (
          <div key={d} className="py-1 text-center text-[11px] font-medium text-[hsl(var(--muted-foreground))]">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />
          const value = iso(day)
          const isStart = value === from
          const isEnd = value === end
          const inRange = from && end && value > from && value < end
          const edge = isStart || isEnd
          return (
            <div
              key={i}
              className={cn(
                'flex h-9 items-center justify-center',
                inRange && 'bg-(--brand-soft)',
                isStart && end && end !== from && 'rounded-l-full bg-(--brand-soft)',
                isEnd && from && end !== from && 'rounded-r-full bg-(--brand-soft)',
              )}
            >
              <button
                type="button"
                onClick={() => pick(day)}
                onMouseEnter={() => setHover(value)}
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-full text-sm transition-colors',
                  edge
                    ? 'bg-(--brand-primary) font-semibold text-(--brand-primary-foreground)'
                    : 'text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]',
                  !edge && value === todayIso && 'font-semibold ring-1 ring-inset ring-(--brand-primary)',
                )}
              >
                {day}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DateBox({ label, value, active }) {
  return (
    <div className={cn(
      'min-w-0 flex-1 rounded-xl border px-3 py-2 transition-colors',
      active ? 'border-(--brand-primary) bg-(--brand-soft)' : 'border-[hsl(var(--border))]',
    )}>
      <p className="text-[10px] font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{label}</p>
      <p className={cn('truncate text-sm', value ? 'font-medium text-[hsl(var(--foreground))]' : 'text-[hsl(var(--muted-foreground))]')}>
        {value ? formatShortDate(value) : 'Sin definir'}
      </p>
    </div>
  )
}

// Reusable range picker body: presets + Desde/Hasta boxes + range calendar.
// layout "side" puts the presets in a left column (popover pill); "stacked"
// puts them in a wrapping chip row on top (FilterMenu panes, mobile sheet).
// `footer` (optional) renders next to "Quitar rango"; `onPresetPick` fires after a preset.
export function DateRangePanel({ from = '', to = '', onChange, onPresetPick, layout = 'side', footer }) {
  const active = Boolean(from || to)
  const activePreset = findActivePreset(from, to)
  const stacked = layout === 'stacked'
  const applyPreset = (preset) => { onChange(...preset.range()); onPresetPick?.() }

  const presets = DATE_RANGE_PRESETS.map((preset) => (
    <button
      key={preset.label}
      type="button"
      onClick={() => applyPreset(preset)}
      className={cn(
        'shrink-0 whitespace-nowrap transition-colors',
        stacked
          ? 'rounded-full border px-3 py-1 text-xs'
          : 'rounded-lg px-3 py-2 text-left text-sm',
        activePreset === preset
          ? (stacked ? 'border-(--brand-primary) bg-(--brand-soft) font-medium' : 'bg-(--brand-soft) font-medium text-[hsl(var(--foreground))]')
          : (stacked ? 'border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]' : 'text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]'),
      )}
    >
      {preset.label}
    </button>
  ))

  const calendar = (
    <div className={cn('min-w-0 space-y-3', stacked ? 'flex-1' : 'flex-1 p-4')}>
      <div className="flex gap-2">
        <DateBox label="Desde" value={from} active={!from || (from && to)} />
        <DateBox label="Hasta" value={to} active={Boolean(from && !to)} />
      </div>
      <RangeCalendar from={from} to={to} onPick={onChange} />
      <div className="flex items-center justify-between border-t border-[hsl(var(--border))] pt-3">
        <button
          type="button"
          onClick={() => onChange('', '')}
          disabled={!active}
          className="text-xs text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))] disabled:opacity-40"
        >
          Quitar rango
        </button>
        {footer}
      </div>
    </div>
  )

  if (stacked) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-1.5">{presets}</div>
        {calendar}
      </div>
    )
  }
  return (
    <div className="flex flex-col sm:flex-row">
      <div className="flex gap-1 overflow-x-auto border-b border-[hsl(var(--border))] p-2 sm:w-40 sm:shrink-0 sm:flex-col sm:overflow-visible sm:border-b-0 sm:border-r">
        {presets}
      </div>
      {calendar}
    </div>
  )
}
