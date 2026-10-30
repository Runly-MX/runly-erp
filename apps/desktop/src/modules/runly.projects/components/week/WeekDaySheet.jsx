// Full list for one day of the "Semana" view (or for the pending tasks): tap a row to
// open the task, tap the circle to complete it, move it a day back/forward, or add a task
// on that day. Bottom sheet on phones, side panel on desktop.
import { CalendarPlus, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { Button, EmptyState, Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@runly/ui";
import { taskSpan } from "../../lib/ganttLayout";

const cx = (...parts) => parts.filter(Boolean).join(" ");

function assigneeName(task) {
  const user = task.assignee;
  return user ? [user.firstName, user.lastName].filter(Boolean).join(" ") : "";
}

function TaskRow({ task, day, today, onOpen, onToggleDone, onMove }) {
  const done = Boolean(task.status?.isDone);
  const span = taskSpan(task);
  const color = task.status?.color ?? "#6366f1";
  return (
    <li className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-[hsl(var(--muted))]/40">
      <button
        type="button"
        onClick={() => onToggleDone(task)}
        aria-label={done ? `Reabrir «${task.title}»` : `Completar «${task.title}»`}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
      >
        <span className={cx("flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors", done ? "border-transparent text-white" : "")} style={done ? { backgroundColor: color } : { borderColor: color }}>
          {done && <Check size={12} strokeWidth={3} aria-hidden />}
        </span>
      </button>
      <button type="button" onClick={() => onOpen(task)} className="min-w-0 flex-1 py-1 text-left">
        <span className={cx("block truncate text-sm font-medium", done && "text-[hsl(var(--muted-foreground))] line-through")}>{task.title}</span>
        <span className="block truncate text-xs text-[hsl(var(--muted-foreground))]">
          {[task.status?.name, assigneeName(task), span && span.end > span.start ? `${span.end - span.start + 1} días` : null].filter(Boolean).join(" · ")}
        </span>
      </button>
      {span && day != null && (
        <div className="flex shrink-0">
          <button type="button" aria-label="Mover un día antes" onClick={() => onMove(task, day, day - 1)} className="flex h-10 w-9 items-center justify-center rounded-md text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]"><ChevronLeft size={16} aria-hidden /></button>
          <button type="button" aria-label="Mover un día después" onClick={() => onMove(task, day, day + 1)} className="flex h-10 w-9 items-center justify-center rounded-md text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]"><ChevronRight size={16} aria-hidden /></button>
        </div>
      )}
      {day == null && !done && (
        <button type="button" onClick={() => onMove(task, span ? span.end : today, today)} className="h-9 shrink-0 rounded-md border border-[hsl(var(--border))] px-3 text-xs font-medium hover:bg-[hsl(var(--muted))]">
          Hoy
        </button>
      )}
    </li>
  );
}

export default function WeekDaySheet({ open, onOpenChange, title, description, day, today, tasks, onOpenTask, onToggleDone, onMove, onAdd }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="shrink-0 border-b border-[hsl(var(--border))] px-4 py-3">
          <SheetTitle className="first-letter:uppercase">{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {tasks.length === 0 ? (
            day == null
              ? <EmptyState title="Todo al día" description="No hay tareas atrasadas ni sin fecha." />
              : <EmptyState title="Día libre" description="No hay tareas para este día." />
          ) : (
            <ul className="space-y-0.5">
              {tasks.map((task) => <TaskRow key={task.id} task={task} day={day} today={today} onOpen={onOpenTask} onToggleDone={onToggleDone} onMove={onMove} />)}
            </ul>
          )}
        </div>
        {onAdd && (
          <SheetFooter className="mt-0 shrink-0 border-t border-[hsl(var(--border))] px-4 py-3">
            <Button className="w-full" onClick={onAdd}>
              <CalendarPlus size={15} className="mr-2" aria-hidden />Nueva tarea este día
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
