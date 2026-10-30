// One day of the "Semana" grid: weekday, number and the first tasks that cover it.
// Tapping the cell opens the full day; tapping a chip opens the task; holding a chip
// lifts it to move it to another day.
import { Plus } from "lucide-react";
import { taskSpan } from "../../lib/ganttLayout";
import { dayLabel } from "../../lib/weekLayout";

const cx = (...parts) => parts.filter(Boolean).join(" ");

export function TaskChip({ task, day, dragging, onPointerDown, onOpen, compact = false }) {
  const span = taskSpan(task);
  const continuesLeft = span && day != null && span.start < day;
  const continuesRight = span && day != null && span.end > day;
  const color = task.status?.color ?? "#6366f1";
  return (
    <div
      role="button"
      tabIndex={0}
      onPointerDown={(e) => onPointerDown?.(e, task, day)}
      onClick={(e) => { e.stopPropagation(); onOpen(task); }}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onOpen(task); } }}
      onContextMenu={(e) => e.preventDefault()}
      title={task.title}
      className={cx(
        "flex min-w-0 cursor-pointer select-none items-center gap-1.5 border-l-[3px] bg-[hsl(var(--muted))]/60 px-1.5 text-left text-xs transition-opacity [-webkit-touch-callout:none] hover:bg-[hsl(var(--muted))]",
        compact ? "py-0.5" : "py-1 [@media(pointer:coarse)]:py-1.5",
        continuesLeft ? "rounded-l-none" : "rounded-l-sm",
        continuesRight ? "rounded-r-none" : "rounded-r-sm",
        dragging && "opacity-30",
      )}
      style={{ borderLeftColor: color }}
    >
      <span className={cx("truncate", task.status?.isDone && "text-[hsl(var(--muted-foreground))] line-through")}>{task.title}</span>
    </div>
  );
}

export default function WeekDayCell({ day, today, tasks, maxVisible, dropTarget, draggingId, onOpenDay, onOpenTask, onChipPointerDown, onQuickAdd }) {
  const label = dayLabel(day);
  const isToday = day === today;
  const isPast = day < today;
  const visible = tasks.slice(0, maxVisible);
  const hidden = tasks.length - visible.length;
  const open = tasks.filter((task) => !task.status?.isDone).length;

  return (
    <div
      data-week-day={day}
      role="button"
      tabIndex={0}
      aria-label={`${label.weekday} ${label.number}, ${tasks.length} ${tasks.length === 1 ? "tarea" : "tareas"}`}
      onClick={() => onOpenDay(day)}
      onKeyDown={(e) => { if (e.key === "Enter") onOpenDay(day); }}
      className={cx(
        "group/day relative flex min-h-0 min-w-0 cursor-pointer flex-col gap-1 overflow-hidden rounded-md border bg-[hsl(var(--card))] p-1.5 transition-colors",
        dropTarget ? "border-(--brand-primary) bg-(--brand-primary)/10 ring-2 ring-(--brand-primary)/40" :"border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]/30",
        isPast && !dropTarget && "bg-[hsl(var(--muted))]/20",
      )}
    >
      <div className="flex shrink-0 items-center gap-1.5">
        <span className={cx("text-[11px] font-medium uppercase", isToday ? "text-(--brand-primary)" : "text-[hsl(var(--muted-foreground))]")}>{label.weekday}</span>
        <span className={cx("flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-sm font-semibold", isToday ? "bg-(--brand-primary) text-white" : isPast ? "text-[hsl(var(--muted-foreground))]" : "")}>{label.number}</span>
        {open > 0 && <span className="ml-auto text-[10px] tabular-nums text-[hsl(var(--muted-foreground))]">{open}</span>}
        <button
          type="button"
          aria-label={`Nueva tarea el ${label.weekday} ${label.number}`}
          onClick={(e) => { e.stopPropagation(); onQuickAdd(day); }}
          className={cx("flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))] md:opacity-0 md:group-hover/day:opacity-100 md:focus-visible:opacity-100", open > 0 ? "" : "ml-auto")}
        >
          <Plus size={14} aria-hidden />
        </button>
      </div>
      <div className="flex min-h-0 flex-col gap-0.5">
        {visible.map((task) => (
          <TaskChip key={task.id} task={task} day={day} dragging={draggingId === task.id} onPointerDown={onChipPointerDown} onOpen={onOpenTask} />
        ))}
        {hidden > 0 && <span className="px-1 text-[11px] text-[hsl(var(--muted-foreground))]">+{hidden} más</span>}
      </div>
    </div>
  );
}
