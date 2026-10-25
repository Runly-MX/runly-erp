// Execution console of one automation: its latest runs and, for the selected one,
// what reached it and what every block did (sent data, result, time, and the full
// error when it failed). The selected run also paints a status badge on each block
// of the canvas (onSelectRun). Refreshes every few seconds while open.
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge, EmptyState } from "@runly/ui";
import { Check, ChevronDown, ChevronUp, Minus, Terminal, X } from "lucide-react";
import { useAuth } from "../../../../auth/AuthProvider";
import { runly } from "../../../../lib/runly";
import { describeStep, describeTrigger } from "../../lib/flowModel";
import { ownerLabel } from "./AutomationSteps";
import { CodeSnippet } from "./CodeSnippet";

const RUN_STATUS = {
  success: { label: "Correcta", variant: "success" }, partial: { label: "Parcial", variant: "warning" }, failed: { label: "Falló", variant: "destructive" },
  running: { label: "En curso", variant: "secondary" }, waiting: { label: "En espera", variant: "warning" }, cancelled: { label: "Cancelada", variant: "outline" }, rejected: { label: "Rechazada", variant: "destructive" },
};
const TRIGGER_LABEL = { record: "Registro", event: "Evento", schedule: "Horario", delayed: "Tras una espera", webhook: "Webhook" };
const time = (value) => new Date(value).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "medium" });
const json = (value) => JSON.stringify(value, null, 2);

function StepResult({ step, entry }) {
  const state = entry.skipped ? "skipped" : entry.ok ? (entry.waiting ? "waiting" : "success") : "failed";
  const Icon = { success: Check, failed: X, skipped: Minus, waiting: Minus }[state];
  const tone = { success: "bg-emerald-600", failed: "bg-red-600", skipped: "bg-[hsl(var(--muted-foreground))]", waiting: "bg-amber-500" }[state];
  const label = { success: "Correcto", failed: "Con error", skipped: "Omitido", waiting: "En espera" }[state];
  const { title } = step ? describeStep(step, ownerLabel) : { title: entry.service ?? "Bloque" };
  return (
    <li className="rounded-md border border-[hsl(var(--border))]">
      <details open={state === "failed"} className="group">
        <summary className="flex cursor-pointer list-none items-center gap-2.5 p-2.5 [@media(pointer:coarse)]:min-h-11">
          <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white ${tone}`}><Icon className="h-3 w-3" aria-hidden="true" /></span>
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{entry.index + 1}. {title}</span></span>
          <span className="shrink-0 text-xs text-[hsl(var(--muted-foreground))]">{label}{typeof entry.ms === "number" ? ` · ${entry.ms} ms` : ""}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))] group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="space-y-2 border-t border-[hsl(var(--border))] p-2.5">
          {entry.error && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-red-700 dark:text-red-400">Error{entry.code ? ` (${entry.code})` : ""}</p>
              <CodeSnippet value={entry.error} label="Copiar el error" />
            </div>
          )}
          {entry.args && <div><p className="mb-1 text-xs font-semibold">Datos enviados</p><CodeSnippet value={json(entry.args)} label="Copiar los datos enviados" /></div>}
          {entry.request && <div><p className="mb-1 text-xs font-semibold">Llamada</p><CodeSnippet value={json(entry.request)} label="Copiar la llamada" /></div>}
          {entry.output && Object.keys(entry.output).length > 0 && <div><p className="mb-1 text-xs font-semibold">Resultado</p><CodeSnippet value={json(entry.output)} label="Copiar el resultado" /></div>}
          {entry.runAt && <p className="text-xs text-[hsl(var(--muted-foreground))]">Continúa el {time(entry.runAt)}.</p>}
          {entry.path && <p className="text-xs text-[hsl(var(--muted-foreground))]">La condición {entry.path === "yes" ? "se cumplió: el flujo siguió por «Sí»" : "no se cumplió: el flujo siguió por «No»"}.</p>}
          {!entry.error && !entry.args && !entry.request && !entry.output && !entry.runAt && !entry.path && <p className="text-xs text-[hsl(var(--muted-foreground))]">{state === "skipped" ? (entry.byCondition ? "No se ejecutó: el flujo siguió por el otro camino de la condición." : "No se ejecutó porque un paso anterior falló.") : "Sin más detalle."}</p>}
        </div>
      </details>
    </li>
  );
}

export function AutomationConsole({ moduleKey, automation, open, onToggle, onSelectRun }) {
  const { session } = useAuth();
  const token = session?.access_token;
  const [selectedId, setSelectedId] = useState(null);
  const [onlyErrors, setOnlyErrors] = useState(false);
  const query = useQuery({
    queryKey: ["automation-console", moduleKey, automation.key],
    queryFn: async () => (await runly.modules.automationRuns(moduleKey, { automation: automation.key, limit: 30 }, token))?.data ?? [],
    enabled: Boolean(token),
    refetchInterval: open ? 4000 : 20000,
  });
  const runs = useMemo(() => (query.data ?? []).filter((run) => !onlyErrors || ["failed", "partial", "rejected"].includes(run.status)), [query.data, onlyErrors]);
  const selected = runs.find((run) => run.id === selectedId) ?? runs[0] ?? null;
  const latest = (query.data ?? [])[0];

  useEffect(() => { onSelectRun?.(open ? selected : null); }, [open, selected?.id, selected?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const triggerText = describeTrigger(automation.trigger, {});
  return (
    <section aria-label="Consola de ejecución" className="overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2.5 text-left hover:bg-[hsl(var(--muted))]/50 [@media(pointer:coarse)]:min-h-11">
        <Terminal className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="text-sm font-semibold">Consola</span>
        {latest && <Badge variant={RUN_STATUS[latest.status]?.variant ?? "outline"}>{RUN_STATUS[latest.status]?.label ?? latest.status}</Badge>}
        <span className="min-w-0 flex-1 truncate text-xs text-[hsl(var(--muted-foreground))]">{latest ? `Última ejecución ${time(latest.createdAt)}` : "Aún no se ha ejecutado"}</span>
        {open ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <ChevronUp className="h-4 w-4" aria-hidden="true" />}
      </button>
      <div className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`} inert={!open}>
       <div className="min-h-0 overflow-hidden">
        <div className="grid max-h-[22rem] min-h-[14rem] border-t border-[hsl(var(--border))] md:grid-cols-[18rem_minmax(0,1fr)]">
          <div className="min-h-0 overflow-y-auto border-b border-[hsl(var(--border))] md:border-b-0 md:border-r">
            <div className="flex items-center gap-2 p-2">
              <button type="button" aria-pressed={onlyErrors} onClick={() => setOnlyErrors((value) => !value)}
                className={`cursor-pointer rounded-md border px-2.5 py-1 text-xs [@media(pointer:coarse)]:min-h-10 ${onlyErrors ? "border-transparent bg-(--brand-primary)/15 font-medium" : "border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]"}`}>
                Solo con errores
              </button>
            </div>
            {runs.length === 0 ? (
              <div className="p-3"><EmptyState icon={Terminal} title="Sin ejecuciones" description={onlyErrors ? "No hay ejecuciones con errores." : "Aquí verás cada vez que corre esta automatización."} /></div>
            ) : (
              <ul>
                {runs.map((run) => (
                  <li key={run.id}>
                    <button type="button" onClick={() => setSelectedId(run.id)} aria-current={selected?.id === run.id ? "true" : undefined}
                      className={`flex w-full cursor-pointer flex-col gap-1 px-3 py-2 text-left transition-colors [@media(pointer:coarse)]:min-h-12 ${selected?.id === run.id ? "bg-(--brand-primary)/15" : "hover:bg-[hsl(var(--muted))]/60"}`}>
                      <span className="flex items-center gap-2"><Badge variant={RUN_STATUS[run.status]?.variant ?? "outline"}>{RUN_STATUS[run.status]?.label ?? run.status}</Badge><span className="text-xs text-[hsl(var(--muted-foreground))]">{TRIGGER_LABEL[run.triggerKind] ?? run.triggerKind}</span></span>
                      <span className="text-xs text-[hsl(var(--muted-foreground))]">{time(run.createdAt)} · {run.durationMs} ms</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="min-h-0 space-y-3 overflow-y-auto p-3">
            {!selected ? (
              <p className="text-sm text-[hsl(var(--muted-foreground))]">Elige una ejecución para ver el detalle de cada bloque.</p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={RUN_STATUS[selected.status]?.variant ?? "outline"}>{RUN_STATUS[selected.status]?.label ?? selected.status}</Badge>
                  <span className="text-sm font-medium">{TRIGGER_LABEL[selected.triggerKind] ?? selected.triggerKind}</span>
                  <span className="text-xs text-[hsl(var(--muted-foreground))]">{time(selected.createdAt)} · {selected.durationMs} ms</span>
                </div>
                {selected.error && <div className="rounded-md border border-red-500/30 bg-red-500/5 p-2.5 text-xs text-red-700 dark:text-red-300"><span className="font-semibold">Resumen del error: </span>{selected.error}</div>}
                <details className="rounded-md border border-[hsl(var(--border))]">
                  <summary className="flex cursor-pointer list-none items-center justify-between p-2.5 text-sm font-medium [@media(pointer:coarse)]:min-h-11">
                    <span>{triggerText.title}: datos que llegaron</span><ChevronDown className="h-4 w-4 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
                  </summary>
                  <div className="border-t border-[hsl(var(--border))] p-2.5">
                    {selected.input ? <CodeSnippet value={json(selected.input)} label="Copiar los datos que llegaron" /> : <p className="text-xs text-[hsl(var(--muted-foreground))]">Esta ejecución no guardó los datos de entrada.</p>}
                  </div>
                </details>
                <ol className="space-y-2">
                  {(selected.steps ?? []).map((entry) => <StepResult key={entry.index} entry={entry} step={automation.steps?.[entry.index]} />)}
                  {(selected.steps ?? []).length === 0 && <li className="text-xs text-[hsl(var(--muted-foreground))]">Todavía no hay bloques ejecutados.</li>}
                </ol>
              </>
            )}
          </div>
        </div>
       </div>
      </div>
    </section>
  );
}
