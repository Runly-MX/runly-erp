// Module Builder — "Qué hacer" of an automation: an ordered list of up to
// MAX_STEPS service calls (spec 2026-10-24-automation-studio-v2-design.md).
import { Button, SelectField, SwitchField } from "@runly/ui";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { MAX_STEPS, SERVICE_CONTRACTS, automationServices } from "@runly/module-compiler/browser";
import { AutomationArgsEditor } from "./AutomationArgsEditor";

const OWNER_LABELS = {
  "runly.calendar": "Calendario", "runly.files": "Archivos", "runly.notifications": "Notificaciones", "runly.contacts": "Contactos",
  "runly.inventory": "Inventario", "runly.projects": "Proyectos", "runly.ledger": "Libro de cuentas", "runly.fleet": "Flota", "runly.pfm": "Finanzas personales",
};
export const serviceLabel = (key, label) => `${OWNER_LABELS[key.split(":")[0]] ?? key.split(":")[0]} · ${label}`;

export function AutomationSteps({ steps, triggerType, onError, fieldOptions, readOnly, onSteps, onOnError }) {
  const services = automationServices({ trigger: triggerType });
  const setStep = (index, step) => onSteps(steps.map((item, i) => (i === index ? step : item)));
  const move = (index, delta) => {
    const next = [...steps];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    onSteps(next);
  };

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">Qué hacer</p>
      {steps.map((step, index) => (
        <div key={index} className="space-y-3 rounded-lg border border-[hsl(var(--border))] p-3">
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <SelectField label={steps.length > 1 ? `Paso ${index + 1}` : "Acción"}
                options={services.map((service) => ({ value: service.key, label: serviceLabel(service.key, service.label) }))}
                value={step.service ?? ""} disabled={readOnly} placeholder="Elige una acción"
                onValueChange={(service) => setStep(index, { service, args: {} })} />
            </div>
            {!readOnly && steps.length > 1 && (
              <>
                <Button variant="ghost" size="sm" disabled={index === 0} onClick={() => move(index, -1)} aria-label="Subir paso"><ArrowUp className="h-4 w-4" /></Button>
                <Button variant="ghost" size="sm" disabled={index === steps.length - 1} onClick={() => move(index, 1)} aria-label="Bajar paso"><ArrowDown className="h-4 w-4" /></Button>
                <Button variant="ghost" size="sm" onClick={() => onSteps(steps.filter((_, i) => i !== index))} aria-label="Quitar paso"><Trash2 className="h-4 w-4" /></Button>
              </>
            )}
          </div>
          <AutomationArgsEditor contract={SERVICE_CONTRACTS[step.service]} args={step.args ?? {}} triggerType={triggerType}
            fieldOptions={fieldOptions} readOnly={readOnly} onChange={(args) => setStep(index, { ...step, args })} />
        </div>
      ))}
      {triggerType === "event" && (
        <p className="text-xs text-[hsl(var(--muted-foreground))]">
          Desde un evento no hay una persona que guarde, por eso solo aparecen las acciones que pueden correr en segundo plano.
        </p>
      )}
      {!readOnly && steps.length < MAX_STEPS && (
        <Button variant="outline" size="sm" onClick={() => onSteps([...steps, { service: "", args: {} }])}>
          <Plus className="mr-1 h-4 w-4" /> Agregar paso
        </Button>
      )}
      {steps.length > 1 && (
        <SwitchField label="Si un paso falla, seguir con los siguientes" checked={onError === "continue"} disabled={readOnly}
          onChange={(checked) => onOnError(checked ? "continue" : "stop")} />
      )}
    </div>
  );
}
