import { useState } from "react";
import { CheckCircle2, Circle, ListTodo, Plus } from "lucide-react";
import { Badge } from "./Badge.jsx";
import { Button } from "./Button.jsx";
import { EmptyState } from "./EmptyState.jsx";
import { ErrorState } from "./ErrorState.jsx";
import { Input } from "./Input.jsx";
import { LoadingState } from "./LoadingState.jsx";

// Tasks linked to a record (vehicle, employee, item...). Presentational: the
// host loads `tasks` and handles create/open, so any module screen can mount it.
export function LinkedTasksPanel({
  tasks = [],
  isLoading = false,
  error = null,
  creating = false,
  onCreate,
  onOpenTask,
  title = "Tareas",
}) {
  const [draft, setDraft] = useState("");

  function submit(event) {
    event.preventDefault();
    const value = draft.trim();
    if (!value || creating || !onCreate) return;
    onCreate(value, { onSuccess: () => setDraft("") });
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <ListTodo className="h-4 w-4" />
        {title}
        {tasks.length > 0 && <Badge variant="secondary">{tasks.length}</Badge>}
      </div>

      {onCreate && (
        <form onSubmit={submit} className="flex gap-2">
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Nueva tarea para este registro"
            aria-label="Titulo de la nueva tarea"
          />
          <Button type="submit" size="sm" disabled={!draft.trim() || creating}>
            <Plus className="mr-1 h-4 w-4" />
            Crear
          </Button>
        </form>
      )}

      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState title="No se pudieron cargar las tareas" description={error.message} />
      ) : tasks.length === 0 ? (
        <EmptyState variant="compact" icon={ListTodo} title="Sin tareas vinculadas." />
      ) : (
        <ul className="divide-y divide-[hsl(var(--border))] rounded-md border border-[hsl(var(--border))]">
          {tasks.map((task) => (
            <li key={task.linkId ?? task.id}>
              <button
                type="button"
                onClick={() => onOpenTask?.(task)}
                className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-[hsl(var(--muted))]"
              >
                {task.status?.isDone ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
                ) : (
                  <Circle className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" />
                )}
                <span className="min-w-0 flex-1 truncate">{task.title}</span>
                {task.status?.name && <Badge variant="outline">{task.status.name}</Badge>}
                <span className="shrink-0 text-xs text-[hsl(var(--muted-foreground))]">{task.project?.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
