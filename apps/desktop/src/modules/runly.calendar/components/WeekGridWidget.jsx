// Eighth cell of the phone week grid: a card that rotates between a month calendar
// (jump to any week), the next upcoming events and a summary of the week. Swipe sideways
// inside it or tap the dots to switch; the choice is remembered per viewer.
import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { monthCells, weekStartOf } from "../lib/week-grid";

export const WIDGET_MODES = [
  { key: "month", label: "Mes" },
  { key: "next", label: "Próximos" },
  { key: "summary", label: "Resumen" },
];
const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const cx = (...parts) => parts.filter(Boolean).join(" ");
const colorOf = (ev) => ev.color || ev.calendar?.color || "#6B46C1";

function MonthPanel({ weekStart, today, busyDays, onPickDate }) {
  const anchor = new Date(`${weekStart}T12:00:00`);
  anchor.setDate(anchor.getDate() + 3);
  const [view, setView] = useState({ year: anchor.getFullYear(), month: anchor.getMonth() });
  const shift = (step) => setView(({ year, month }) => {
    const next = month + step;
    return { year: year + Math.floor(next / 12), month: ((next % 12) + 12) % 12 };
  });
  const cells = monthCells(view.year, view.month);
  const monthKey = `${view.year}-${String(view.month + 1).padStart(2, "0")}`;
  const rows = cells[35].startsWith(monthKey) ? 6 : 5;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between">
        <button type="button" aria-label="Mes anterior" onClick={() => shift(-1)} className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-[hsl(var(--muted))]"><ChevronLeft size={14} aria-hidden /></button>
        <span className="truncate text-xs font-semibold">{MONTHS[view.month]} {view.year}</span>
        <button type="button" aria-label="Mes siguiente" onClick={() => shift(1)} className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-[hsl(var(--muted))]"><ChevronRight size={14} aria-hidden /></button>
      </div>
      <div className="grid grid-cols-7 content-start text-center text-[10px] leading-none">
        {["D", "L", "M", "M", "J", "V", "S"].map((letter, i) => <span key={i} className="py-0.5 text-[hsl(var(--muted-foreground))]">{letter}</span>)}
        {cells.slice(0, rows * 7).map((dateStr) => (
          <button
            key={dateStr}
            type="button"
            onClick={() => onPickDate(dateStr)}
            aria-label={`Ir a la semana del ${Number(dateStr.slice(8))} de ${MONTHS[Number(dateStr.slice(5, 7)) - 1]}`}
            className={cx("relative flex h-[19px] items-center justify-center tabular-nums", weekStartOf(dateStr) === weekStart && "bg-violet-500/15", !dateStr.startsWith(monthKey) && "text-[hsl(var(--muted-foreground))]/50")}
          >
            <span className={cx("flex h-4 w-4 items-center justify-center rounded-full", dateStr === today && "bg-violet-600 font-semibold text-white")}>{Number(dateStr.slice(8))}</span>
            {busyDays.has(dateStr) && dateStr !== today && <span aria-hidden className="absolute bottom-0 h-[3px] w-[3px] rounded-full bg-violet-500" />}
          </button>
        ))}
      </div>
    </div>
  );
}

function relative(startAt) {
  const minutes = Math.round((new Date(startAt) - Date.now()) / 60_000);
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `en ${minutes} min`;
  if (minutes < 24 * 60) return `en ${Math.round(minutes / 60)} h`;
  return new Date(startAt).toLocaleDateString("es-MX", { weekday: "short", day: "numeric" });
}

function NextPanel({ upcoming, onEventClick }) {
  if (upcoming.length === 0) return <p className="flex h-full items-center justify-center text-center text-xs text-[hsl(var(--muted-foreground))]">Nada próximo en los siguientes días</p>;
  return (
    <ul className="flex min-h-0 flex-col gap-1">
      {upcoming.slice(0, 3).map((ev) => (
        <li key={`${ev.id}-${ev.startAt}`}>
          <button type="button" onClick={() => onEventClick(ev)} className="flex w-full min-w-0 items-start gap-1.5 rounded-sm px-1 py-0.5 text-left hover:bg-[hsl(var(--muted))]">
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: colorOf(ev) }} />
            <span className="min-w-0">
              <span className="block truncate text-xs font-medium">{ev.title}</span>
              <span className="block text-[10px] text-[hsl(var(--muted-foreground))]">{relative(ev.startAt)}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function SummaryPanel({ summary }) {
  const busiestLabel = summary.busiest
    ? new Date(`${summary.busiest.dateStr}T12:00:00`).toLocaleDateString("es-MX", { weekday: "long" })
    : null;
  return (
    <div className="flex h-full flex-col justify-center gap-1.5">
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-semibold tabular-nums">{summary.total}</span>
        <span className="text-[11px] text-[hsl(var(--muted-foreground))]">{summary.total === 1 ? "evento" : "eventos"} esta semana</span>
      </div>
      <p className="text-[11px] text-[hsl(var(--muted-foreground))]">{summary.hours} h en reuniones con horario</p>
      {busiestLabel && <p className="text-[11px] text-[hsl(var(--muted-foreground))]">Día más cargado: <span className="font-medium text-[hsl(var(--foreground))]">{busiestLabel}</span></p>}
    </div>
  );
}

export default function WeekGridWidget({ mode, onModeChange, weekStart, today, busyDays, upcoming, summary, onPickDate, onEventClick }) {
  const swipe = useRef(null);
  const index = Math.max(0, WIDGET_MODES.findIndex((m) => m.key === mode));
  const step = (delta) => onModeChange(WIDGET_MODES[(index + delta + WIDGET_MODES.length) % WIDGET_MODES.length].key);

  // Horizontal swipes inside the widget switch its mode, not the week.
  const onPointerDown = (e) => { e.stopPropagation(); swipe.current = { x: e.clientX, y: e.clientY }; };
  const onPointerUp = (e) => {
    e.stopPropagation();
    const from = swipe.current;
    swipe.current = null;
    if (!from) return;
    const dx = e.clientX - from.x;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(e.clientY - from.y) * 1.5) step(dx < 0 ? 1 : -1);
  };

  return (
    <section
      aria-label={`Widget: ${WIDGET_MODES[index].label}`}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      className="flex min-h-0 min-w-0 flex-col gap-1 overflow-hidden rounded-md border border-violet-500/25 bg-linear-to-br from-violet-600/15 via-[hsl(var(--card))] to-sky-500/10 p-1.5 shadow-lg shadow-black/10"
    >
      <div className="flex shrink-0 items-center justify-between gap-1">
        <span className="truncate text-[11px] font-medium uppercase text-[hsl(var(--muted-foreground))]">{WIDGET_MODES[index].label}</span>
        <div role="tablist" aria-label="Vista del widget" className="flex items-center">
          {WIDGET_MODES.map((m, i) => (
            <button key={m.key} type="button" role="tab" aria-selected={i === index} aria-label={m.label} onClick={() => onModeChange(m.key)} className="flex h-6 w-5 items-center justify-center">
              <span className={cx("h-1.5 rounded-full transition-all", i === index ? "w-3 bg-violet-600" : "w-1.5 bg-[hsl(var(--muted-foreground))]/40")} />
            </button>
          ))}
        </div>
      </div>
      <div key={mode} className="min-h-0 flex-1 animate-in fade-in duration-200">
        {mode === "month" && <MonthPanel key={weekStart.slice(0, 7)} weekStart={weekStart} today={today} busyDays={busyDays} onPickDate={onPickDate} />}
        {mode === "next" && <NextPanel upcoming={upcoming} onEventClick={onEventClick} />}
        {mode === "summary" && <SummaryPanel summary={summary} />}
      </div>
    </section>
  );
}
