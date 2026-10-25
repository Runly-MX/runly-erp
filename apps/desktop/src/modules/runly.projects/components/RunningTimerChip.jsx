// The person's running task timer, wherever they are in Projects: which task, how long,
// a stop button and a link to the task.
import { useEffect, useState } from "react";
import { Square, Timer } from "lucide-react";
import { useRunningTimer, useTimeActions } from "../hooks/useProjectsData";
import { clock } from "../lib/timeFormat";

export function RunningTimerChip({ onOpenTask }) {
  const { data: running } = useRunningTimer();
  const actions = useTimeActions(running?.task?.projectId, running?.taskId);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return undefined;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [running]);
  if (!running) return null;
  return (
    <div role="status" className="inline-flex max-w-full items-center gap-1 rounded-md border border-(--brand-primary)/40 bg-(--brand-primary)/10 py-0.5 pl-2 pr-0.5 text-sm">
      <Timer size={14} aria-hidden className="shrink-0" />
      <button type="button" onClick={() => onOpenTask?.(running.taskId)} className="min-w-0 cursor-pointer truncate text-left hover:underline" title="Abrir la tarea">{running.task?.title ?? "Tarea"}</button>
      <span className="shrink-0 font-medium tabular-nums">{clock((now - new Date(running.startedAt).getTime()) / 1000)}</span>
      <button type="button" aria-label="Detener el cronómetro" onClick={() => actions.stop.mutate()} disabled={actions.stop.isPending} className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md hover:bg-(--brand-primary)/20 [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:w-10"><Square size={14} aria-hidden /></button>
    </div>
  );
}
