import { cn } from '@runly/ui'
import { WEEKDAYS } from '../../lib/attendanceLabels.js'
import { DAY_PRESETS, effectiveDays, isSameDays, toggleDay } from '../../lib/formHelpers.js'
import { FieldShell } from './FieldShell.jsx'

// Weekday toggle chips plus quick presets. An empty list means "every day" and shows all chips on.
export function DaysChipsField({ label, value, onChange, error, hint }) {
  const selected = effectiveDays(value)
  return (
    <FieldShell label={label} error={error} hint={hint}>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
        {WEEKDAYS.map((day) => {
          const on = selected.includes(day.value)
          return (
            <button
              key={day.value} type="button" aria-pressed={on} onClick={() => onChange(toggleDay(value, day.value))}
              className={cn(
                'h-9 min-w-[2.75rem] rounded-full border px-3 text-sm font-medium transition-colors max-sm:h-11',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]',
                on ? 'border-transparent bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]',
              )}
            >
              {day.label}
            </button>
          )
        })}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1">
        {DAY_PRESETS.map((preset) => (
          <button
            key={preset.key} type="button" onClick={() => onChange(preset.days)}
            className={cn('text-xs underline-offset-2 hover:underline', isSameDays(value, preset.days) ? 'font-semibold text-[hsl(var(--foreground))]' : 'text-[hsl(var(--muted-foreground))]')}
          >
            {preset.label}
          </button>
        ))}
      </div>
    </FieldShell>
  )
}
