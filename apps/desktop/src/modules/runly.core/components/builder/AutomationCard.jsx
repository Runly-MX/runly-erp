// Module Builder — one automation card: name, trigger, conditions and steps.
// Works on the v2 shape (`steps`); a v1 `action` is read as a single step and
// rewritten as `steps` on the first edit.
import { Badge, Button, Card, CardContent, SelectField, SwitchField, TextField } from "@runly/ui";
import { Trash2, Zap } from "lucide-react";
import { stepsOf } from "@runly/module-compiler/browser";
import { AutomationConditions } from "./AutomationConditions";
import { AutomationSteps } from "./AutomationSteps";

const TRIGGER_TYPES = [
  { value: "record", label: "Cuando se guarda un registro de este módulo" },
  { value: "event", label: "Cuando pasa algo en otro módulo" },
];
const ON_OPTIONS = [
  { value: "create", label: "Al crear" },
  { value: "update", label: "Al actualizar" },
  { value: "save", label: "Al crear o actualizar" },
];

const keyOf = (item) => item.key ?? item.name;
const emptySteps = [{ service: "", args: {} }];

function TriggerEditor({ automation, entities, events, readOnly, onPatch }) {
  const trigger = automation.trigger;
  // Changing what triggers the automation invalidates the mapped arguments.
  const resetSteps = (steps) => steps.map((step) => ({ ...step, args: {} }));
  const steps = stepsOf(automation);
  const setTrigger = (patch) => onPatch({ trigger: { ...trigger, ...patch } });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <SelectField label="Cuándo" options={TRIGGER_TYPES} value={trigger.type} disabled={readOnly}
        onValueChange={(type) => onPatch({
          trigger: type === "record" ? { type, entity: keyOf(entities[0] ?? {}), on: "create" } : { type, event: events[0]?.key },
          // Event triggers only allow services that run without a person.
          steps: emptySteps,
        })} />
      {trigger.type === "record" ? (
        <>
          <SelectField label="Entidad" options={entities.map((item) => ({ value: keyOf(item), label: item.label ?? keyOf(item) }))}
            value={trigger.entity ?? ""} disabled={readOnly}
            onValueChange={(value) => onPatch({ trigger: { type: "record", entity: value, on: trigger.on }, steps: resetSteps(steps) })} />
          <SelectField label="Momento" options={ON_OPTIONS} value={trigger.on} disabled={readOnly}
            onValueChange={(on) => setTrigger({ on, ...(on === "create" ? { when: dropChanged(trigger.when) } : {}) })} />
        </>
      ) : (
        <SelectField label="Evento" options={events.map((event) => ({ value: event.key, label: event.label }))}
          value={trigger.event ?? ""} disabled={readOnly}
          onValueChange={(event) => onPatch({ trigger: { type: "event", event }, steps: resetSteps(steps) })} />
      )}
    </div>
  );
}

// "Cambió" only applies to updates: drop those conditions when switching to create.
function dropChanged(when) {
  if (!when) return undefined;
  const list = (Array.isArray(when) ? when : [when]).filter((condition) => condition.op !== "changed");
  if (!list.length) return undefined;
  return list.length === 1 ? list[0] : list;
}

export function AutomationCard({ automation, entities, events, readOnly, onPatch, onRemove }) {
  const trigger = automation.trigger;
  const steps = stepsOf(automation);
  const entity = entities.find((item) => keyOf(item) === trigger.entity);
  const fieldOptions = trigger.type === "event"
    ? (events.find((event) => event.key === trigger.event)?.payload ?? []).map((key) => ({ value: key, label: key }))
    : (entity?.fields ?? []).map((field) => ({ value: keyOf(field), label: field.label ?? keyOf(field) }));

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Zap className="h-4 w-4 text-[--color-primary]" />
            <span className="font-medium">{automation.label || "Automatización"}</span>
            {automation.enabled === false && <Badge variant="outline">Pausada</Badge>}
            <span className="font-mono text-xs text-[hsl(var(--muted-foreground))]">{automation.key}</span>
          </div>
          {!readOnly && (
            <Button variant="ghost" size="sm" onClick={onRemove} aria-label="Quitar automatización">
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <TextField label="Nombre" required value={automation.label ?? ""} disabled={readOnly} maxLength={120}
            onChange={(e) => onPatch({ label: e.target.value })} />
          <SwitchField label="Activa" checked={automation.enabled !== false} disabled={readOnly} onChange={(enabled) => onPatch({ enabled })} />
        </div>
        <TriggerEditor automation={automation} entities={entities} events={events} readOnly={readOnly} onPatch={onPatch} />
        <AutomationConditions trigger={trigger} fieldOptions={fieldOptions} readOnly={readOnly}
          onChange={(when) => onPatch({ trigger: { ...trigger, when } })} />
        <AutomationSteps steps={steps} triggerType={trigger.type} onError={automation.onError} fieldOptions={fieldOptions} readOnly={readOnly}
          onSteps={(next) => onPatch({ steps: next })} onOnError={(onError) => onPatch({ onError: onError === "continue" ? "continue" : undefined })} />
      </CardContent>
    </Card>
  );
}
