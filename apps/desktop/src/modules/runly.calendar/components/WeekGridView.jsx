// Phone "Semana" view: the seven days of the selected week as cards plus a rotating
// widget (2x4). Swipe sideways to change week, tap a day for its agenda, tap an event to
// open it, hold an event and drop it on another day to move it (project tasks reschedule
// the task itself; recurring series and other modules' events are not draggable).
import { useCallback, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { useDayDrag } from "@runly/ui";
import { toLocalIso } from "../../../lib/localDate.js";
import { useAuth } from "../../../auth/AuthProvider";
import { runly } from "../../../lib/runly";
import { useCalendarStore } from "../stores/useCalendarStore";
import { useYearEvents } from "../hooks/useCalendarData";
import { eventsOnDay } from "../lib/day-events";
import { addDays, daysBetween, shiftedEvent, weekDates, weekStartOf, weekSummary } from "../lib/week-grid";
import WeekGridWidget, { WIDGET_MODES } from "./WeekGridWidget";

const WIDGET_KEY = "runly.calendar.weekWidget";
const WEEKDAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const cx = (...parts) => parts.filter(Boolean).join(" ");
const colorOf = (ev) => ev.color || ev.calendar?.color || "#6B46C1";
const timeOf = (value) => new Date(value).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false });
const utcDay = (value) => new Date(value).toISOString().slice(0, 10); // eslint-disable-line no-restricted-syntax -- all-day/task dates are UTC calendar days

function readWidgetMode() {
  try {
    const value = localStorage.getItem(WIDGET_KEY);
    return WIDGET_MODES.some((m) => m.key === value) ? value : "month";
  } catch { return "month"; }
}

const canDrag = (ev) => !ev._isRecurrenceInstance && !ev.recurrenceRule && (!ev.sourceModule || (ev.sourceModule === "runly.projects" && ev.sourceEntityId));

function EventChip({ event, dateStr, dragging, onPointerDown, onOpen }) {
  const color = colorOf(event);
  const draggable = canDrag(event);
  return (
    <div
      role="button"
      tabIndex={0}
      onPointerDown={draggable ? (e) => onPointerDown(e, event, dateStr) : undefined}
      onClick={(e) => { e.stopPropagation(); onOpen(event); }}
      onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onOpen(event); } }}
      onContextMenu={(e) => e.preventDefault()}
      title={event.title}
      className={cx(
        "flex min-w-0 cursor-pointer select-none items-center gap-1 rounded-sm px-1.5 py-1 text-[11px] leading-tight [-webkit-touch-callout:none]",
        event.allDay ? "font-medium text-white" : "bg-[hsl(var(--muted))]/60",
        dragging && "opacity-30",
      )}
      style={event.allDay ? { backgroundColor: color } : undefined}
    >
      {!event.allDay && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />}
      {!event.allDay && <span className="shrink-0 tabular-nums text-[hsl(var(--muted-foreground))]">{timeOf(event.startAt)}</span>}
      <span className="truncate">{event.title}</span>
    </div>
  );
}

export default function WeekGridView({ onEventClick, onDayClick, onNewEvent }) {
  const { selectedDate, activeCalendarIds, navigateNext, navigatePrev, setSelectedDate } = useCalendarStore();
  const { session } = useAuth();
  const token = session?.access_token;
  const qc = useQueryClient();
  const today = toLocalIso();
  const start = weekStartOf(selectedDate || today);
  const days = weekDates(start);
  const firstYear = Number(start.slice(0, 4));
  const lastYear = Number(days[6].slice(0, 4));

  const { data: yearEvents = [] } = useYearEvents(firstYear, activeCalendarIds);
  const { data: nextYearEvents = [] } = useYearEvents(firstYear + 1, activeCalendarIds, lastYear > firstYear || today.slice(5, 7) === "12");
  const events = useMemo(() => [...yearEvents, ...(lastYear > firstYear || today.slice(5, 7) === "12" ? nextYearEvents : [])], [yearEvents, nextYearEvents, lastYear, firstYear, today]);

  const [widgetMode, setWidgetModeState] = useState(readWidgetMode);
  const [direction, setDirection] = useState(0);
  const swipe = useRef(null);
  const swipedAt = useRef(0);

  const byDay = useMemo(() => new Map(days.map((d) => [d, eventsOnDay(events, d)])), [events, days.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const busyDays = useMemo(() => {
    const set = new Set();
    for (const ev of events) {
      if (ev.allDay) {
        const first = utcDay(ev.startAt);
        const last = ev.endAt ? utcDay(ev.endAt) : first;
        for (let d = first, n = 0; d <= last && n < 62; d = addDays(d, 1), n += 1) set.add(d);
      } else set.add(toLocalIso(new Date(ev.startAt)));
    }
    return set;
  }, [events]);
  const upcoming = useMemo(() => {
    const now = Date.now();
    const horizon = now + 14 * 86_400_000;
    return events
      .filter((ev) => !ev.allDay && new Date(ev.startAt).getTime() >= now - 15 * 60_000 && new Date(ev.startAt).getTime() <= horizon)
      .sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
  }, [events]);

  function setWidgetMode(mode) {
    setWidgetModeState(mode);
    try { localStorage.setItem(WIDGET_KEY, mode); } catch { /* per-viewer convenience only */ }
  }

  function goTo(dateStr) {
    const next = weekStartOf(dateStr);
    if (next === start) return;
    setDirection(next > start ? 1 : -1);
    setSelectedDate(dateStr);
  }

  const patchEvent = useCallback((id, patch) => {
    qc.setQueriesData({ queryKey: ["calendar", "events"] }, (old) => (Array.isArray(old) ? old.map((ev) => (ev.id === id ? { ...ev, ...patch } : ev)) : old));
  }, [qc]);

  // Project task events move the task (the bridge then rewrites the event); the rest
  // are calendar events updated in place.
  const persistMove = useCallback(async (event, days) => {
    if (event.sourceModule === "runly.projects") {
      const { projectId } = await runly.projects.getTaskProject(event.sourceEntityId, token);
      const task = await runly.projects.getTask(projectId, event.sourceEntityId, token);
      const move = (value) => (value ? addDays(String(value).slice(0, 10), days) : undefined);
      await runly.projects.rescheduleTask(projectId, event.sourceEntityId, { startDate: move(task.startDate), dueDate: move(task.dueDate) }, token);
      qc.invalidateQueries({ queryKey: ["projects", projectId] });
    } else {
      await runly.calendar.updateEvent(event._baseEventId ?? event.id, shiftedEvent(event, days), token);
    }
    qc.invalidateQueries({ queryKey: ["calendar", "events"] });
  }, [qc, token]);

  const moveEvent = useCallback((event, fromDate, toDate) => {
    const days = daysBetween(fromDate, toDate);
    if (!days) return;
    patchEvent(event.id, shiftedEvent(event, days));
    const label = new Date(`${toDate}T12:00:00`).toLocaleDateString("es-MX", { weekday: "short", day: "numeric" });
    persistMove(event, days)
      .then(() => toast(`«${event.title}» movido al ${label}`, {
        action: { label: "Deshacer", onClick: () => { patchEvent(event.id, { startAt: event.startAt, endAt: event.endAt }); persistMove({ ...event, ...shiftedEvent(event, days) }, -days).catch(() => {}); } },
        duration: 6000,
      }))
      .catch((error) => {
        qc.invalidateQueries({ queryKey: ["calendar", "events"] });
        toast.error("No se pudo mover el evento", { description: error?.message });
      });
  }, [patchEvent, persistMove, qc]);

  const { drag, onPointerDown, wasDrag } = useDayDrag({ onDrop: moveEvent });

  function openEvent(event) {
    if (wasDrag()) return;
    onEventClick(event);
  }

  function onGridPointerDown(e) {
    swipe.current = { x: e.clientX, y: e.clientY, t: Date.now() };
  }
  function onGridPointerUp(e) {
    const from = swipe.current;
    swipe.current = null;
    if (!from || drag) return;
    const dx = e.clientX - from.x;
    const dy = e.clientY - from.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && Date.now() - from.t < 800) {
      swipedAt.current = Date.now();
      setDirection(dx < 0 ? 1 : -1);
      if (dx < 0) navigateNext(); else navigatePrev();
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5">
      <div
        key={start}
        onPointerDown={onGridPointerDown}
        onPointerUp={onGridPointerUp}
        onClickCapture={(e) => { if (Date.now() - swipedAt.current < 300) { e.preventDefault(); e.stopPropagation(); } }}
        className={cx(
          "grid touch-pan-y grid-cols-2 grid-rows-[repeat(3,9rem)_12.5rem] gap-1.5 pb-20",
          direction > 0 && "animate-in fade-in slide-in-from-right-8 duration-200",
          direction < 0 && "animate-in fade-in slide-in-from-left-8 duration-200",
        )}
      >
        {days.map((dateStr, i) => {
          const { allDay, timed } = byDay.get(dateStr) ?? { allDay: [], timed: [] };
          const list = [...allDay, ...timed];
          const visible = list.slice(0, 3);
          const isToday = dateStr === today;
          const isPast = dateStr < today;
          const dropTarget = drag?.over === dateStr;
          return (
            <div
              key={dateStr}
              data-drop-day={dateStr}
              role="button"
              tabIndex={0}
              aria-label={`${WEEKDAYS[i]} ${Number(dateStr.slice(8))}, ${list.length} ${list.length === 1 ? "evento" : "eventos"}`}
              onClick={() => onDayClick(dateStr)}
              onKeyDown={(e) => { if (e.key === "Enter") onDayClick(dateStr); }}
              className={cx(
                "flex min-h-0 min-w-0 cursor-pointer flex-col gap-1 overflow-hidden rounded-md border p-1.5 transition-colors",
                dropTarget ? "border-violet-500 bg-violet-500/10 ring-2 ring-violet-500/40" : "border-[hsl(var(--border))] bg-[hsl(var(--card))]",
                isPast && !dropTarget && "bg-[hsl(var(--muted))]/20",
              )}
            >
              <div className="flex shrink-0 items-center gap-1.5">
                <span className={cx("text-[11px] font-medium uppercase", isToday ? "text-violet-600" : "text-[hsl(var(--muted-foreground))]")}>{WEEKDAYS[i]}</span>
                <span className={cx("flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-sm font-semibold", isToday ? "bg-violet-600 text-white" : isPast ? "text-[hsl(var(--muted-foreground))]" : "")}>{Number(dateStr.slice(8))}</span>
                <button
                  type="button"
                  aria-label={`Nuevo evento el ${WEEKDAYS[i]} ${Number(dateStr.slice(8))}`}
                  onClick={(e) => { e.stopPropagation(); onNewEvent(dateStr); }}
                  className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]"
                >
                  <Plus size={14} aria-hidden />
                </button>
              </div>
              <div className="flex min-h-0 flex-col gap-0.5">
                {visible.map((ev) => (
                  <EventChip key={`${ev.id}-${ev.startAt}`} event={ev} dateStr={dateStr} dragging={drag?.item.id === ev.id} onPointerDown={onPointerDown} onOpen={openEvent} />
                ))}
                {list.length > visible.length && <span className="px-1 text-[11px] text-[hsl(var(--muted-foreground))]">+{list.length - visible.length} más</span>}
              </div>
            </div>
          );
        })}
        <WeekGridWidget
          mode={widgetMode}
          onModeChange={setWidgetMode}
          weekStart={start}
          today={today}
          busyDays={busyDays}
          upcoming={upcoming}
          summary={weekSummary(byDay)}
          onPickDate={goTo}
          onEventClick={onEventClick}
        />
      </div>

      {drag && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-50 max-w-[14rem] -translate-x-1/2 -translate-y-[140%] truncate rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2.5 py-1.5 text-xs font-medium shadow-xl"
          style={{ left: Math.min(Math.max(drag.x, 96), window.innerWidth - 96), top: drag.y, borderLeft: `3px solid ${colorOf(drag.item)}` }}
        >
          {drag.item.title}
        </div>
      )}
    </div>
  );
}
