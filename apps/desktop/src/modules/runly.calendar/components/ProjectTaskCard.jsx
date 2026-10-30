// Shown in the event detail when the event mirrors a runly.projects task: its status,
// people and progress, with "Abrir tarea" and a one-tap complete / reopen. Hidden when the
// viewer cannot open the task (the lookup answers 404 to non-members).
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ExternalLink, FolderKanban, Lock } from "lucide-react";
import { toast } from "sonner";
import { Button, Skeleton } from "@runly/ui";
import { useAuth } from "../../../auth/AuthProvider";
import { runly } from "../../../lib/runly";

function personName(user) {
  return [user?.firstName, user?.lastName].filter(Boolean).join(" ");
}

export default function ProjectTaskCard({ taskId, onNavigate }) {
  const { session } = useAuth();
  const token = session?.access_token;
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["calendar", "project-task", taskId],
    queryFn: async () => {
      const { projectId } = await runly.projects.getTaskProject(taskId, token);
      const [task, statuses] = await Promise.all([
        runly.projects.getTask(projectId, taskId, token),
        runly.projects.listStatuses(projectId, token),
      ]);
      return { projectId, task, statuses: statuses?.data ?? statuses ?? [] };
    },
    enabled: Boolean(token && taskId),
    retry: false,
    staleTime: 15_000,
  });

  const toggle = useMutation({
    mutationFn: (statusId) => runly.projects.updateTask(data.projectId, taskId, { statusId }, token),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["calendar", "project-task", taskId] });
      qc.invalidateQueries({ queryKey: ["projects", data.projectId] });
    },
    onError: () => toast.error("No se pudo cambiar el estado de la tarea"),
  });

  if (isLoading) return <Skeleton className="h-20 w-full" />;
  if (isError || !data?.task) return null;

  const { task, statuses } = data;
  const done = Boolean(task.status?.isDone);
  const target = done
    ? statuses.find((s) => s.isDefault && !s.isDone) ?? statuses.find((s) => !s.isDone)
    : statuses.find((s) => s.isDone);
  const people = (task.assignees ?? []).map((row) => personName(row.user)).filter(Boolean);
  if (people.length === 0 && task.assignee) people.push(personName(task.assignee));
  const subtasks = task.subtasks ?? [];
  const subtasksDone = subtasks.filter((s) => statuses.find((st) => st.id === s.statusId)?.isDone).length;
  const blockers = (task.blockedBy ?? []).length;

  function open() {
    onNavigate?.();
    navigate(`/app/m/runly.projects?open=task:${taskId}&project=${data.projectId}`);
  }

  return (
    <div className="rounded-md border border-[hsl(var(--border))] p-3 space-y-2">
      <div className="flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
        <FolderKanban size={13} aria-hidden />
        <span>Tarea de Proyectos{task.taskNumber ? ` · T-${task.taskNumber}` : ""}</span>
        {task.status && (
          <span className="ml-auto flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 text-[11px] font-medium text-[hsl(var(--foreground))]" style={{ backgroundColor: `${task.status.color ?? "#6366f1"}26` }}>
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: task.status.color ?? "#6366f1" }} />
            {task.status.name}
          </span>
        )}
      </div>
      {(people.length > 0 || subtasks.length > 0 || blockers > 0) && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[hsl(var(--muted-foreground))]">
          {people.length > 0 && <span>{people.join(", ")}</span>}
          {subtasks.length > 0 && <span>{subtasksDone}/{subtasks.length} subtareas</span>}
          {blockers > 0 && <span className="flex items-center gap-1"><Lock size={11} aria-hidden />Espera a {blockers} {blockers === 1 ? "tarea" : "tareas"}</span>}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={open}>
          <ExternalLink size={13} className="mr-1.5" aria-hidden />Abrir tarea
        </Button>
        {target && (
          <Button size="sm" variant="outline" disabled={toggle.isPending} onClick={() => toggle.mutate(target.id)}>
            <Check size={13} className="mr-1.5" aria-hidden />{done ? "Reabrir" : "Marcar como completada"}
          </Button>
        )}
      </div>
    </div>
  );
}
