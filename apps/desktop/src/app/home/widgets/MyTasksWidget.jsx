import { useNavigate } from "react-router-dom";
import { runly } from "../../../lib/runly";
import { WidgetFrame, unwrap, useWidgetQuery } from "./WidgetFrame";

const MAX_TASKS = 5;

function dueLabel(task) {
  if (!task.dueDate) return "Sin fecha";
  const due = new Date(task.dueDate);
  const label = due.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
  return due < new Date() ? `Vencida · ${label}` : label;
}

export function MyTasksWidget({ module }) {
  const navigate = useNavigate();
  const query = useWidgetQuery(["my-tasks"], (token) => runly.projects.listMyTasks(token));
  const d = unwrap(query.data) ?? {};
  const items = d.items ?? [];

  return (
    <WidgetFrame
      module={module}
      title="Mis tareas"
      subtitle={d.total ? `${d.total} abiertas${d.overdue ? ` · ${d.overdue} vencidas` : ""}` : "Asignadas a ti"}
      query={query}
      isEmpty={items.length === 0}
      emptyText="No tienes tareas abiertas."
    >
      <ul className="space-y-1">
        {items.slice(0, MAX_TASKS).map((task) => {
          const overdue = task.dueDate && new Date(task.dueDate) < new Date();
          return (
            <li key={task.id}>
              <button
                type="button"
                onClick={() => navigate(`/app/m/runly.projects?open=task:${task.id}&project=${task.projectId}`)}
                className="flex w-full items-center gap-2.5 rounded-md py-0.5 text-left hover:bg-[hsl(var(--muted))]"
              >
                <span aria-hidden className="h-7 w-1 shrink-0 rounded-full" style={{ background: task.status?.color ?? "hsl(var(--muted-foreground))" }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium leading-tight text-[hsl(var(--foreground))]">{task.title}</p>
                  <p className={`truncate text-xs ${overdue ? "text-red-600 dark:text-red-400" : "text-[hsl(var(--muted-foreground))]"}`}>
                    {dueLabel(task)} · {task.project?.name}
                  </p>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
      {items.length > MAX_TASKS && (
        <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">+{d.total - MAX_TASKS} tareas más</p>
      )}
    </WidgetFrame>
  );
}
