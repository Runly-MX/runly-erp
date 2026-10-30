import { useRef } from "react";
import { BellRing, CalendarCheck2, CalendarPlus, ChevronLeft, ChevronRight, MapPin, Sparkles } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@runly/ui";
import { toLocalIso } from "../../../lib/localDate.js";
import { useCalendarStore } from "../stores/useCalendarStore";
import { useYearEvents } from "../hooks/useCalendarData";
import { hasReminder } from "../lib/reminder-utils";
import { eventsOnDay } from "../lib/day-events";
import { addDays } from "../lib/week-grid";

const cx = (...parts) => parts.filter(Boolean).join(" ");
const colorOf = (event) => event.color || event.calendar?.color || "#6B46C1";

function time(value) {
  return new Date(value).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function isOngoing(event) {
  if (event.allDay || !event.endAt) return false;
  const now = Date.now();
  return new Date(event.startAt).getTime() <= now && now < new Date(event.endAt).getTime();
}

function AgendaRow({ event, onClick }) {
  const color = colorOf(event);
  const live = isOngoing(event);
  return (
    <button
      type="button"
      onClick={() => onClick(event)}
      className="flex w-full items-stretch gap-3 rounded-md px-2 py-2.5 text-left transition-colors active:bg-[hsl(var(--muted))]/60"
    >
      {!event.allDay && (
        <span className="w-12 shrink-0 pt-0.5 text-xs tabular-nums text-[hsl(var(--muted-foreground))]">
          <span className="block font-semibold text-[hsl(var(--foreground))]">{time(event.startAt)}</span>
          {event.endAt && <span className="block">{time(event.endAt)}</span>}
        </span>
      )}
      <span className="w-1 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span
        className="min-w-0 flex-1 rounded-md px-2.5 py-1.5"
        style={{ backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)` }}
      >
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold">{event.title}</span>
          {live && <span className="shrink-0 rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-400">En curso</span>}
          {hasReminder(event) && <BellRing size={12} className="shrink-0 text-[hsl(var(--muted-foreground))]" aria-label="Con recordatorio" />}
        </span>
        {(event.location || event.calendar?.name) && (
          <span className="mt-0.5 flex items-center gap-1 truncate text-xs text-[hsl(var(--muted-foreground))]">
            {event.location && <MapPin size={11} className="shrink-0" aria-hidden />}
            <span className="truncate">{[event.location, event.calendar?.name].filter(Boolean).join(" · ")}</span>
          </span>
        )}
      </span>
    </button>
  );
}

function FreeDay({ dateStr, today }) {
  const message = dateStr === today
    ? "No tienes nada más hoy. Buen momento para enfocarte o planear lo que sigue."
    : dateStr < today
      ? "Este día no tuvo eventos."
      : "Nada agendado todavía. Aparta tiempo antes de que se llene.";
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-8 text-center motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-300">
      <div className="relative flex h-28 w-28 items-center justify-center">
        <span aria-hidden className="absolute inset-0 rounded-full bg-linear-to-br from-violet-500/25 to-sky-500/15 motion-safe:animate-[pulse_3s_ease-in-out_infinite]" />
        <span aria-hidden className="absolute inset-3 rounded-full bg-linear-to-br from-violet-500/30 to-fuchsia-500/20" />
        <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-linear-to-br from-violet-500 to-fuchsia-500 text-white shadow-lg shadow-violet-500/40">
          <CalendarCheck2 size={26} aria-hidden />
        </span>
        <Sparkles size={16} aria-hidden className="absolute right-2 top-3 text-amber-300 motion-safe:animate-bounce" />
      </div>
      <div className="space-y-1.5">
        <p className="text-lg font-semibold">Día libre</p>
        <p className="mx-auto max-w-xs text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">{message}</p>
      </div>
    </div>
  );
}

// Phone day agenda: tapping a day opens this bottom sheet (Apple Calendar style list
// of the day). Arrows or a sideways swipe move to the previous / next day.
export default function DayAgendaSheet({ dateStr, onClose, onEventClick, onNewEvent, onChangeDate }) {
  const { activeCalendarIds } = useCalendarStore();
  const date = dateStr ? new Date(`${dateStr}T12:00:00`) : null;
  const { data: yearEvents = [], isLoading } = useYearEvents(date ? date.getFullYear() : new Date().getFullYear(), activeCalendarIds, Boolean(date));
  const { allDay, timed } = date ? eventsOnDay(yearEvents, dateStr) : { allDay: [], timed: [] };
  const total = allDay.length + timed.length;
  const today = toLocalIso();
  const swipe = useRef(null);

  const go = (days) => { if (dateStr && onChangeDate) onChangeDate(addDays(dateStr, days)); };
  const onPointerDown = (e) => { swipe.current = { x: e.clientX, y: e.clientY }; };
  const onPointerUp = (e) => {
    const from = swipe.current;
    swipe.current = null;
    if (!from) return;
    const dx = e.clientX - from.x;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(e.clientY - from.y) * 1.5) go(dx < 0 ? 1 : -1);
  };

  const weekday = date ? date.toLocaleDateString("es-MX", { weekday: "short" }).replace(".", "") : "";
  const longDate = date ? date.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" }) : "";
  const isToday = dateStr === today;

  return (
    <Sheet open={Boolean(dateStr)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="flex min-h-[62dvh] flex-col gap-0 p-0">
        <div className="flex shrink-0 items-center gap-3 border-b border-[hsl(var(--border))] px-4 pb-3 pt-1">
          <div className={cx(
            "flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-md leading-none shadow-md",
            isToday ? "bg-linear-to-br from-violet-500 to-fuchsia-500 text-white shadow-violet-500/30" : "bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]",
          )}>
            <span className={cx("text-[10px] font-semibold uppercase tracking-wider", isToday ? "text-white/85" : "text-violet-400")}>{weekday}</span>
            <span className="mt-1 text-2xl font-bold tabular-nums">{date?.getDate()}</span>
          </div>
          <div className="min-w-0 flex-1">
            <SheetTitle className="truncate text-base first-letter:uppercase">{longDate}</SheetTitle>
            <SheetDescription className="text-xs">
              {isToday && <span className="mr-1.5 font-semibold text-violet-400">Hoy ·</span>}
              {total === 0 ? "Sin eventos" : `${total} ${total === 1 ? "evento" : "eventos"}`}
            </SheetDescription>
          </div>
          {onChangeDate && (
            <div className="flex shrink-0">
              <button type="button" onClick={() => go(-1)} aria-label="Día anterior" className="flex h-11 w-10 items-center justify-center rounded-md text-[hsl(var(--muted-foreground))] active:bg-[hsl(var(--muted))]"><ChevronLeft size={20} aria-hidden /></button>
              <button type="button" onClick={() => go(1)} aria-label="Día siguiente" className="flex h-11 w-10 items-center justify-center rounded-md text-[hsl(var(--muted-foreground))] active:bg-[hsl(var(--muted))]"><ChevronRight size={20} aria-hidden /></button>
            </div>
          )}
        </div>

        <div
          key={dateStr}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          className="flex min-h-0 flex-1 touch-pan-y flex-col overflow-y-auto px-2 py-2 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
        >
          {total === 0 ? (
            !isLoading && <FreeDay dateStr={dateStr} today={today} />
          ) : (
            <div className="space-y-3">
              {allDay.length > 0 && (
                <section>
                  <h3 className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Todo el día</h3>
                  {allDay.map((ev) => <AgendaRow key={`${ev.id}-${ev.startAt}`} event={ev} onClick={onEventClick} />)}
                </section>
              )}
              {timed.length > 0 && (
                <section>
                  {allDay.length > 0 && <h3 className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Con horario</h3>}
                  {timed.map((ev) => <AgendaRow key={`${ev.id}-${ev.startAt}`} event={ev} onClick={onEventClick} />)}
                </section>
              )}
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-[hsl(var(--border))] px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3">
          <button
            type="button"
            onClick={() => onNewEvent(dateStr)}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-md bg-linear-to-r from-violet-600 to-fuchsia-500 text-sm font-semibold text-white shadow-lg shadow-violet-600/30 transition-transform active:scale-[0.98]"
          >
            <CalendarPlus size={18} aria-hidden />Nuevo evento
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
