// Module Builder — "Qué hacer" of an automation: an ordered list of up to
// MAX_STEPS items, each a service call or a wait (specs
// 2026-10-24-automation-studio-v2-design.md and ...-stage-b-time-design.md).
// Steps after a wait, and every step of a schedule, only offer services that
// run without a person.
import { Button, SelectField, SwitchField, TextField } from "@runly/ui";
import { ArrowDown, ArrowUp, Clock, GitBranch, Globe, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { MAX_BRANCHES, MAX_DELAYS, MAX_STEPS, SERVICE_CONTRACTS, automationServices, branchLanes, isApprovalStep, isBranchStep, isDelayStep, isHttpStep, isPauseStep, laneOwner } from "@runly/module-compiler/browser";
import { AutomationConditions } from "./AutomationConditions";
import { AutomationArgsEditor } from "./AutomationArgsEditor";
import { ApprovalStepEditor, HttpStepEditor } from "./AutomationStepEditors";
import { insertStep, moveStep, outputsOf, removeStep, withStepOutputs } from "../../lib/flowModel";
import { InspectorSection } from "./InspectorSection";

const OWNER_LABELS = {
  "runly.calendar": "Calendario", "runly.files": "Archivos", "runly.notifications": "Notificaciones", "runly.contacts": "Contactos",
  "runly.inventory": "Inventario", "runly.projects": "Proyectos", "runly.ledger": "Libro de cuentas", "runly.fleet": "Flota", "runly.pfm": "Finanzas personales",
  "runly.purchases": "Compras", "runly.hr": "Recursos Humanos", "runly.documents": "Documentos",
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

// Body of one step: the editor that matches its kind. `withServiceSelect` is the
// canvas inspector: the action picker on top and the content in titled sections
// (the form list draws its own header and shows the content plain).
export function StepEditor({ step, steps, index, triggerType, fieldOptions, readOnly, onChange, withServiceSelect = false, label = "Acción" }) {
  const afterDelay = steps.slice(0, index).some(isPauseStep);
  const argsTrigger = triggerType === "schedule" ? "event" : triggerType;
  // The trigger's data plus what the blocks before this one return.
  const available = withStepOutputs(fieldOptions, steps, index, ownerLabel);
  const section = (title, description, body) => (withServiceSelect ? <InspectorSection title={title} description={description}>{body}</InspectorSection> : body);

  if (isBranchStep(step)) {
    return section("Qué comprobar", "Si se cumplen todas las condiciones el flujo sigue por «Sí»; si no, por «No». Los dos caminos se juntan después.",
      <div className="space-y-3">
        <AutomationConditions trigger={{ type: "event", when: step.when }} heading="Si..." fieldOptions={available} readOnly={readOnly}
          onChange={(when) => onChange({ ...step, when: when ?? [] })} />
        <p className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/50 px-3 py-2 text-xs text-[hsl(var(--muted-foreground))]">
          Camino «Sí»: {step.yes} {step.yes === 1 ? "bloque" : "bloques"} · camino «No»: {step.no} {step.no === 1 ? "bloque" : "bloques"}. Agrega bloques con el «+» de cada camino en el lienzo, o aquí con «Agregar paso».
        </p>
      </div>);
  }
  if (isDelayStep(step)) return section("Cuánto espera", "Después de esperar, el flujo sigue en segundo plano.", <DelayEditor step={step} readOnly={readOnly} onChange={onChange} />);
  if (isApprovalStep(step)) return section("Quién aprueba", "El flujo se detiene hasta que una persona decida.", <ApprovalStepEditor step={step} readOnly={readOnly} onChange={onChange} />);
  if (isHttpStep(step)) {
    return section("Llamada a otro sistema", "Envía los datos por HTTPS a un servidor permitido.",
      <HttpStepEditor step={step} triggerType={triggerType === "schedule" || afterDelay ? "event" : triggerType} fieldOptions={available} readOnly={readOnly} onChange={onChange} />);
  }
  const services = automationServices({ trigger: triggerType, afterDelay });
  const outputs = outputsOf(step, index);
  return (
    <div className="space-y-4">
      {withServiceSelect && (
        <InspectorSection title="Acción" description="Qué hace este bloque en otro módulo.">
          <SelectField label={label} options={services.map((service) => ({ value: service.key, label: serviceLabel(service.key, service.label) }))}
            value={step.service ?? ""} disabled={readOnly} placeholder="Elige una acción"
            onValueChange={(service) => onChange({ service, args: {} })} />
        </InspectorSection>
      )}
      {SERVICE_CONTRACTS[step.service] && section("Datos que se envían", "Para cada dato, elige de dónde sale su valor.",
        <AutomationArgsEditor contract={SERVICE_CONTRACTS[step.service]} args={step.args ?? {}} triggerType={argsTrigger}
          fieldOptions={available} readOnly={readOnly} onChange={(args) => onChange({ ...step, args })} />)}
      {withServiceSelect && outputs.length > 0 && (
        <InspectorSection title="Lo que devuelve" description="Los bloques que van después pueden usar estos datos.">
          <ul className="flex flex-wrap gap-1.5">
            {outputs.slice(0, 8).map((output) => <li key={output.value} className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/50 px-2 py-0.5 text-xs">{output.label}</li>)}
          </ul>
        </InspectorSection>
      )}
    </div>
  );
}

export function AutomationSteps({ steps, triggerType, onError, fieldOptions, readOnly, onSteps, onOnError }) {
  const delays = steps.filter(isDelayStep).length;
  const setStep = (index, step) => onSteps(steps.map((item, i) => (i === index ? step : item)));
  const move = (index, delta) => {
    const next = moveStep(steps, index, index + delta);
    if (next) onSteps(next);
  };
  // Which path of a condition a block belongs to, for the label on its card.
  const pathOf = (index) => {
    const owner = laneOwner(steps, index);
    if (owner < 0) return null;
    return { number: steps.slice(0, owner + 1).filter(isBranchStep).length, yes: index < branchLanes(steps[owner], owner).yes[1] };
  };
  const addCondition = () => {
    const result = insertStep(steps, steps.length, "branch");
    if (result.ok) onSteps(result.steps);
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
        const branch = isBranchStep(step);
        const path = pathOf(index);
        const builtIn = delay || approval || http || branch;
        if (!builtIn) actionNumber += 1;
        const afterDelay = steps.slice(0, index).some(isPauseStep);
        const services = automationServices({ trigger: triggerType, afterDelay });
        return (
          <div key={index} className="space-y-3 rounded-lg border border-[hsl(var(--border))] p-3">
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                {path && <p className="pb-1 text-xs font-medium text-[hsl(var(--muted-foreground))]">Camino «{path.yes ? "Sí" : "No"}» de la condición {path.number}</p>}
                {branch ? <StepTitle icon={GitBranch}>Condición Sí / No</StepTitle>
                  : delay ? <StepTitle icon={Clock}>Espera</StepTitle>
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
                  <Button variant="ghost" size="sm" disabled={!moveStep(steps, index, index - 1)} onClick={() => move(index, -1)} aria-label="Subir paso"><ArrowUp className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="sm" disabled={!moveStep(steps, index, index + 1)} onClick={() => move(index, 1)} aria-label="Bajar paso"><ArrowDown className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="sm" onClick={() => onSteps(removeStep(steps, index))} aria-label="Quitar paso"><Trash2 className="h-4 w-4" /></Button>
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
          {canAddAction && steps.length <= MAX_STEPS - 4 && steps.filter(isBranchStep).length < MAX_BRANCHES && (
            <Button variant="outline" size="sm" onClick={addCondition}>
              <GitBranch className="mr-1 h-4 w-4" /> Agregar condición Sí / No
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
