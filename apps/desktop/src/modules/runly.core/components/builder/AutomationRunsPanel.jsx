// Module Builder — "Historial" of the module's automations: the last runs with
// their per-step result (GET /modules/:key/automation-runs) and, for runs that
// are waiting, when they continue and a way to cancel (automation-jobs). Filters
// (automation, result, trigger, dates) apply on the server; runs load 25 at a time
// ("Cargar más") and the filtered list can be exported to CSV or Excel. Only
// available once the module is published.
import { useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ActionMenu, Badge, Button, ConfirmDialog, DateField, EmptyState, ErrorState, SelectField } from "@runly/ui";
import { ChevronDown, FileSpreadsheet, FileText, FilterX, History, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../../../auth/AuthProvider";
import { runly } from "../../../../lib/runly";

const STATUS = {
  success: { label: "Correcta", variant: "success" },
  partial: { label: "Parcial", variant: "warning" },
  failed: { label: "Falló", variant: "destructive" },
  running: { label: "En curso", variant: "secondary" },
  waiting: { label: "En espera", variant: "warning" },
  cancelled: { label: "Cancelada", variant: "outline" },
  rejected: { label: "Rechazada", variant: "destructive" },
};
const FILTERS = [
  { value: "all", label: "Todas" },
  { value: "waiting", label: "En espera" },
  { value: "rejected", label: "Rechazadas" },
  { value: "failed", label: "Con fallas" },
  { value: "partial", label: "Parciales" },
  { value: "success", label: "Correctas" },
];
const TRIGGER_FILTERS = [
  { value: "all", label: "Todos" },
  { value: "webhook", label: "Webhook" },
  { value: "event", label: "Evento" },
  { value: "schedule", label: "Horario" },
  { value: "record", label: "Registro" },
  { value: "delayed", label: "Tras una espera" },
];
const PAGE_SIZE = 25;
const TRIGGER_LABEL = { record: "Registro", event: "Evento", schedule: "Horario", delayed: "Después de una espera" };
const dateText = (value) => new Date(value).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });

function stepsSummary(steps) {
  return steps.map((step) => {
    if (step.type === "delay") return `${step.index + 1}: espera`;
    if (step.type === "approval") return `${step.index + 1}: aprobación`;
    if (step.type === "branch") return `${step.index + 1}: condición ${step.path === "yes" ? "Sí" : "No"}`;
    if (step.type === "http") return `${step.index + 1}: ${step.ok ? "llamada ok" : "llamada falló"}`;
    return `${step.index + 1}: ${step.skipped ? "omitido" : step.ok ? "ok" : "falló"}`;
  }).join(" · ");
}

// `automationKey` limits the history to one automation (no filter shown).
export function AutomationRunsPanel({ moduleKey, published, automations, automationKey = null }) {
  const { session } = useAuth();
  const token = session?.access_token;
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("all");
  const [pickedAutomation, setAutomation] = useState("all");
  const [trigger, setTrigger] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [exporting, setExporting] = useState(false);
  const automation = automationKey ?? pickedAutomation;
  const [cancelJob, setCancelJob] = useState(null);
  const enabled = Boolean(token && moduleKey && published);
  const filters = {
    status: status === "all" ? undefined : status,
    automation: automation === "all" ? undefined : automation,
    trigger: trigger === "all" ? undefined : trigger,
    from: from || undefined,
    to: to || undefined,
  };
  const filtered = Boolean(filters.status || filters.trigger || filters.from || filters.to || (!automationKey && filters.automation));

  const query = useInfiniteQuery({
    queryKey: ["automation-runs", moduleKey, filters],
    initialPageParam: null,
    queryFn: async ({ pageParam }) => {
      const result = await runly.modules.automationRunsPage(moduleKey, { ...filters, cursor: pageParam, limit: PAGE_SIZE }, token);
      if (result?.error) throw new Error(result.error);
      return { items: result?.data ?? [], total: result?.page?.total ?? null, nextCursor: result?.page?.nextCursor ?? null };
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
    staleTime: 15 * 1000,
  });
  const runs = (query.data?.pages ?? []).flatMap((page) => page.items);
  const total = query.data?.pages?.[0]?.total ?? null;

  async function exportRuns(format) {
    setExporting(true);
    try {
      const blob = await runly.modules.exportAutomationRuns(moduleKey, { ...filters, format }, token);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `historial-automatizaciones.${format}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error("No se pudo exportar", { description: error.message });
    } finally {
      setExporting(false);
    }
  }
  const clearFilters = () => { setStatus("all"); setTrigger("all"); setFrom(""); setTo(""); if (!automationKey) setAutomation("all"); };
  const jobsQuery = useQuery({
    queryKey: ["automation-jobs", moduleKey],
    queryFn: async () => (await runly.modules.automationJobs(moduleKey, token))?.data ?? [],
    enabled,
    staleTime: 15 * 1000,
  });
  const cancel = useMutation({
    mutationFn: async (job) => {
      const result = await runly.modules.cancelAutomationJob(moduleKey, job.id, token);
      if (result?.error) throw new Error(result.error);
    },
    onSuccess: () => {
      toast.success("Espera cancelada");
      queryClient.invalidateQueries({ queryKey: ["automation-runs", moduleKey] });
      queryClient.invalidateQueries({ queryKey: ["automation-jobs", moduleKey] });
      setCancelJob(null);
    },
    onError: (error) => toast.error("No se pudo cancelar", { description: error.message }),
  });
  const labels = new Map((automations ?? []).map((item) => [item.key, item.label]));
  const jobByRun = new Map((jobsQuery.data ?? []).filter((job) => job.runId).map((job) => [job.runId, job]));

  if (!published) return null;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-medium"><History className="h-4 w-4" /> Historial</h3>
          <p className="text-xs text-[hsl(var(--muted-foreground))]" aria-live="polite">
            {query.isLoading ? "Cargando…" : total === null ? "" : `${total} ${total === 1 ? "ejecución" : "ejecuciones"}${filtered ? " con estos filtros" : ""}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {filtered && <Button variant="ghost" onClick={clearFilters}><FilterX className="mr-1.5 h-4 w-4" /> Quitar filtros</Button>}
          {exporting && <Loader2 className="h-4 w-4 animate-spin text-[hsl(var(--muted-foreground))]" aria-label="Exportando" />}
          <ActionMenu
            label="Exportar historial"
            items={[
              { label: "Exportar a Excel (.xlsx)", icon: FileSpreadsheet, onClick: () => exportRuns("xlsx"), disabled: exporting || total === 0 },
              { label: "Exportar a CSV", icon: FileText, onClick: () => exportRuns("csv"), disabled: exporting || total === 0 },
            ]}
          />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {!automationKey && <SelectField label="Automatización" value={automation} onValueChange={setAutomation}
          options={[{ value: "all", label: "Todas" }, ...(automations ?? []).map((item) => ({ value: item.key, label: item.label || item.key }))]} />}
        <SelectField label="Resultado" value={status} onValueChange={setStatus} options={FILTERS} />
        <SelectField label="Disparador" value={trigger} onValueChange={setTrigger} options={TRIGGER_FILTERS} />
        <DateField label="Desde" value={from} onChange={(e) => setFrom(e.target.value)} />
        <DateField label="Hasta" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      {query.error ? (
        <ErrorState title="No se pudo cargar el historial" description={query.error.message} onRetry={() => query.refetch()} />
      ) : !query.isLoading && runs.length === 0 ? (
        <EmptyState icon={History} title={filtered ? "Sin resultados" : "Sin ejecuciones"} description={filtered ? "Ninguna ejecución coincide con los filtros." : "Aquí aparecen las veces que corrió cada automatización y si salió bien."} />
      ) : (
        <>
          <ul className="divide-y divide-[hsl(var(--border))] rounded-lg border border-[hsl(var(--border))]">
            {runs.map((run) => {
              const job = jobByRun.get(run.id);
              return (
                <li key={run.id} className="space-y-1 p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={STATUS[run.status]?.variant ?? "outline"}>{STATUS[run.status]?.label ?? run.status}</Badge>
                    <span className="font-medium">{labels.get(run.automationKey) ?? run.automationKey}</span>
                    <span className="text-xs text-[hsl(var(--muted-foreground))]">
                      {TRIGGER_LABEL[run.triggerKind] ?? run.triggerKind} · {dateText(run.createdAt)} · {run.durationMs} ms
                    </span>
                  </div>
                  {job && job.status === "awaiting_approval" && (
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">Esperando aprobación; vence el {dateText(job.runAt)}</p>
                  )}
                  {job && job.status !== "awaiting_approval" && (
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
                      <span>Continúa el {dateText(job.runAt)}</span>
                      <Button variant="outline" size="sm" onClick={() => setCancelJob(job)}>Cancelar espera</Button>
                    </div>
                  )}
                  {run.error && <p className="text-xs text-red-600 dark:text-red-400">{run.error}</p>}
                  {Array.isArray(run.steps) && run.steps.length > 1 && (
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">{stepsSummary(run.steps)}</p>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="flex items-center justify-between gap-3 text-xs text-[hsl(var(--muted-foreground))]">
            <span>{total !== null ? `Mostrando ${runs.length} de ${total}` : ""}</span>
            {query.hasNextPage && (
              <Button variant="outline" disabled={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>
                {query.isFetchingNextPage ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Cargando…</> : <><ChevronDown className="mr-1.5 h-4 w-4" /> Cargar más</>}
              </Button>
            )}
          </div>
        </>
      )}
      <ConfirmDialog
        open={Boolean(cancelJob)}
        onOpenChange={(open) => !open && setCancelJob(null)}
        title="Cancelar espera"
        description="Los pasos que siguen a la espera ya no se ejecutarán para este registro."
        confirmLabel="Cancelar espera"
        onConfirm={() => cancelJob && cancel.mutate(cancelJob)}
      />
    </div>
  );
}
