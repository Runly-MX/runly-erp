// Module Builder — "Qué hacer" of an automation: an ordered list of up to
// MAX_STEPS items, each a service call or a wait (specs
// 2026-10-24-automation-studio-v2-design.md and ...-stage-b-time-design.md).
// Steps after a wait, and every step of a schedule, only offer services that
// run without a person.
import { Button, SelectField, SwitchField, TextField } from "@runly/ui";
import { ArrowDown, ArrowUp, Clock, Globe, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { MAX_DELAYS, MAX_STEPS, SERVICE_CONTRACTS, automationServices, isApprovalStep, isDelayStep, isHttpStep, isPauseStep } from "@runly/module-compiler/browser";
import { AutomationArgsEditor } from "./AutomationArgsEditor";
import { ApprovalStepEditor, HttpStepEditor } from "./AutomationStepEditors";

const OWNER_LABELS = {
  "runly.calendar": "Calendario", "runly.files": "Archivos", "runly.notifications": "Notificaciones", "runly.contacts": "Contactos",
  "runly.inventory": "Inventario", "runly.projects": "Proyectos", "runly.ledger": "Libro de cuentas", "runly.fleet": "Flota", "runly.pfm": "Finanzas personales",
};
export const ownerLabel = (serviceKey) => OWNER_LABELS[serviceKey.split(":")[0]] ?? serviceKey.split(":")[0];
export const serviceLabel = (key, label) => `${OWNER_LABELS[key.split(":")[0]] ?? key.split(":")[0]} · ${label}`;

const UNIT_OPTIONS = [
  { value: "minutes", label: "Minutos" },
  { value: "hours", label: "Horas" },
  { value: "days", label: "Días" },
];
const newDelay = () => ({ type: "delay", amount: 1, unit: "days" });
const newApproval = () => ({ type: "approval", approvers: [], message: "" });
const newHttp = () => ({ type: "http", method: "POST", url: "", body: {} });
const emptyAction = () => ({ service: "", args: {} });

function StepTitle({ icon: Icon, children }) {
  return <p className="flex items-center gap-2 pb-2 text-sm font-medium"><Icon className="h-4 w-4 text-(--brand-primary)" /> {children}</p>;
}

export function DelayEditor({ step, readOnly, onChange }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <TextField label="Esperar" type="number" min={1} value={String(step.amount ?? 1)} disabled={readOnly}
        onChange={(e) => onChange({ ...step, amount: Math.max(1, Math.floor(Number(e.target.value) || 1)) })} />
      <SelectField label="Unidad" options={UNIT_OPTIONS} value={step.unit ?? "days"} disabled={readOnly}
        onValueChange={(unit) => onChange({ ...step, unit })} />
      <p className="text-xs text-[hsl(var(--muted-foreground))] sm:col-span-2">
        De 1 minuto a 30 días. Después de esperar, el resto de los pasos corre en segundo plano y solo ofrece acciones que no necesitan a una persona.
      </p>
    </div>
  );
}

// Body of one step: the editor that matches its kind. `withServiceSelect` adds the
// action picker on top (the visual editor's inspector; the form list draws its own).
export function StepEditor({ step, steps, index, triggerType, fieldOptions, readOnly, onChange, withServiceSelect = false, label = "Acción" }) {
  const afterDelay = steps.slice(0, index).some(isPauseStep);
  const argsTrigger = triggerType === "schedule" ? "event" : triggerType;
  if (isDelayStep(step)) return <DelayEditor step={step} readOnly={readOnly} onChange={onChange} />;
  if (isApprovalStep(step)) return <ApprovalStepEditor step={step} readOnly={readOnly} onChange={onChange} />;
  if (isHttpStep(step)) {
    return <HttpStepEditor step={step} triggerType={triggerType === "schedule" || afterDelay ? "event" : triggerType} fieldOptions={fieldOptions} readOnly={readOnly} onChange={onChange} />;
  }
  const services = automationServices({ trigger: triggerType, afterDelay });
  return (
    <div className="space-y-3">
      {withServiceSelect && (
        <SelectField label={label} options={services.map((service) => ({ value: service.key, label: serviceLabel(service.key, service.label) }))}
          value={step.service ?? ""} disabled={readOnly} placeholder="Elige una acción"
          onValueChange={(service) => onChange({ service, args: {} })} />
      )}
      <AutomationArgsEditor contract={SERVICE_CONTRACTS[step.service]} args={step.args ?? {}} triggerType={argsTrigger}
        fieldOptions={fieldOptions} readOnly={readOnly} onChange={(args) => onChange({ ...step, args })} />
    </div>
  );
}

export function AutomationSteps({ steps, triggerType, onError, fieldOptions, readOnly, onSteps, onOnError }) {
  const delays = steps.filter(isDelayStep).length;
  const setStep = (index, step) => onSteps(steps.map((item, i) => (i === index ? step : item)));
  const move = (index, delta) => {
    const next = [...steps];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    onSteps(next);
  };
  const approvals = steps.filter(isApprovalStep).length;
  const lastIsAction = steps.length > 0 && !isPauseStep(steps[steps.length - 1]);
  const canAddAction = !readOnly && steps.length < MAX_STEPS;
  const canAddPause = canAddAction && lastIsAction && steps.length <= MAX_STEPS - 2;
  const canAddDelay = canAddPause && delays < MAX_DELAYS;
  const canAddApproval = canAddPause && approvals < 1;
  const hasMany = steps.length > 1;
  let actionNumber = 0;

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">Qué hacer</p>
      {steps.map((step, index) => {
        const delay = isDelayStep(step);
        const approval = isApprovalStep(step);
        const http = isHttpStep(step);
        const builtIn = delay || approval || http;
        if (!builtIn) actionNumber += 1;
        const afterDelay = steps.slice(0, index).some(isPauseStep);
        const services = automationServices({ trigger: triggerType, afterDelay });
        return (
          <div key={index} className="space-y-3 rounded-lg border border-[hsl(var(--border))] p-3">
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                {delay ? <StepTitle icon={Clock}>Espera</StepTitle>
                  : approval ? <StepTitle icon={ShieldCheck}>Pedir aprobación</StepTitle>
                  : http ? <StepTitle icon={Globe}>Llamar a una URL</StepTitle>
                  : (
                  <SelectField label={hasMany ? `Paso ${index + 1}` : "Acción"}
                    options={services.map((service) => ({ value: service.key, label: serviceLabel(service.key, service.label) }))}
                    value={step.service ?? ""} disabled={readOnly} placeholder="Elige una acción"
                    onValueChange={(service) => setStep(index, { service, args: {} })} />
                )}
              </div>
              {!readOnly && hasMany && (
                <>
                  <Button variant="ghost" size="sm" disabled={index === 0} onClick={() => move(index, -1)} aria-label="Subir paso"><ArrowUp className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="sm" disabled={index === steps.length - 1} onClick={() => move(index, 1)} aria-label="Bajar paso"><ArrowDown className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="sm" onClick={() => onSteps(steps.filter((_, i) => i !== index))} aria-label="Quitar paso"><Trash2 className="h-4 w-4" /></Button>
                </>
              )}
            </div>
            <StepEditor step={step} steps={steps} index={index} triggerType={triggerType} fieldOptions={fieldOptions} readOnly={readOnly} onChange={(next) => setStep(index, next)} />
          </div>
        );
      })}
      {triggerType !== "record" && (
        <p className="text-xs text-[hsl(var(--muted-foreground))]">
          {triggerType === "schedule"
            ? "Un horario corre en segundo plano, sin una persona que guarde; por eso solo aparecen las acciones que pueden correr así."
            : "Desde un evento no hay una persona que guarde, por eso solo aparecen las acciones que pueden correr en segundo plano."}
        </p>
      )}
      {!readOnly && (
        <div className="flex flex-wrap gap-2">
          {canAddAction && (
            <Button variant="outline" size="sm" onClick={() => onSteps([...steps, emptyAction()])}>
              <Plus className="mr-1 h-4 w-4" /> Agregar paso
            </Button>
          )}
          {canAddAction && (
            <Button variant="outline" size="sm" onClick={() => onSteps([...steps, newHttp()])}>
              <Globe className="mr-1 h-4 w-4" /> Llamar a una URL
            </Button>
          )}
          {canAddDelay && (
            <Button variant="outline" size="sm" onClick={() => onSteps([...steps, newDelay(), emptyAction()])}>
              <Clock className="mr-1 h-4 w-4" /> Agregar espera
            </Button>
          )}
          {canAddApproval && (
            <Button variant="outline" size="sm" onClick={() => onSteps([...steps, newApproval(), emptyAction()])}>
              <ShieldCheck className="mr-1 h-4 w-4" /> Pedir aprobación
            </Button>
          )}
        </div>
      )}
      {actionNumber > 1 && (
        <SwitchField label="Si un paso falla, seguir con los siguientes" checked={onError === "continue"} disabled={readOnly}
          onChange={(checked) => onOnError(checked ? "continue" : "stop")} />
      )}
    </div>
  );
}
