// Module Builder — "Probar" an automation with sample data. Nothing runs and
// nothing is saved: it shows whether the conditions pass and the exact data
// each step would send (spec 2026-10-25-automation-studio-v2-stage-c-reach-design.md, C1).
import { useMemo, useState } from "react";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, TextField } from "@runly/ui";
import { Check, FlaskConical, X } from "lucide-react";
import { conditionsOf, previewAutomation } from "@runly/module-compiler/browser";

const OP_TEXT = {
  equals: "es igual a", not_equals: "es distinto de", contains: "contiene", gt: "es mayor que", lt: "es menor que", changed: "cambió", filled: "tiene valor",
};

function conditionText(condition) {
  const value = condition.value === undefined ? "" : ` ${JSON.stringify(condition.value)}`;
  return `${condition.field} ${OP_TEXT[condition.op] ?? condition.op}${value}`;
}

function StepResult({ step }) {
  return (
    <li className="space-y-1 rounded-lg border border-[hsl(var(--border))] p-3 text-sm">
      <p className="font-medium">{step.index + 1}. {step.summary}</p>
      {step.kind === "service" && (
        <pre className="overflow-x-auto rounded-md bg-[hsl(var(--muted))] p-2 text-xs">{JSON.stringify(step.args, null, 2)}</pre>
      )}
      {step.kind === "http" && (
        <pre className="overflow-x-auto rounded-md bg-[hsl(var(--muted))] p-2 text-xs">{JSON.stringify(step.body, null, 2)}</pre>
      )}
      {step.kind === "approval" && <p className="text-xs text-[hsl(var(--muted-foreground))]">«{step.message}»</p>}
      {step.problems?.length > 0 && (
        <ul className="list-disc pl-5 text-xs text-red-600 dark:text-red-400">
          {step.problems.map((problem) => <li key={problem}>{problem}</li>)}
        </ul>
      )}
    </li>
  );
}

export function AutomationTestDialog({ open, onOpenChange, automation, fieldOptions }) {
  const [sample, setSample] = useState({});
  const isUpdate = automation?.trigger?.type === "record" && automation.trigger.on !== "create";
  const result = useMemo(() => {
    if (!open || !automation) return null;
    const data = Object.fromEntries(Object.entries(sample).filter(([, value]) => value !== ""));
    try {
      return previewAutomation(automation, { data, previous: isUpdate ? {} : null });
    } catch (error) {
      return { error: error?.message ?? "No se pudo probar." };
    }
  }, [open, automation, sample, isUpdate]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="2xl" className="flex max-h-[92dvh] flex-col md:max-w-3xl">
        <DialogHeader icon={FlaskConical}>
          <DialogTitle>Probar automatización</DialogTitle>
          <DialogDescription>Escribe datos de ejemplo y mira qué haría. No se ejecuta nada ni se guarda ningún dato.</DialogDescription>
        </DialogHeader>
        <div className="-mx-6 min-h-0 flex-1 space-y-5 overflow-y-auto px-6 pb-1">
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Datos de ejemplo</h3>
            {fieldOptions.length === 0 ? (
              <p className="text-xs text-[hsl(var(--muted-foreground))]">Esta automatización no usa datos del registro.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {fieldOptions.map((field) => (
                  <TextField key={field.value} label={field.label} value={sample[field.value] ?? ""}
                    onChange={(e) => setSample((current) => ({ ...current, [field.value]: e.target.value }))} />
                ))}
              </div>
            )}
            {isUpdate && <p className="text-xs text-[hsl(var(--muted-foreground))]">Al actualizar, «cambió» se prueba contra un registro anterior vacío.</p>}
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Resultado</h3>
            {result?.error ? (
              <p className="text-sm text-red-600">{result.error}</p>
            ) : result && (
              <>
                {conditionsOf(automation.trigger?.when).length > 0 && (
                  <ul className="space-y-1 text-sm">
                    {result.conditions.map((item, index) => (
                      <li key={index} className="flex items-center gap-2">
                        {item.passes ? <Check className="h-4 w-4 text-emerald-600" /> : <X className="h-4 w-4 text-red-600" />}
                        <span>{conditionText(item.condition)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {result.passes ? (
                  <ol className="space-y-2">{result.steps.map((step) => <StepResult key={step.index} step={step} />)}</ol>
                ) : (
                  <p className="rounded-lg border border-dashed border-[hsl(var(--border))] p-3 text-sm text-[hsl(var(--muted-foreground))]">
                    Con estos datos no se cumplen las condiciones: la automatización no correría.
                  </p>
                )}
              </>
            )}
          </section>
        </div>
        <DialogFooter className="shrink-0">
          <Button onClick={() => onOpenChange(false)}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
