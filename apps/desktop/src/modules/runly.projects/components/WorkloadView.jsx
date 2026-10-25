// Workload of a project: one row per person, one column per week, each cell the hours
// planned (task estimates spread over the working days between their dates) against the
// person's weekly capacity. Click a cell to see its tasks and reassign them (drag a task
// onto another person, or use the selector). Spec
// docs/superpowers/specs/2026-10-26-projects-depth-design.md, section 3.
import { useState } from "react";
import { EmptyState, ErrorState, LoadingState, SelectField, Sheet, SheetContent, SheetHeader, SheetTitle } from "@runly/ui";
import { CalendarOff, Users } from "lucide-react";
import { useProjectMembers, useSetCapacity, useUpdateTask, useWorkload } from "../hooks/useProjectsData";
import { formatDuration, parseDuration } from "../lib/timeFormat";

const nameOf = (user) => [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Sin nombre";
const weekLabel = (week) => new Date(`${week}T12:00:00Z`).toLocaleDateString("es-MX", { day: "numeric", month: "short", timeZone: "UTC" });

// Load against capacity: calm under 80%, amber to 100%, red above.
function tone(ratio) {
  if (ratio > 1) return { bar: "bg-red-500", text: "text-red-600 dark:text-red-400" };
  if (ratio >= 0.8) return { bar: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" };
  return { bar: "bg-(--brand-primary)", text: "text-[hsl(var(--foreground))]" };
}

function Cell({ minutes, capacity, selected, onSelect, label }) {
  if (!minutes) return <button type="button" onClick={onSelect} aria-label={`${label}: sin carga`} className="h-12 w-full cursor-pointer rounded-md text-xs text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]">-</button>;
  const ratio = minutes / capacity;
  const colors = tone(ratio);
  return (
    <button type="button" onClick={onSelect} aria-pressed={selected} aria-label={`${label}: ${formatDuration(minutes)}, ${Math.round(ratio * 100)}% de la capacidad`}
      className={`flex h-12 w-full cursor-pointer flex-col justify-center gap-1 rounded-md px-2 text-left hover:bg-[hsl(var(--muted))] ${selected ? "bg-[hsl(var(--muted))]" : ""}`}>
      <span className={`text-xs font-medium tabular-nums ${colors.text}`}>{formatDuration(minutes)} · {Math.round(ratio * 100)}%</span>
      <span className="block h-1.5 overflow-hidden rounded-full bg-[hsl(var(--border))]"><span className={`block h-full rounded-full ${colors.bar}`} style={{ width: `${Math.min(100, Math.round(ratio * 100))}%` }} /></span>
    </button>
  );
}

function CapacityEditor({ person, onSave }) {
  const [text, setText] = useState("");
  const [editing, setEditing] = useState(false);
  if (!editing) return <button type="button" onClick={() => { setText(formatDuration(person.capacity)); setEditing(true); }} className="cursor-pointer text-xs text-[hsl(var(--muted-foreground))] hover:underline" title="Cambiar la capacidad semanal">{formatDuration(person.capacity)} por semana</button>;
  const commit = () => {
    setEditing(false);
    const minutes = parseDuration(text);
    if (minutes && minutes !== person.capacity) onSave(minutes);
  };
  return <input autoFocus aria-label="Capacidad semanal" value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setEditing(false); }} className="h-7 w-24 rounded-md border border-[hsl(var(--border))] bg-transparent px-2 text-xs" />;
}

export default function WorkloadView({ projectId, userId, onTaskClick }) {
  const { data, isLoading, isError, refetch } = useWorkload(projectId);
  const { data: members = [] } = useProjectMembers(projectId);
  const canManage = members.some((m) => m.userId === userId && m.role === "OWNER");
  const update = useUpdateTask(projectId);
  const capacity = useSetCapacity(projectId);
  const [picked, setPicked] = useState(null); // { userId, week | "unscheduled" }

  if (isLoading) return <LoadingState />;
  if (isError || !data) return <ErrorState title="No se pudo calcular la carga" onRetry={refetch} />;
  if (!data.people.length) return <EmptyState icon={Users} title="Aún no hay personas en el proyecto" description="Agrega miembros y asigna tareas con fechas y estimación para ver su carga." />;

  const person = picked ? data.people.find((p) => p.userId === picked.userId) : null;
  const pickedTasks = person ? (picked.week === "unscheduled" ? person.unscheduled.map((id) => ({ taskId: id })) : person.items[picked.week] ?? []) : [];
  const options = members.map((m) => ({ value: m.userId ?? m.user?.id, label: nameOf(m.user) })).filter((o) => o.value);
  const assign = (taskId, userId) => update.mutate({ taskId, assigneeId: userId });

  return (
    <div className="h-full overflow-auto p-4">
      <div className="min-w-max">
        <div className="grid items-end gap-x-1" style={{ gridTemplateColumns: `14rem repeat(${data.weeks.length}, minmax(7.5rem, 1fr)) 7rem` }}>
          <span />
          {data.weeks.map((week) => <span key={week} className="px-2 pb-2 text-xs font-medium text-[hsl(var(--muted-foreground))]">Semana del {weekLabel(week)}</span>)}
          <span className="px-2 pb-2 text-xs font-medium text-[hsl(var(--muted-foreground))]">Sin fecha</span>
          {data.people.map((p) => (
            <div key={p.userId} className="contents" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { const id = e.dataTransfer.getData("text/task"); if (id) assign(id, p.userId); }}>
              <div className="flex min-w-0 flex-col justify-center border-t border-[hsl(var(--border))] py-1 pr-2">
                <span className="truncate text-sm font-medium">{nameOf(p.user)}</span>
                {canManage ? <CapacityEditor person={p} onSave={(minutes) => capacity.mutate({ userId: p.userId, weeklyCapacityMinutes: minutes })} /> : <span className="text-xs text-[hsl(var(--muted-foreground))]">{formatDuration(p.capacity)} por semana</span>}
              </div>
              {data.weeks.map((week) => (
                <div key={week} className="border-t border-[hsl(var(--border))] py-1">
                  <Cell minutes={p.byWeek[week]} capacity={p.capacity} label={`${nameOf(p.user)}, semana del ${weekLabel(week)}`} selected={picked?.userId === p.userId && picked.week === week} onSelect={() => setPicked({ userId: p.userId, week })} />
                </div>
              ))}
              <div className="border-t border-[hsl(var(--border))] py-1">
                <button type="button" disabled={!p.unscheduled.length} onClick={() => setPicked({ userId: p.userId, week: "unscheduled" })} className="flex h-12 w-full cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent">
                  <CalendarOff size={13} aria-hidden /> {p.unscheduled.length} {p.unscheduled.length === 1 ? "tarea" : "tareas"}
                </button>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-[hsl(var(--muted-foreground))]">La estimación de cada tarea abierta se reparte entre los días hábiles (lunes a viernes) de sus fechas. Las tareas sin fechas o sin estimación aparecen en "Sin fecha".</p>
      </div>

      <Sheet open={Boolean(picked)} onOpenChange={(open) => { if (!open) setPicked(null); }}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader><SheetTitle>{person ? `${nameOf(person.user)} · ${picked.week === "unscheduled" ? "Sin fecha" : `semana del ${weekLabel(picked.week)}`}` : "Tareas"}</SheetTitle></SheetHeader>
          <ul className="mt-4 space-y-2">
            {pickedTasks.map((item) => (
              <li key={item.taskId} draggable onDragStart={(e) => e.dataTransfer.setData("text/task", item.taskId)} className="space-y-2 rounded-md border border-[hsl(var(--border))] p-3">
                <div className="flex items-start justify-between gap-2">
                  <button type="button" onClick={() => onTaskClick?.(item.taskId)} className="min-w-0 cursor-pointer text-left text-sm font-medium hover:underline">{data.tasks[item.taskId]?.title ?? "Tarea"}</button>
                  {item.minutes != null && <span className="shrink-0 text-xs tabular-nums text-[hsl(var(--muted-foreground))]">{formatDuration(item.minutes)}</span>}
                </div>
                <SelectField value={person.userId} onValueChange={(userId) => userId !== person.userId && assign(item.taskId, userId)} options={options} />
              </li>
            ))}
          </ul>
        </SheetContent>
      </Sheet>
    </div>
  );
}
