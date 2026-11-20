import { Check, Palette } from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent, SegmentedControl, SwitchField } from '@runly/ui'
import { useCalendarStore } from '../stores/useCalendarStore'
import { SURFACES, TINTS } from '../lib/appearance'
import { HOLIDAY_COUNTRIES } from '../lib/holidays'

const LABEL = 'mb-2 text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]'

export default function CalendarAppearanceMenu() {
  const { appearance, setAppearance, holidayCountries, toggleHolidayCountry } = useCalendarStore()

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Personalizar calendario"
          title="Personalizar calendario"
          className="p-1.5 rounded hover:bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] shrink-0"
        >
          <Palette size={16} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-4 p-4">
        <section>
          <div className={LABEL}>Estilo</div>
          <SegmentedControl
            size="sm"
            ariaLabel="Estilo del calendario"
            options={SURFACES}
            value={appearance.surface}
            onChange={(surface) => setAppearance({ surface })}
          />
        </section>

        <section>
          <div className={LABEL}>Color</div>
          <div className="flex flex-wrap gap-2">
            {TINTS.map((c) => {
              const selected = appearance.tint.toLowerCase() === c.toLowerCase()
              return (
                <button
                  key={c}
                  type="button"
                  aria-label={`Color ${c}`}
                  aria-pressed={selected}
                  onClick={() => setAppearance({ tint: c })}
                  className="flex h-7 w-7 items-center justify-center rounded-full transition-transform hover:scale-110"
                  style={{ backgroundColor: c, boxShadow: selected ? `0 0 0 2px hsl(var(--surface-1)), 0 0 0 4px ${c}` : undefined }}
                >
                  {selected && <Check size={14} color="#fff" strokeWidth={3} />}
                </button>
              )
            })}
          </div>
        </section>

        <SwitchField
          id="cal-shade-weekends"
          label="Resaltar fines de semana"
          checked={appearance.shadeWeekends}
          onChange={(shadeWeekends) => setAppearance({ shadeWeekends })}
        />

        <section className="border-t border-[hsl(var(--border))] pt-3">
          <div className={LABEL}>Días festivos</div>
          <div className="space-y-2">
            {HOLIDAY_COUNTRIES.map((c) => (
              <SwitchField
                key={c.code}
                id={`cal-holiday-${c.code}`}
                label={c.label}
                checked={holidayCountries.includes(c.code)}
                onChange={() => toggleHolidayCountry(c.code)}
              />
            ))}
          </div>
        </section>
      </PopoverContent>
    </Popover>
  )
}
