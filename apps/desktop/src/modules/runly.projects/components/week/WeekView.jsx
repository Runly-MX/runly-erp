// "Semana" view of a project: the seven days of a week plus a rotating widget cell
// (2x4 on phones, 4x2 from md). Swipe the grid sideways to change week, tap a day for its
// full list, tap a chip to open the task, hold a chip and drop it on another day to move
// it (every date of the task shifts by the same days; an undated task gets that day).
import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarOff, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, LoadingState, useIsMobile } from "@runly/ui";
import { toLocalIso } from "../../../../lib/localDate.js";
import { useGantt, useRescheduleTask, useStatuses, useUpdateTask } from "../../hooks/useProjectsData";
import { dayNumber, dayText, taskSpan } from "../../lib/ganttLayout";
import { dayLabel, movedDates, pendingTasks, tasksOnDay, weekDays, weekProgress, weekRangeLabel, weekStart } from "../../lib/weekLayout";
import TaskFormModal from "../TaskFormModal.jsx";
import WeekDayCell from "./WeekDayCell";
import WeekDaySheet from "./WeekDaySheet";
import WeekWidget, { WIDGET_MODES } from "./WeekWidget";
import { useTaskDrag } from "./useTaskDrag";

const WIDGET_KEY = "runly.projects.weekWidget";
const readWidgetMode = () => {
  try {
    const value = localStorage.getItem(WIDGET_KEY);
    return WIDGET_MODES.some((m) => m.key === value) ? value : "month";
  } catch { return "month"; }
};
const noonIso = (text) => (text ? `${text}T12:00:00.000Z` : null);
const dateTextOf = (value) => (value ? dayText(dayNumber(value)) : null);

export default function WeekView({ projectId, onTaskClick }) {
  const { data, isLoading } = useGantt(projectId);
  const { data: statusesData } = useStatuses(projectId);
  const statuses = statusesData?.data ?? statusesData ?? [];
  const reschedule = useRescheduleTask(projectId);
  const updateTask = useUpdateTask(projectId);
  const qc = useQueryClient();
  const isMobile = useIsMobile();

  const today = dayNumber(toLocalIso());
  const [start, setStart] = useState(() => weekStart(today));
  const [direction, setDirection] = useState(0);
  const [widgetMode, setWidgetModeState] = useState(readWidgetMode);
  const [sheet, setSheet] = useState(null); // { day } | { pending: true }
  const [newTaskDay, setNewTaskDay] = useState(null);
  const swipe = useRef(null);
  const swipedAt = useRef(0);

  const tasks = data?.tasks ?? [];
  const days = weekDays(start);
  const pending = pendingTasks(tasks, today);
  const progress = weekProgress(tasks, start);

  function setWidgetMode(mode) {
    setWidgetModeState(mode);
    try { localStorage.setItem(WIDGET_KEY, mode); } catch { /* per-viewer convenience only */ }
  }

  function goToWeek(next) {
    if (next === start) return;
    setDirection(next > start ? 1 : -1);
    setStart(next);
  }

  // Optimistic write into the shared Gantt cache so a dropped chip lands at once.
  const patchTask = useCallback((taskId, patch) => {
    qc.setQueryData(["projects", projectId, "gantt"], (old) => old && { ...old, tasks: old.tasks.map((t) => (t.id === taskId ? { ...t, ...patch } : t)) });
  }, [qc, projectId]);

  const applyDates = useCallback((task, dates) => {
    const patch = {};
    if (dates.startDate !== undefined) patch.startDate = noonIso(dates.startDate);
    if (dates.dueDate !== undefined) patch.dueDate = noonIso(dates.dueDate);
    patchTask(task.id, patch);
    return reschedule.mutateAsync({ taskId: task.id, ...dates });
  }, [patchTask, reschedule]);

  const moveTask = useCallback((task, fromDay, toDay) => {
    if (fromDay === toDay && taskSpan(task)) return;
    const before = { startDate: dateTextOf(task.startDate), dueDate: dateTextOf(task.dueDate) };
    const dates = movedDates(task, toDay - (fromDay ?? toDay), toDay);
    const label = dayLabel(toDay);
    applyDates(task, dates).then(() => {
      toast(`«${task.title}» ahora el ${label.weekday.toLowerCase()} ${label.number}`, {
        action: { label: "Deshacer", onClick: () => applyDates(task, before).catch(() => {}) },
        duration: 6000,
      });
    }).catch(() => {});
  }, [applyDates]);

  const { drag, onPointerDown: onChipPointerDown, wasDrag } = useTaskDrag({ onDrop: moveTask });

  function openTask(task) {
    if (wasDrag()) return;
    setSheet(null);
    onTaskClick?.(task.id);
  }

  function toggleDone(task) {
    const doneStatus = statuses.find((s) => s.isDone);
    const openStatus = statuses.find((s) => s.isDefault && !s.isDone) ?? statuses.find((s) => !s.isDone);
    const target = task.status?.isDone ? openStatus : doneStatus;
    if (!target) { toast.error("Este proyecto no tiene un estado de «completado»"); return; }
    navigator.vibrate?.(8);
    patchTask(task.id, { statusId: target.id, status: { id: target.id, name: target.name, color: target.color, isDone: target.isDone } });
    updateTask.mutate({ taskId: task.id, statusId: target.id }, { onError: () => toast.error("No se pudo cambiar el estado") });
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
      goToWeek(start + (dx < 0 ? 7 : -7));
    }
  }

  if (isLoading) return <LoadingState />;
  if (tasks.length === 0) return <EmptyState icon={CalendarOff} title="Sin tareas" description="Este proyecto no tiene tareas todavía." />;

  const isCurrentWeek = start === weekStart(today);
  const sheetDay = sheet?.day ?? null;
  const sheetTasks = sheet?.pending ? [...pending.overdue, ...pending.undated] : sheetDay != null ? tasksOnDay(tasks, sheetDay) : [];
  const sheetLabel = sheetDay != null ? dayLabel(sheetDay) : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-[hsl(var(--border))] px-2 py-1.5">
        <button type="button" aria-label="Semana anterior" onClick={() => goToWeek(start - 7)} className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-[hsl(var(--muted))]"><ChevronLeft size={18} aria-hidden /></button>
        <button type="button" aria-label="Semana siguiente" onClick={() => goToWeek(start + 7)} className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-[hsl(var(--muted))]"><ChevronRight size={18} aria-hidden /></button>
        <h2 className="min-w-0 flex-1 truncate px-1 text-sm font-semibold">{weekRangeLabel(start)}</h2>
        <p className="hidden text-xs text-[hsl(var(--muted-foreground))] lg:block">Arrastra una tarea a otro día · desliza para cambiar de semana</p>
        <button type="button" disabled={isCurrentWeek} onClick={() => goToWeek(weekStart(today))} className="h-9 rounded-md border border-[hsl(var(--border))] px-3 text-xs font-medium hover:bg-[hsl(var(--muted))] disabled:opacity-40">Hoy</button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5 sm:p-2">
        <div
          key={start}
          onPointerDown={onGridPointerDown}
          onPointerUp={onGridPointerUp}
          onClickCapture={(e) => { if (Date.now() - swipedAt.current < 300) { e.preventDefault(); e.stopPropagation(); } }}
          className={[
            "grid touch-pan-y grid-cols-2 grid-rows-[repeat(3,9rem)_12rem] gap-1.5 pb-20 md:min-h-full md:grid-cols-4 md:grid-rows-[repeat(2,minmax(11rem,1fr))] md:pb-0",
            direction > 0 ? "animate-in fade-in slide-in-from-right-8 duration-200" : direction < 0 ? "animate-in fade-in slide-in-from-left-8 duration-200" : "",
          ].join(" ")}
        >
          {days.map((day) => (
            <WeekDayCell
              key={day}
              day={day}
              today={today}
              tasks={tasksOnDay(tasks, day)}
              maxVisible={isMobile ? 3 : 7}
              dropTarget={drag?.overDay === day}
              draggingId={drag?.task.id}
              onOpenDay={(d) => setSheet({ day: d })}
              onOpenTask={openTask}
              onChipPointerDown={onChipPointerDown}
              onQuickAdd={setNewTaskDay}
            />
          ))}
          <WeekWidget
            mode={widgetMode}
            onModeChange={setWidgetMode}
            start={start}
            today={today}
            tasks={tasks}
            pending={pending}
            progress={progress}
            draggingId={drag?.task.id}
            onChipPointerDown={onChipPointerDown}
            onOpenTask={openTask}
            onPickDay={(day) => goToWeek(weekStart(day))}
            onShowPending={() => setSheet({ pending: true })}
          />
        </div>
      </div>

      {drag && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-50 max-w-[14rem] -translate-x-1/2 -translate-y-[140%] truncate rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2.5 py-1.5 text-xs font-medium shadow-xl"
          style={{ left: Math.min(Math.max(drag.x, 96), window.innerWidth - 96), top: drag.y, borderLeft: `3px solid ${drag.task.status?.color ?? "#6366f1"}` }}
        >
          {drag.task.title}
        </div>
      )}

      <WeekDaySheet
        open={Boolean(sheet)}
        onOpenChange={(open) => { if (!open) setSheet(null); }}
        title={sheet?.pending ? "Pendientes" : sheetLabel ? new Date(sheetDay * 86_400_000).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }) : ""}
        description={sheet?.pending
          ? `${pending.overdue.length} atrasadas · ${pending.undated.length} sin fecha`
          : `${sheetTasks.length} ${sheetTasks.length === 1 ? "tarea" : "tareas"}`}
        day={sheetDay}
        today={today}
        tasks={sheetTasks}
        onOpenTask={openTask}
        onToggleDone={toggleDone}
        onMove={moveTask}
        onAdd={sheetDay != null ? () => { setNewTaskDay(sheetDay); setSheet(null); } : null}
      />

      <TaskFormModal
        open={newTaskDay != null}
        onOpenChange={(open) => { if (!open) setNewTaskDay(null); }}
        projectId={projectId}
        defaultDueDate={newTaskDay != null ? dayText(newTaskDay) : null}
      />
    </div>
  );
}
