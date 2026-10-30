// The eighth cell of the "Semana" grid: a small card that rotates between a month
// calendar (jump to any week), the open tasks that need a date (hold one and drop it on
// a day) and the week's progress. Swipe sideways or tap the dots to switch.
import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { taskSpan } from "../../lib/ganttLayout";
import { MONTH_NAMES, dayLabel, monthGrid, weekStart } from "../../lib/weekLayout";
import { TaskChip } from "./WeekDayCell";

export const WIDGET_MODES = [
  { key: "month", label: "Mes" },
  { key: "pending", label: "Pendientes" },
  { key: "progress", label: "Avance" },
];
const cx = (...parts) => parts.filter(Boolean).join(" ");

function MonthPanel({ anchorDay, today, start, busyDays, onPickDay }) {
  const anchor = dayLabel(anchorDay);
  const [view, setView] = useState({ year: anchor.year, month: anchor.month });
  const shift = (step) => setView(({ year, month }) => {
    const next = month + step;
    return { year: year + Math.floor(next / 12), month: ((next % 12) + 12) % 12 };
  });
  const grid = monthGrid(view.year, view.month);
  const rows = grid[35] && dayLabel(grid[35]).month !== view.month ? 5 : 6;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between">
        <button type="button" aria-label="Mes anterior" onClick={() => shift(-1)} className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-[hsl(var(--muted))]"><ChevronLeft size={14} aria-hidden /></button>
        <span className="truncate text-xs font-semibold">{MONTH_NAMES[view.month]} {view.year}</span>
        <button type="button" aria-label="Mes siguiente" onClick={() => shift(1)} className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-[hsl(var(--muted))]"><ChevronRight size={14} aria-hidden /></button>
      </div>
      <div className="grid flex-1 grid-cols-7 content-start text-center text-[10px] leading-none">
        {["L", "M", "M", "J", "V", "S", "D"].map((letter, i) => <span key={i} className="py-0.5 text-[hsl(var(--muted-foreground))]">{letter}</span>)}
        {grid.slice(0, rows * 7).map((day) => {
          const label = dayLabel(day);
          const inMonth = label.month === view.month;
          const inWeek = weekStart(day) === start;
          return (
            <button
              key={day}
              type="button"
              onClick={() => onPickDay(day)}
              aria-label={`Ir a la semana del ${label.number} de ${MONTH_NAMES[label.month]}`}
              className={cx("relative flex h-[18px] items-center justify-center tabular-nums [@media(pointer:coarse)]:h-[20px]", inWeek && "bg-(--brand-primary)/15", !inMonth && "text-[hsl(var(--muted-foreground))]/50")}
            >
              <span className={cx("flex h-4 w-4 items-center justify-center rounded-full", day === today && "bg-(--brand-primary) font-semibold text-white")}>{label.number}</span>
              {busyDays.has(day) && day !== today && <span aria-hidden className="absolute bottom-0 h-[3px] w-[3px] rounded-full bg-(--brand-primary)" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PendingPanel({ pending, draggingId, onChipPointerDown, onOpenTask, onShowAll }) {
  const list = [...pending.overdue, ...pending.undated];
  return (
    <div className="flex h-full min-h-0 flex-col gap-1">
      <div className="flex shrink-0 gap-1.5 text-[11px]">
        <span className={cx("rounded-sm px-1.5 py-0.5", pending.overdue.length ? "bg-red-500/15 text-red-600 dark:text-red-400" : "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]")}>{pending.overdue.length} atrasadas</span>
        <span className="rounded-sm bg-[hsl(var(--muted))] px-1.5 py-0.5 text-[hsl(var(--muted-foreground))]">{pending.undated.length} sin fecha</span>
      </div>
      {list.length === 0 ? (
        <p className="flex flex-1 items-center justify-center text-center text-xs text-[hsl(var(--muted-foreground))]">Todo tiene fecha y va a tiempo</p>
      ) : (
        <>
          <div className="flex min-h-0 flex-col gap-0.5 overflow-hidden">
            {list.slice(0, 2).map((task) => (
              <TaskChip key={task.id} task={task} day={null} dragging={draggingId === task.id} onPointerDown={onChipPointerDown} onOpen={onOpenTask} compact />
            ))}
          </div>
          <button type="button" onClick={onShowAll} title="Mantén presionada una tarea y suéltala en un día para programarla" className="mt-auto shrink-0 self-start rounded-md px-1 py-0.5 text-[11px] font-medium text-(--brand-primary) hover:underline">Ver todas ({list.length})</button>
        </>
      )}
    </div>
  );
}

function ProgressPanel({ progress }) {
  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-2">
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-semibold tabular-nums">{progress.percent}%</span>
        <span className="text-[11px] text-[hsl(var(--muted-foreground))]">de la semana</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[hsl(var(--muted))]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent} aria-label="Avance de la semana">
        <div className="h-full rounded-full bg-(--brand-primary) transition-[width] duration-500" style={{ width: `${progress.percent}%` }} />
      </div>
      <p className="text-[11px] text-[hsl(var(--muted-foreground))]">{progress.done} de {progress.total} completadas</p>
      <p className="text-[11px] text-[hsl(var(--muted-foreground))]">{progress.dueThisWeek} por entregar esta semana</p>
    </div>
  );
}

export default function WeekWidget({ mode, onModeChange, start, today, tasks, pending, progress, draggingId, onChipPointerDown, onOpenTask, onPickDay, onShowPending }) {
  const swipe = useRef(null);
  const index = Math.max(0, WIDGET_MODES.findIndex((m) => m.key === mode));
  const step = (delta) => onModeChange(WIDGET_MODES[(index + delta + WIDGET_MODES.length) % WIDGET_MODES.length].key);

  const busyDays = new Set();
  for (const task of tasks) {
    const span = taskSpan(task);
    if (!span || task.status?.isDone || span.end - span.start > 62) continue;
    for (let day = span.start; day <= span.end; day += 1) busyDays.add(day);
  }

  // The widget owns horizontal swipes inside it (the grid's swipe changes week).
  const onPointerDown = (e) => { e.stopPropagation(); swipe.current = { x: e.clientX, y: e.clientY }; };
  const onPointerUp = (e) => {
    e.stopPropagation();
    const from = swipe.current;
    swipe.current = null;
    if (!from || draggingId) return;
    const dx = e.clientX - from.x;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(e.clientY - from.y) * 1.5) step(dx < 0 ? 1 : -1);
  };

  return (
    <section
      aria-label={`Widget: ${WIDGET_MODES[index].label}`}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      className="flex min-h-0 min-w-0 flex-col gap-1 overflow-hidden rounded-md border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] p-1.5"
    >
      <div className="flex shrink-0 items-center justify-between gap-1">
        <span className="truncate text-[11px] font-medium uppercase text-[hsl(var(--muted-foreground))]">{WIDGET_MODES[index].label}</span>
        <div role="tablist" aria-label="Vista del widget" className="flex items-center">
          {WIDGET_MODES.map((m, i) => (
            <button key={m.key} type="button" role="tab" aria-selected={i === index} aria-label={m.label} onClick={() => onModeChange(m.key)} className="flex h-6 w-5 items-center justify-center">
              <span className={cx("h-1.5 rounded-full transition-all", i === index ? "w-3 bg-(--brand-primary)" : "w-1.5 bg-[hsl(var(--muted-foreground))]/40")} />
            </button>
          ))}
        </div>
      </div>
      <div key={mode} className="min-h-0 flex-1 animate-in fade-in duration-200">
        {mode === "month" && <MonthPanel key={`${dayLabel(start + 3).year}-${dayLabel(start + 3).month}`} anchorDay={start + 3} today={today} start={start} busyDays={busyDays} onPickDay={onPickDay} />}
        {mode === "pending" && <PendingPanel pending={pending} draggingId={draggingId} onChipPointerDown={onChipPointerDown} onOpenTask={onOpenTask} onShowAll={onShowPending} />}
        {mode === "progress" && <ProgressPanel progress={progress} />}
      </div>
    </section>
  );
}
