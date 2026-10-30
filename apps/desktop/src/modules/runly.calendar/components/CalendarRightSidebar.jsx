import { BellRing, Calendar, Plus } from "lucide-react";
import { useCalendarStore } from "../stores/useCalendarStore";
import { toLocalIso } from "../../../lib/localDate.js";
import { useYearEvents } from "../hooks/useCalendarData";
import { eventsOnDay } from "../lib/day-events";
import {
  filterEventsForHour,
  formatHourRangeLabel,
} from "../lib/calendar-overflow";
import {
  formatReminderLead,
  getPrimaryReminderMinutes,
} from "../lib/reminder-utils";

const WEEKDAYS = [
  "domingo",
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado",
];
const MONTHS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

export default function CalendarRightSidebar({ onNewEvent, onEventClick }) {
  const {
    selectedDate,
    activeCalendarIds,
    selectedSlotHour,
    clearSelectedSlot,
  } = useCalendarStore();
  const d = selectedDate ? new Date(selectedDate + "T12:00:00") : new Date();
  const dateStr = toLocalIso(d);

  // Same source and day rule as the Day view and the phone agenda: the year's
  // events filtered on the client, so multi-day all-day spans (project tasks)
  // show on every day they cover, not only when they start inside the day.
  const { data: yearEvents = [] } = useYearEvents(d.getFullYear(), activeCalendarIds);
  const { allDay, timed } = eventsOnDay(yearEvents, dateStr);
  const sortedEvents = [...allDay, ...timed];
  const visibleEvents =
    selectedSlotHour === null
      ? sortedEvents
      : filterEventsForHour(sortedEvents, selectedSlotHour);

  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();

  return (
    <aside className="w-56 shrink-0 flex flex-col h-full border-l border-[hsl(var(--border))] bg-[hsl(var(--surface-2))]">
      <div className="p-4 border-b border-[hsl(var(--border))]">
        <div
          className={[
            "text-4xl font-light leading-none",
            isToday ? "text-violet-600" : "text-[hsl(var(--foreground))]",
          ].join(" ")}
        >
          {d.getDate()}
        </div>
        <div className="text-xs text-[hsl(var(--muted-foreground))] mt-1 capitalize">
          {WEEKDAYS[d.getDay()]}, {MONTHS[d.getMonth()]} {d.getFullYear()}
        </div>
        {selectedSlotHour !== null && (
          <div className="mt-1 flex items-center justify-between gap-2">
            <div className="text-[10px] font-medium uppercase tracking-wide text-violet-300">
              {formatHourRangeLabel(selectedSlotHour)}
            </div>
            <button
              type="button"
              onClick={clearSelectedSlot}
              className="text-[10px] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
            >
              Ver día
            </button>
          </div>
        )}
        {isToday && (
          <div className="text-xs text-violet-500 font-medium mt-0.5">Hoy</div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {visibleEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
            <Calendar
              size={28}
              className="text-[hsl(var(--muted-foreground))] opacity-40"
            />
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              {selectedSlotHour === null ? "Sin eventos" : "Sin eventos en esta hora"}
            </p>
            <p className="text-[10px] text-[hsl(var(--muted-foreground))] opacity-60">
              {selectedSlotHour === null
                ? "No hay eventos programados"
                : "No hay eventos programados en este bloque horario"}
            </p>
          </div>
        ) : (
          visibleEvents.map((ev) => {
            const color = ev.color || ev.calendar?.color || "#6B46C1";
            const reminderMinutes = getPrimaryReminderMinutes(ev);
            return (
              <button
                type="button"
                key={ev.id}
                onClick={() => onEventClick?.(ev)}
                className="block w-full cursor-pointer rounded-lg p-2 text-left text-xs transition-opacity hover:opacity-80"
                style={{
                  backgroundColor: color + "20",
                  borderLeft: `3px solid ${color}`,
                }}
              >
                <div className="font-medium text-[hsl(var(--foreground))] truncate">
                  {ev.title}
                </div>
                {!ev.allDay && (
                  <div className="text-[hsl(var(--muted-foreground))] mt-0.5">
                    {new Date(ev.startAt).toLocaleTimeString("es-MX", {
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                    })}
                    {ev.endAt &&
                      ` - ${new Date(ev.endAt).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false })}`}
                  </div>
                )}
                {reminderMinutes !== null && (
                  <div className="text-[10px] mt-1 text-[hsl(var(--muted-foreground))] flex items-center gap-1">
                    <BellRing size={10} />
                    {formatReminderLead(reminderMinutes)}
                  </div>
                )}
              </button>
            );
          })
        )}
      </div>

      <div className="p-3 border-t border-[hsl(var(--border))]">
        <button
          type="button"
          onClick={onNewEvent}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-dashed border-[hsl(var(--border))] text-xs text-[hsl(var(--muted-foreground))] hover:border-violet-500 hover:text-violet-500 transition-colors"
        >
          <Plus size={12} />
          Crear evento
        </button>
      </div>
    </aside>
  );
}
