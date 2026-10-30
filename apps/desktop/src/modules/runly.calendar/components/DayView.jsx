import { toLocalIso } from '../../../lib/localDate.js';
import { useCalendarStore } from '../stores/useCalendarStore'
import { useYearEvents } from '../hooks/useCalendarData'
import { eventsOnDay } from '../lib/day-events'
import {
  filterEventsForHour,
  splitVisibleEvents,
} from '../lib/calendar-overflow'
import EventChip from './EventChip'

const HOURS = Array.from({ length: 24 }, (_, i) => i)
const MAX_VISIBLE_SLOT_EVENTS = 2
const MAX_VISIBLE_ALL_DAY_EVENTS = 2


export default function DayView({ onEventClick }) {
  const {
    selectedDate,
    activeCalendarIds,
    focusDate,
    focusTimeSlot,
  } = useCalendarStore()
  const dateStr = selectedDate || toLocalIso()
  const d = new Date(dateStr + 'T12:00:00')
  const year = d.getFullYear()
  const month = d.getMonth()

  const needsPrevYear = month === 0
  const needsNextYear = month === 11

  const { data: yearEvents = [] } = useYearEvents(year, activeCalendarIds)
  const { data: prevYearEvents = [] } = useYearEvents(
    year - 1,
    activeCalendarIds,
    needsPrevYear,
  )
  const { data: nextYearEvents = [] } = useYearEvents(
    year + 1,
    activeCalendarIds,
    needsNextYear,
  )

  const events = [
    ...yearEvents,
    ...(needsPrevYear ? prevYearEvents : []),
    ...(needsNextYear ? nextYearEvents : []),
  ]

  const { allDay: allDayEvents, timed: timedEvents } = eventsOnDay(events, dateStr)
  const allDaySlot = splitVisibleEvents(allDayEvents, MAX_VISIBLE_ALL_DAY_EVENTS)

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {allDayEvents.length > 0 && (
        <div className="border-b border-[hsl(var(--border))] p-2 space-y-1 bg-[hsl(var(--surface-2))] shrink-0">
          <div className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase font-semibold mb-1">
            Todo el día
          </div>
          {allDaySlot.visible.map((event) => (
            <EventChip
              key={event.id}
              event={event}
              onClick={onEventClick}
              compact
              hideTime
              hideReminder
            />
          ))}
          {allDaySlot.hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => focusDate(dateStr)}
              className="truncate rounded px-1 text-left text-[10px] font-medium text-violet-300 hover:text-violet-200"
            >
              +{allDaySlot.hiddenCount} más
            </button>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {HOURS.map((hour) => {
          const slot = splitVisibleEvents(
            filterEventsForHour(timedEvents, hour),
            MAX_VISIBLE_SLOT_EVENTS,
          )

          return (
            <div key={hour} className="flex h-[64px] border-b border-[hsl(var(--border))]/50">
              <div className="w-14 shrink-0 px-2 pt-1 border-r border-[hsl(var(--border))] text-right">
                <span className="text-[10px] text-[hsl(var(--muted-foreground))]">
                  {String(hour).padStart(2, '0')}:00
                </span>
              </div>
              <div className="flex-1 overflow-hidden p-1">
                <div className="flex h-full flex-col gap-0.5 overflow-hidden">
                  {slot.visible.map((event) => (
                    <EventChip
                      key={event.id}
                      event={event}
                      onClick={onEventClick}
                      compact
                      hideTime
                      hideReminder
                    />
                  ))}
                  {slot.hiddenCount > 0 && (
                    <button
                      type="button"
                      onClick={() => focusTimeSlot(dateStr, hour)}
                      className="truncate rounded px-1 text-left text-[10px] font-medium text-violet-300 hover:text-violet-200"
                    >
                      +{slot.hiddenCount} más
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
