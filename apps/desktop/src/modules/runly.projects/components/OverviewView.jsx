// Project overview ("Resumen"): progress by tasks and by hours, what is overdue, tasks per
// status, per person, estimated vs logged hours by week and the next milestones. Spec
// docs/superpowers/specs/2026-10-26-projects-depth-design.md, section 3.
import { ErrorState, LoadingState } from "@runly/ui";
import { Flag, TriangleAlert } from "lucide-react";
import { useProjectOverview } from "../hooks/useProjectsData";
import { formatDuration } from "../lib/timeFormat";

const nameOf = (user) => [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Sin nombre";
const percent = (part, total) => (total > 0 ? Math.min(100, Math.round((part / total) * 100)) : 0);

function Card({ title, children, className = "" }) {
  return (
    <section aria-label={title} className={`rounded-md border border-[hsl(var(--border))] p-4 ${className}`}>
      <h3 className="mb-3 text-sm font-medium">{title}</h3>
      {children}
    </section>
  );
}

function Meter({ value, label, over = false }) {
  return (
    <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} aria-label={label} className="h-2 overflow-hidden rounded-full bg-[hsl(var(--muted))]">
      <div className={`h-full rounded-full ${over ? "bg-amber-500" : "bg-(--brand-primary)"}`} style={{ width: `${value}%` }} />
    </div>
  );
}

export default function OverviewView({ projectId, onTaskClick }) {
  const { data, isLoading, isError, refetch } = useProjectOverview(projectId);
  if (isLoading) return <LoadingState />;
  if (isError || !data) return <ErrorState title="No se pudo cargar el resumen" onRetry={refetch} />;

  const { progress, overdue, byStatus, people, weeks, milestones } = data;
  const taskShare = percent(progress.tasksDone, progress.tasksTotal);
  const hoursOver = progress.estimatedMinutes > 0 && progress.loggedMinutes > progress.estimatedMinutes;
  const peak = Math.max(1, ...weeks.map((w) => Math.max(w.estimatedMinutes, w.loggedMinutes)));

  return (
    <div className="h-full overflow-auto p-4">
      <div className="mx-auto grid max-w-5xl gap-4 md:grid-cols-2">
        <Card title="Avance">
          <p className="mb-2 text-sm"><span className="font-medium tabular-nums">{progress.tasksDone} de {progress.tasksTotal}</span> <span className="text-[hsl(var(--muted-foreground))]">tareas terminadas ({taskShare}%)</span></p>
          <Meter value={taskShare} label="Tareas terminadas" />
          <p className="mb-2 mt-4 text-sm"><span className="font-medium tabular-nums">{formatDuration(progress.loggedMinutes)}</span> <span className="text-[hsl(var(--muted-foreground))]">{progress.estimatedMinutes > 0 ? `registradas de ${formatDuration(progress.estimatedMinutes)} estimadas` : "registradas"}</span></p>
          {progress.estimatedMinutes > 0 && <Meter value={percent(progress.loggedMinutes, progress.estimatedMinutes)} label="Horas registradas contra las estimadas" over={hoursOver} />}
          {overdue > 0 && <p className="mt-4 flex items-center gap-2 text-sm text-red-600 dark:text-red-400"><TriangleAlert size={14} aria-hidden /> {overdue} {overdue === 1 ? "tarea vencida" : "tareas vencidas"}</p>}
        </Card>

        <Card title="Por estado">
          {byStatus.length === 0 ? <p className="text-sm text-[hsl(var(--muted-foreground))]">Aún no hay tareas.</p> : (
            <ul className="space-y-2">
              {byStatus.map((status) => (
                <li key={status.id} className="flex items-center gap-2 text-sm">
                  <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: status.color ?? "hsl(var(--muted-foreground))" }} />
                  <span className="min-w-0 flex-1 truncate">{status.name}</span>
                  <span className="tabular-nums">{status.count}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Por persona" className="md:col-span-2">
          {people.length === 0 ? <p className="text-sm text-[hsl(var(--muted-foreground))]">Nadie tiene tareas asignadas.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-[hsl(var(--muted-foreground))]"><th className="pb-2 font-medium">Persona</th><th className="pb-2 text-right font-medium">Abiertas</th><th className="pb-2 text-right font-medium">Terminadas</th><th className="pb-2 text-right font-medium">Vencidas</th><th className="pb-2 text-right font-medium">Tiempo registrado</th></tr></thead>
                <tbody>
                  {people.map((p) => (
                    <tr key={p.userId} className="border-t border-[hsl(var(--border))] tabular-nums">
                      <td className="py-2 font-sans">{nameOf(p.user)}</td>
                      <td className="py-2 text-right">{p.open}</td>
                      <td className="py-2 text-right">{p.done}</td>
                      <td className={`py-2 text-right ${p.overdue ? "text-red-600 dark:text-red-400" : ""}`}>{p.overdue}</td>
                      <td className="py-2 text-right">{formatDuration(p.loggedMinutes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Horas por semana">
          <ul className="space-y-2">
            {weeks.map((w) => (
              <li key={w.week} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-2 text-xs">
                <span className="text-[hsl(var(--muted-foreground))]">{new Date(`${w.week}T12:00:00Z`).toLocaleDateString("es-MX", { day: "numeric", month: "short", timeZone: "UTC" })}</span>
                <span className="space-y-1" aria-hidden>
                  <span className="block h-1.5 rounded-full bg-[hsl(var(--muted-foreground)/0.45)]" style={{ width: `${percent(w.estimatedMinutes, peak)}%` }} />
                  <span className="block h-1.5 rounded-full bg-(--brand-primary)" style={{ width: `${percent(w.loggedMinutes, peak)}%` }} />
                </span>
                <span className="tabular-nums">{formatDuration(w.loggedMinutes)} / {formatDuration(w.estimatedMinutes)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-[hsl(var(--muted-foreground))]">Registradas contra estimadas (por la semana de entrega).</p>
        </Card>

        <Card title="Próximos hitos">
          {milestones.length === 0 ? <p className="text-sm text-[hsl(var(--muted-foreground))]">Sin hitos próximos. Una tarea con estimación 0 y fecha de entrega cuenta como hito.</p> : (
            <ul className="space-y-1">
              {milestones.map((m) => (
                <li key={m.id}>
                  <button type="button" onClick={() => onTaskClick?.(m.id)} className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-[hsl(var(--muted))]">
                    <Flag size={14} aria-hidden className="shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{m.title}</span>
                    <span className="shrink-0 text-xs text-[hsl(var(--muted-foreground))]">{new Date(m.dueDate).toLocaleDateString("es-MX", { day: "numeric", month: "short", timeZone: "UTC" })}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
