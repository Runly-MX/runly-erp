// Module Builder — one automation card: name, trigger, conditions and steps.
// Works on the v2 shape (`steps`); a v1 `action` is read as a single step and
// rewritten as `steps` on the first edit.
import { Badge, Button, Card, CardContent, SelectField, SwitchField, TextField } from "@runly/ui";
import { useState } from "react";
import { FlaskConical, Trash2, Zap } from "lucide-react";
import { stepsOf } from "@runly/module-compiler/browser";
import { AutomationConditions } from "./AutomationConditions";
import { AutomationSteps } from "./AutomationSteps";
import { AutomationTestDialog } from "./AutomationTestDialog";

const TRIGGER_TYPES = [
  { value: "record", label: "Cuando se guarda un registro de este módulo" },
  { value: "event", label: "Cuando pasa algo en otro módulo" },
  { value: "schedule", label: "En un horario" },
];
const ON_OPTIONS = [
  { value: "create", label: "Al crear" },
  { value: "update", label: "Al actualizar" },
  { value: "save", label: "Al crear o actualizar" },
];
const EVERY_OPTIONS = [
  { value: "hour", label: "Cada hora" },
  { value: "day", label: "Cada día" },
  { value: "week", label: "Cada semana" },
  { value: "month", label: "Cada mes" },
];
const WEEKDAY_OPTIONS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"].map((label, value) => ({ value: String(value), label }));
const DAY_OPTIONS = Array.from({ length: 28 }, (_, index) => ({ value: String(index + 1), label: `Día ${index + 1}` }));
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour) => ({ value: String(hour).padStart(2, "0"), label: String(hour).padStart(2, "0") }));
const MINUTE_OPTIONS = ["00", "15", "30", "45"].map((value) => ({ value, label: value }));
const NO_ENTITY = "none";

const keyOf = (item) => item.key ?? item.name;
const emptySteps = [{ service: "", args: {} }];

// "Cambió" only applies to updates: drop those conditions when switching to create.
function dropChanged(when) {
  if (!when) return undefined;
  const list = (Array.isArray(when) ? when : [when]).filter((condition) => condition.op !== "changed");
  if (!list.length) return undefined;
  return list.length === 1 ? list[0] : list;
}

function ScheduleFields({ trigger, entities, readOnly, onTrigger }) {
  const [hour = "08", minute = "00"] = String(trigger.at ?? "08:00").split(":");
  const setTime = (nextHour, nextMinute) => onTrigger({ ...trigger, at: `${nextHour}:${nextMinute}` });
  return (
    <>
      <SelectField label="Frecuencia" options={EVERY_OPTIONS} value={trigger.every ?? "day"} disabled={readOnly}
        onValueChange={(every) => onTrigger({
          type: "schedule", every, entity: trigger.entity, when: trigger.when,
          ...(every === "hour" ? {} : { at: trigger.at ?? "08:00" }),
          ...(every === "week" ? { weekday: trigger.weekday ?? 1 } : {}),
          ...(every === "month" ? { day: trigger.day ?? 1 } : {}),
        })} />
      {trigger.every === "week" && (
        <SelectField label="Día de la semana" options={WEEKDAY_OPTIONS} value={String(trigger.weekday ?? 1)} disabled={readOnly}
          onValueChange={(weekday) => onTrigger({ ...trigger, weekday: Number(weekday) })} />
      )}
      {trigger.every === "month" && (
        <SelectField label="Día del mes" options={DAY_OPTIONS} value={String(trigger.day ?? 1)} disabled={readOnly}
          onValueChange={(day) => onTrigger({ ...trigger, day: Number(day) })} />
      )}
      {trigger.every !== "hour" && (
        <div className="grid grid-cols-2 gap-3">
          <SelectField label="Hora" options={HOUR_OPTIONS} value={hour} disabled={readOnly} onValueChange={(value) => setTime(value, minute)} />
          <SelectField label="Minuto" options={MINUTE_OPTIONS} value={MINUTE_OPTIONS.some((item) => item.value === minute) ? minute : "00"} disabled={readOnly} onValueChange={(value) => setTime(hour, value)} />
        </div>
      )}
      <SelectField label="Para cada registro de" options={[{ value: NO_ENTITY, label: "Una sola vez (sin registros)" }, ...entities.map((item) => ({ value: keyOf(item), label: item.label ?? keyOf(item) }))]}
        value={trigger.entity ?? NO_ENTITY} disabled={readOnly}
        onValueChange={(entity) => onTrigger({ ...trigger, entity: entity === NO_ENTITY ? undefined : entity, when: undefined })} />
    </>
  );
}

function TriggerEditor({ automation, entities, events, readOnly, onPatch }) {
  const trigger = automation.trigger;
  // Changing what triggers the automation invalidates the mapped arguments.
  const resetSteps = (steps) => steps.map((step) => (step.type === "delay" ? step : { ...step, args: {} }));
  const steps = stepsOf(automation);
  const setTrigger = (patch) => onPatch({ trigger: { ...trigger, ...patch } });
  const changeType = (type) => {
    if (type === "record") onPatch({ trigger: { type, entity: keyOf(entities[0] ?? {}), on: "create" }, steps: emptySteps });
    else if (type === "event") onPatch({ trigger: { type, event: events[0]?.key }, steps: emptySteps });
    else onPatch({ trigger: { type, every: "day", at: "08:00" }, steps: emptySteps });
  };
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <SelectField label="Cuándo" options={TRIGGER_TYPES} value={trigger.type} disabled={readOnly} onValueChange={changeType} />
      {trigger.type === "record" && (
        <>
          <SelectField label="Entidad" options={entities.map((item) => ({ value: keyOf(item), label: item.label ?? keyOf(item) }))}
            value={trigger.entity ?? ""} disabled={readOnly}
            onValueChange={(value) => onPatch({ trigger: { type: "record", entity: value, on: trigger.on }, steps: resetSteps(steps) })} />
          <SelectField label="Momento" options={ON_OPTIONS} value={trigger.on} disabled={readOnly}
            onValueChange={(on) => setTrigger({ on, ...(on === "create" ? { when: dropChanged(trigger.when) } : {}) })} />
        </>
      )}
      {trigger.type === "event" && (
        <SelectField label="Evento" options={events.map((event) => ({ value: event.key, label: event.label }))}
          value={trigger.event ?? ""} disabled={readOnly}
          onValueChange={(event) => onPatch({ trigger: { type: "event", event }, steps: resetSteps(steps) })} />
      )}
      {trigger.type === "schedule" && (
        <ScheduleFields trigger={trigger} entities={entities} readOnly={readOnly}
          onTrigger={(next) => onPatch({ trigger: next, steps: next.entity !== trigger.entity ? resetSteps(steps) : steps })} />
      )}
    </div>
  );
}

export function AutomationCard({ automation, entities, events, readOnly, onPatch, onRemove }) {
  const trigger = automation.trigger;
  const steps = stepsOf(automation);
  const entity = entities.find((item) => keyOf(item) === trigger.entity);
  const fieldOptions = trigger.type === "event"
    ? (events.find((event) => event.key === trigger.event)?.payload ?? []).map((key) => ({ value: key, label: key }))
    : (entity?.fields ?? []).map((field) => ({ value: keyOf(field), label: field.label ?? keyOf(field) }));
  const showConditions = trigger.type !== "schedule" || Boolean(trigger.entity);
  const [testOpen, setTestOpen] = useState(false);

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
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => setTestOpen(true)}>
              <FlaskConical className="mr-1 h-4 w-4" /> Probar
            </Button>
            {!readOnly && (
              <Button variant="ghost" size="sm" onClick={onRemove} aria-label="Quitar automatización">
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <TextField label="Nombre" required value={automation.label ?? ""} disabled={readOnly} maxLength={120}
            onChange={(e) => onPatch({ label: e.target.value })} />
          <SwitchField label="Activa" checked={automation.enabled !== false} disabled={readOnly} onChange={(enabled) => onPatch({ enabled })} />
        </div>
        <TriggerEditor automation={automation} entities={entities} events={events} readOnly={readOnly} onPatch={onPatch} />
        {showConditions && (
          <AutomationConditions trigger={trigger} fieldOptions={fieldOptions} readOnly={readOnly}
            onChange={(when) => onPatch({ trigger: { ...trigger, when } })} />
        )}
        <AutomationSteps steps={steps} triggerType={trigger.type} onError={automation.onError} fieldOptions={fieldOptions} readOnly={readOnly}
          onSteps={(next) => onPatch({ steps: next })} onOnError={(onError) => onPatch({ onError: onError === "continue" ? "continue" : undefined })} />
      </CardContent>
      <AutomationTestDialog open={testOpen} onOpenChange={setTestOpen} automation={automation} fieldOptions={fieldOptions} />
    </Card>
  );
}
