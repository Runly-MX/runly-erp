// "Probar" an automation: type (or load) sample data, run it through the real
// engine in a sandbox and read what every block did. Services are simulated, waits
// are skipped and approvals count as approved, so nothing touches data, people or
// the network. Each attempt is also logged as a "Prueba" in the Consola (spec
// 2026-10-27-automation-events-chaining-sandbox-design.md §3).
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, TextField } from "@runly/ui";
import { Check, FlaskConical, Play, X } from "lucide-react";
import { conditionsOf } from "@runly/module-compiler/browser";
import { useAuth } from "../../../../auth/AuthProvider";
import { runly } from "../../../../lib/runly";
import { describeCondition } from "../../lib/flowModel";
import { StepResult } from "./AutomationConsole";

const STATUS = {
  success: { label: "Correcta", variant: "success" }, partial: { label: "Parcial", variant: "warning" },
  failed: { label: "Falló", variant: "destructive" }, cancelled: { label: "No corrió", variant: "outline" },
};

function Attempt({ attempt, automation, fieldLabel }) {
  const status = STATUS[attempt.status] ?? STATUS.failed;
  const hasConditions = conditionsOf(automation?.trigger?.when).length > 0;
  return (
    <li className="space-y-2 rounded-lg border border-[hsl(var(--border))] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={status.variant}>{status.label}</Badge>
        <span className="text-xs text-[hsl(var(--muted-foreground))]">Intento {attempt.number} · {attempt.at}</span>
      </div>
      {hasConditions && (
        <ul className="space-y-1 text-sm">
          {attempt.conditions.map((item, index) => (
            <li key={index} className="flex items-center gap-2">
              {item.passes ? <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" /> : <X className="h-4 w-4 text-red-600" aria-hidden="true" />}
              <span>{describeCondition(item.condition, fieldLabel)}</span>
            </li>
          ))}
        </ul>
      )}
      {attempt.error && <p className="rounded-md border border-red-500/30 bg-red-500/5 p-2 text-xs text-red-700 dark:text-red-300">{attempt.error}</p>}
      {attempt.steps.length > 0 && (
        <ol className="space-y-2">
          {attempt.steps.map((entry) => <StepResult key={entry.index} entry={entry} step={automation.steps?.[entry.index]} />)}
        </ol>
      )}
    </li>
  );
}

export function AutomationTestDialog({ moduleKey, open, onOpenChange, automation, fieldOptions }) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [sample, setSample] = useState({});
  const [attempts, setAttempts] = useState([]);
  const isUpdate = automation?.trigger?.type === "record" && automation.trigger.on !== "create";
  const fieldLabel = (name) => fieldOptions.find((option) => option.value === name)?.label ?? name;
  const hasExamples = fieldOptions.some((field) => field.example);

  const run = useMutation({
    mutationFn: async () => {
      const data = Object.fromEntries(Object.entries(sample).filter(([, value]) => value !== ""));
      return (await runly.modules.automationTest(moduleKey, { automation, data, previous: isUpdate ? {} : null }, session?.access_token))?.data;
    },
    onSuccess: (result) => {
      setAttempts((current) => [{ ...result, number: current.length + 1, at: new Date().toLocaleTimeString("es-MX") }, ...current]);
      queryClient.invalidateQueries({ queryKey: ["automation-console", moduleKey, automation.key] });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="2xl" className="flex max-h-[92dvh] flex-col md:max-w-3xl">
        <DialogHeader icon={FlaskConical}>
          <DialogTitle>Probar automatización</DialogTitle>
          <DialogDescription>Ejecuta el flujo con datos de ejemplo. Los módulos, personas y llamadas externas son simulados: no se crea, avisa ni envía nada de verdad. Cada intento queda en la Consola.</DialogDescription>
        </DialogHeader>
        <div className="-mx-6 min-h-0 flex-1 space-y-5 overflow-y-auto px-6 pb-1">
          <section className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Datos de ejemplo</h3>
              {hasExamples && (
                <Button variant="outline" size="sm" onClick={() => setSample(Object.fromEntries(fieldOptions.filter((field) => field.example).map((field) => [field.value, field.example])))}>
                  Cargar ejemplo
                </Button>
              )}
            </div>
            {fieldOptions.length === 0 ? (
              <p className="text-xs text-[hsl(var(--muted-foreground))]">Esta automatización no usa datos del disparador.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {fieldOptions.map((field) => (
                  <TextField key={field.value} label={field.label} hint={[field.value !== field.label ? field.value : null, field.description].filter(Boolean).join(" · ") || undefined} placeholder={field.example ? `Ej. ${field.example}` : undefined}
                    value={sample[field.value] ?? ""} onChange={(e) => setSample((current) => ({ ...current, [field.value]: e.target.value }))} />
                ))}
              </div>
            )}
            {isUpdate && <p className="text-xs text-[hsl(var(--muted-foreground))]">Al actualizar, «cambió» se prueba contra un registro anterior vacío.</p>}
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Intentos</h3>
            {run.isError && <p className="text-sm text-red-600">{run.error?.message ?? "No se pudo ejecutar la prueba."}</p>}
            {attempts.length === 0 ? (
              <p className="rounded-lg border border-dashed border-[hsl(var(--border))] p-3 text-sm text-[hsl(var(--muted-foreground))]">Aún no has ejecutado una prueba.</p>
            ) : (
              <ul className="space-y-3">{attempts.map((attempt) => <Attempt key={attempt.number} attempt={attempt} automation={automation} fieldLabel={fieldLabel} />)}</ul>
            )}
          </section>
        </div>
        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
          <Button onClick={() => run.mutate()} disabled={run.isPending}><Play className="mr-1 h-4 w-4" aria-hidden="true" />{run.isPending ? "Ejecutando..." : "Ejecutar prueba"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
