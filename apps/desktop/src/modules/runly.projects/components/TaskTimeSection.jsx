// "Tiempo" block of the task detail: the estimate, a start/stop timer, a quick manual
// entry and the entries logged. Everyone sees their own time; project owners see all.
import { useEffect, useState } from "react";
import { Button, TextField } from "@runly/ui";
import { Clock, Play, Square, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useRunningTimer, useTaskTime, useTimeActions } from "../hooks/useProjectsData";
import { clock, formatDuration, parseDuration } from "../lib/timeFormat";

function useElapsed(startedAt) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return undefined;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);
  return startedAt ? (now - new Date(startedAt).getTime()) / 1000 : 0;
}

export function TaskTimeSection({ projectId, taskId, estimateMinutes, onEstimate, canEdit = true }) {
  const { data: entries = [] } = useTaskTime(projectId, taskId);
  const { data: running } = useRunningTimer();
  const actions = useTimeActions(projectId, taskId);
  const [estimateText, setEstimateText] = useState(estimateMinutes ? formatDuration(estimateMinutes) : "");
  const [duration, setDuration] = useState("");
  const [note, setNote] = useState("");
  const here = running?.taskId === taskId ? running : null;
  const elapsed = useElapsed(here?.startedAt);
  const logged = entries.reduce((sum, entry) => sum + (entry.minutes ?? 0), 0);
  const over = estimateMinutes > 0 && logged > estimateMinutes;
  const share = estimateMinutes > 0 ? Math.min(100, Math.round((logged / estimateMinutes) * 100)) : 0;

  useEffect(() => { setEstimateText(estimateMinutes ? formatDuration(estimateMinutes) : ""); }, [estimateMinutes]);

  function saveEstimate() {
    const text = estimateText.trim();
    if (!text) { if (estimateMinutes != null) onEstimate(null); return; }
    const minutes = parseDuration(text);
    if (minutes === null || minutes > 100000) { toast.error("No entendí la estimación", { description: "Escribe algo como 90, 1:30, 1h 30 o 2h." }); setEstimateText(estimateMinutes ? formatDuration(estimateMinutes) : ""); return; }
    if (minutes !== estimateMinutes) onEstimate(minutes);
  }

  function addManual(event) {
    event.preventDefault();
    const minutes = parseDuration(duration);
    if (minutes === null || minutes < 1) { toast.error("No entendí el tiempo", { description: "Escribe algo como 45, 1:30 o 1h 30." }); return; }
    actions.add.mutate({ minutes, note: note.trim() || undefined }, { onSuccess: () => { setDuration(""); setNote(""); } });
  }

  return (
    <section aria-label="Tiempo" className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-medium"><Clock size={14} aria-hidden /> Tiempo</h3>

      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Estimación" value={estimateText} disabled={!canEdit} placeholder="Ej. 1h 30" hint="Horas y minutos: 90, 1:30, 2h"
          onChange={(e) => setEstimateText(e.target.value)} onBlur={saveEstimate} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Cronómetro</p>
          {here ? (
            <Button type="button" variant="destructive" className="w-full gap-2 tabular-nums" disabled={actions.stop.isPending} onClick={() => actions.stop.mutate()} aria-label={`Detener el cronómetro, lleva ${clock(elapsed)}`}>
              <Square size={14} aria-hidden /> Detener · {clock(elapsed)}
            </Button>
          ) : (
            <Button type="button" variant="outline" className="w-full gap-2" disabled={!canEdit || actions.start.isPending} onClick={() => actions.start.mutate()}>
              <Play size={14} aria-hidden /> Iniciar
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-1" aria-live="polite">
        <p className="text-sm">
          <span className="font-medium tabular-nums">{formatDuration(logged)}</span>
          <span className="text-[hsl(var(--muted-foreground))]">{estimateMinutes > 0 ? ` de ${formatDuration(estimateMinutes)} estimados` : " registrados"}</span>
          {over && <span className="ml-2 text-xs font-medium text-amber-600 dark:text-amber-400">Pasó la estimación por {formatDuration(logged - estimateMinutes)}</span>}
        </p>
        {estimateMinutes > 0 && (
          <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={share} aria-label="Tiempo registrado contra la estimación" className="h-1.5 overflow-hidden rounded-full bg-[hsl(var(--muted))]">
            <div className={`h-full rounded-full transition-[width] ${over ? "bg-amber-500" : "bg-(--brand-primary)"}`} style={{ width: `${share}%` }} />
          </div>
        )}
      </div>

      {canEdit && (
        <form onSubmit={addManual} className="flex flex-wrap items-end gap-2">
          <div className="w-28"><TextField label="Registrar" value={duration} placeholder="45 o 1h 30" onChange={(e) => setDuration(e.target.value)} /></div>
          <div className="min-w-[10rem] flex-1"><TextField label="Nota (opcional)" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} /></div>
          <Button type="submit" variant="outline" disabled={actions.add.isPending || !duration.trim()}>Agregar</Button>
        </form>
      )}

      {entries.length > 0 && (
        <ul className="divide-y divide-[hsl(var(--border))] rounded-md border border-[hsl(var(--border))]">
          {entries.slice(0, 20).map((entry) => (
            <li key={entry.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <span className="w-24 shrink-0 font-medium tabular-nums">{entry.minutes == null ? "En curso" : formatDuration(entry.minutes)}</span>
              <span className="min-w-0 flex-1 truncate text-[hsl(var(--muted-foreground))]">
                {new Date(entry.startedAt).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}{entry.note ? ` · ${entry.note}` : ""}{entry.source === "timer" ? " · cronómetro" : ""}
              </span>
              {canEdit && entry.minutes != null && (
                <button type="button" aria-label="Borrar este registro" onClick={() => actions.remove.mutate(entry.id)} className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))] [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:w-10"><Trash2 size={14} aria-hidden /></button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
