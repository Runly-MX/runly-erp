import { useState } from 'react'
import { CalendarDays, ChevronDown } from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from './Popover.jsx'
import { Button } from './Button.jsx'
import { DateRangePanel } from './DateRangePanel.jsx'
import { findActivePreset, summarizeRange } from './date-range-shared.js'
import { cn } from '../lib/utils.js'

// Filter pill for a date range. `filter` = { key, label, fromKey, toKey };
// writes both keys into the FilterBar value object.
export function DateRangeFilter({ filter, value = {}, onChange }) {
  const [open, setOpen] = useState(false)
  const from = value[filter.fromKey] || ''
  const to = value[filter.toKey] || ''
  const active = Boolean(from || to)
  const set = (nextFrom, nextTo) => onChange({ ...value, [filter.fromKey]: nextFrom || '', [filter.toKey]: nextTo || '' })
  const activePreset = findActivePreset(from, to)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex h-10 items-center gap-1.5 rounded-xl border px-3 text-sm font-medium transition-colors sm:h-9',
            active
              ? 'border-(--brand-primary) bg-(--brand-soft) text-[hsl(var(--foreground))]'
              : 'border-[hsl(var(--border))] bg-card text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]',
          )}
        >
          <CalendarDays className="h-3.5 w-3.5 opacity-70" />
          {filter.label}
          {active && (
            <span className="rounded-full bg-(--brand-primary) px-1.5 text-[10px] font-bold text-(--brand-primary-foreground)">
              {activePreset?.label ?? summarizeRange(from, to)}
            </span>
          )}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(34rem,calc(100vw-2rem))] p-0">
        <DateRangePanel
          from={from}
          to={to}
          onChange={set}
          onPresetPick={() => setOpen(false)}
          footer={<Button type="button" size="sm" onClick={() => setOpen(false)}>Listo</Button>}
        />
      </PopoverContent>
    </Popover>
  )
}
