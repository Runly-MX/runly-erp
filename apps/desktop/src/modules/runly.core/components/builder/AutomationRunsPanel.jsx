// Module Builder — "Historial" of the module's automations: the last runs with
// their per-step result (GET /modules/:key/automation-runs). Only available
// once the module is published.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge, EmptyState, ErrorState, SelectField } from "@runly/ui";
import { History } from "lucide-react";
import { useAuth } from "../../../../auth/AuthProvider";
import { runly } from "../../../../lib/runly";

const STATUS = {
  success: { label: "Correcta", variant: "success" },
  partial: { label: "Parcial", variant: "warning" },
  failed: { label: "Falló", variant: "destructive" },
};
const FILTERS = [
  { value: "all", label: "Todas" },
  { value: "failed", label: "Con fallas" },
  { value: "partial", label: "Parciales" },
  { value: "success", label: "Correctas" },
];

export function AutomationRunsPanel({ moduleKey, published, automations }) {
  const { session } = useAuth();
  const token = session?.access_token;
  const [status, setStatus] = useState("all");
  const [automation, setAutomation] = useState("all");
  const query = useQuery({
    queryKey: ["automation-runs", moduleKey, status, automation],
    queryFn: async () => {
      const result = await runly.modules.automationRuns(moduleKey, {
        status: status === "all" ? undefined : status,
        automation: automation === "all" ? undefined : automation,
        limit: 50,
      }, token);
      if (result?.error) throw new Error(result.error);
      return result?.data ?? [];
    },
    enabled: Boolean(token && moduleKey && published),
    staleTime: 15 * 1000,
  });
  const labels = new Map((automations ?? []).map((item) => [item.key, item.label]));

  if (!published) return null;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-medium"><History className="h-4 w-4" /> Historial</h3>
        <div className="flex gap-2">
          <SelectField label="Automatización" value={automation} onValueChange={setAutomation}
            options={[{ value: "all", label: "Todas" }, ...(automations ?? []).map((item) => ({ value: item.key, label: item.label || item.key }))]} />
          <SelectField label="Resultado" value={status} onValueChange={setStatus} options={FILTERS} />
        </div>
      </div>
      {query.error ? (
        <ErrorState title="No se pudo cargar el historial" description={query.error.message} />
      ) : (query.data ?? []).length === 0 ? (
        <EmptyState icon={History} title="Sin ejecuciones" description="Aquí aparecen las veces que corrió cada automatización y si salió bien." />
      ) : (
        <ul className="divide-y divide-[hsl(var(--border))] rounded-lg border border-[hsl(var(--border))]">
          {query.data.map((run) => (
            <li key={run.id} className="space-y-1 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={STATUS[run.status]?.variant ?? "outline"}>{STATUS[run.status]?.label ?? run.status}</Badge>
                <span className="font-medium">{labels.get(run.automationKey) ?? run.automationKey}</span>
                <span className="text-xs text-[hsl(var(--muted-foreground))]">
                  {run.triggerKind === "event" ? "Evento" : "Registro"} · {new Date(run.createdAt).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })} · {run.durationMs} ms
                </span>
              </div>
              {run.error && <p className="text-xs text-red-600 dark:text-red-400">{run.error}</p>}
              {Array.isArray(run.steps) && run.steps.length > 1 && (
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  {run.steps.map((step) => `${step.index + 1}: ${step.skipped ? "omitido" : step.ok ? "ok" : "falló"}`).join(" · ")}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
