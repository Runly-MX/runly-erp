import { BellRing } from 'lucide-react'
import { hasReminder } from '../lib/reminder-utils'

// Event color fills the chip; when it differs from its calendar's color, the
// calendar color stays visible as a left accent so the calendar is still recognizable.
export function eventColors(event) {
  const calendarColor = event.calendar?.color || '#6B46C1'
  const own = event.color && event.color.toLowerCase() !== calendarColor.toLowerCase() ? event.color : null
  return { bg: own || calendarColor, accent: own ? calendarColor : null }
}

export default function EventChip({
  event,
  onClick,
  compact = false,
  hideTime = false,
  hideReminder = false,
  style,
}) {
  const { bg, accent } = eventColors(event)
  const reminder = !hideReminder && hasReminder(event)
  // Holidays read as a soft label, not as a booked block of time.
  const colors = event._holiday
    ? { backgroundColor: `color-mix(in srgb, ${bg} 16%, hsl(var(--surface-1)))`, color: bg, boxShadow: `inset 3px 0 0 ${bg}` }
    : accent
      // Calendar tab (6px) + a light 2px divider, so it reads even next to a similar hue.
      ? { backgroundColor: bg, boxShadow: `inset 6px 0 0 ${accent}, inset 8px 0 0 rgba(255,255,255,0.9)`, paddingLeft: compact ? '12px' : '13px' }
      : { backgroundColor: bg }

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick?.(event) }}
      title={event.title}
      className={[
        'block w-full overflow-hidden text-left rounded px-1.5 font-medium cursor-pointer',
        event._holiday ? '' : 'text-white',
        'hover:brightness-90 transition-all',
        compact ? 'h-5 text-[11px] leading-5 py-0' : 'text-xs py-0.5',
      ].join(' ')}
      style={{ ...colors, ...style }}
    >
      <span className="flex min-w-0 items-center gap-1">
        {reminder && <BellRing size={compact ? 10 : 12} className="opacity-90 shrink-0" />}
        {!event.allDay && !compact && !hideTime && (
          <span className="opacity-80">
            {new Date(event.startAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false })}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate">{event.title}</span>
      </span>
    </button>
  )
}
