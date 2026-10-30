import { CalendarPlus } from "lucide-react";
import { Button, EmptyState, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@runly/ui";
import { useCalendarStore } from "../stores/useCalendarStore";
import { useYearEvents } from "../hooks/useCalendarData";
import { hasReminder } from "../lib/reminder-utils";
import { eventsOnDay } from "../lib/day-events";

function time(value) {
  return new Date(value).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function AgendaRow({ event, onClick }) {
  const color = event.color || event.calendar?.color || "#6B46C1";
  return (
    <button
      type="button"
      onClick={() => onClick(event)}
      className="flex w-full items-stretch gap-3 rounded-md px-2 py-2 text-left hover:bg-[hsl(var(--muted))]/40"
    >
      <span className="w-12 shrink-0 pt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
        {event.allDay ? "Todo el día" : (
          <>
            <span className="block font-medium text-[hsl(var(--foreground))]">{time(event.startAt)}</span>
            {event.endAt && <span className="block">{time(event.endAt)}</span>}
          </>
        )}
      </span>
      <span className="w-1 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{event.title}</span>
        {(event.location || event.calendar?.name) && (
          <span className="block truncate text-xs text-[hsl(var(--muted-foreground))]">
            {[event.location, event.calendar?.name].filter(Boolean).join(" · ")}
          </span>
        )}
      </span>
      {hasReminder(event) && <span className="sr-only">Con recordatorio</span>}
    </button>
  );
}

// Phone day agenda: tapping a month cell opens this bottom sheet (Apple
// Calendar style list of the day) instead of only highlighting the cell.
export default function DayAgendaSheet({ dateStr, onClose, onEventClick, onNewEvent }) {
  const { activeCalendarIds } = useCalendarStore();
  const date = dateStr ? new Date(`${dateStr}T12:00:00`) : null;
  const { data: yearEvents = [], isLoading } = useYearEvents(date ? date.getFullYear() : new Date().getFullYear(), activeCalendarIds, Boolean(date));
  const { allDay, timed } = date ? eventsOnDay(yearEvents, dateStr) : { allDay: [], timed: [] };
  const list = [...allDay, ...timed];
  const title = date
    ? date.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })
    : "";

  return (
    <Sheet open={Boolean(dateStr)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="gap-3">
        <SheetHeader>
          <SheetTitle className="capitalize">{title}</SheetTitle>
          <SheetDescription>
            {list.length === 0 ? "Sin eventos" : `${list.length} ${list.length === 1 ? "evento" : "eventos"}`}
          </SheetDescription>
        </SheetHeader>
        {list.length === 0 ? (
          !isLoading && <EmptyState title="Día libre" description="No hay eventos para este día." />
        ) : (
          <div className="space-y-0.5">
            {list.map((ev) => <AgendaRow key={ev.id} event={ev} onClick={onEventClick} />)}
          </div>
        )}
        <Button className="mt-2 shrink-0" onClick={() => onNewEvent(dateStr)}>
          <CalendarPlus className="mr-2 h-4 w-4" />Nuevo evento
        </Button>
      </SheetContent>
    </Sheet>
  );
}
