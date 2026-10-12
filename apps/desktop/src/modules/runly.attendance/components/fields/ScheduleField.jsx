import { Switch, cn } from '@runly/ui'
import {
  DAY_LONG, WEEK_ORDER, copyMondayToActive, presetLongDays, presetWeekdays, setDayActive, setDayTime, summarizeSchedule,
} from '../../lib/shiftSchedule.js'
import { FieldShell } from './FieldShell.jsx'
import { TimeSelectField } from './TimeSelectField.jsx'

const PRESETS = [
  { key: 'weekdays', label: 'Lunes a viernes 08:00-17:00', build: () => presetWeekdays() },
  { key: 'long', label: 'Semana de 4 días largos + viernes corto', build: () => presetLongDays() },
]

// Weekly schedule editor: one row per weekday (switch + start + end) and quick presets.
// Value is { "1": { start, end }, ... }; a weekday without an entry is a rest day.
export function ScheduleField({ label, value, onChange, error, weeklySummary }) {
  const schedule = value ?? {}
  return (
    <FieldShell label={label} error={error}>
      <div className="space-y-2">
        {WEEK_ORDER.map((day) => {
          const hours = schedule[String(day)]
          const active = Boolean(hours)
          return (
            <div key={day} className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-[hsl(var(--border))] px-3 py-2', !active && 'bg-[hsl(var(--muted))]/40')}>
              <div className="flex w-28 shrink-0 items-center gap-2">
                <Switch checked={active} onCheckedChange={(on) => onChange(setDayActive(schedule, day, on))} aria-label={`${DAY_LONG[day]} laborable`} />
                <span className={cn('text-sm font-medium', !active && 'text-[hsl(var(--muted-foreground))]')}>{DAY_LONG[day]}</span>
              </div>
              {active ? (
                <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
                  <TimeSelectField value={hours.start} onChange={(v) => onChange(setDayTime(schedule, day, 'start', v))} />
                  <TimeSelectField value={hours.end} onChange={(v) => onChange(setDayTime(schedule, day, 'end', v))} />
                </div>
              ) : <span className="text-xs text-[hsl(var(--muted-foreground))]">Descanso</span>}
            </div>
          )
        })}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1">
        {PRESETS.map((preset) => (
          <button
            key={preset.key} type="button" onClick={() => onChange(preset.build())}
            className={cn('text-xs underline-offset-2 hover:underline', summarizeSchedule(schedule) === summarizeSchedule(preset.build()) ? 'font-semibold text-[hsl(var(--foreground))]' : 'text-[hsl(var(--muted-foreground))]')}
          >
            {preset.label}
          </button>
        ))}
        <button type="button" onClick={() => onChange(copyMondayToActive(schedule))} className="text-xs text-[hsl(var(--muted-foreground))] underline-offset-2 hover:underline">
          Copiar el lunes a todos los días activos
        </button>
      </div>
      {weeklySummary ? <p className="pt-1 text-sm font-medium" aria-live="polite">{weeklySummary}</p> : null}
    </FieldShell>
  )
}
