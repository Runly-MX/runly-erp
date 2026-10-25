// Module Builder — trigger of an automation: what starts it (a record saved, a
// system event or a schedule) and its parameters. Shared by the form view and
// the visual editor.
import { SelectField } from "@runly/ui";
import { stepsOf } from "@runly/module-compiler/browser";
import { WebhookTriggerPanel } from "./WebhookTriggerPanel";
import { keyOf } from "../../lib/flowModel";

export { fieldOptionsFor, keyOf } from "../../lib/flowModel";

const TRIGGER_TYPES = [
  { value: "record", label: "Cuando se guarda un registro de este módulo" },
  { value: "event", label: "Cuando pasa algo en otro módulo" },
  { value: "schedule", label: "En un horario" },
  { value: "webhook", label: "Cuando otro sistema me envía datos" },
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

export const emptySteps = [{ service: "", args: {} }];

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

// `compact` = one column (the canvas inspector is narrow).
export function TriggerEditor({ automation, entities, events, allowedTriggers, readOnly, onPatch, compact = false }) {
  const trigger = automation.trigger;
  // Changing what triggers the automation invalidates the mapped arguments.
  const resetSteps = (steps) => steps.map((step) => (step.type === "delay" ? step : { ...step, args: {} }));
  const steps = stepsOf(automation);
  const setTrigger = (patch) => onPatch({ trigger: { ...trigger, ...patch } });
  const changeType = (type) => {
    if (type === "record") onPatch({ trigger: { type, entity: keyOf(entities[0] ?? {}), on: "create" }, steps: emptySteps });
    else if (type === "event") onPatch({ trigger: { type, event: events[0]?.key }, steps: emptySteps });
    else if (type === "webhook") onPatch({ trigger: { type, fields: [] }, steps: emptySteps });
    else onPatch({ trigger: { type, every: "day", at: "08:00" }, steps: emptySteps });
  };
  return (
    <div className={compact ? "grid gap-3" : "grid gap-3 sm:grid-cols-2"}>
      <SelectField label="Cuándo" options={TRIGGER_TYPES.filter((item) => !allowedTriggers || allowedTriggers.includes(item.value))} value={trigger.type} disabled={readOnly} onValueChange={changeType} />
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
      {trigger.type === "webhook" && <WebhookTriggerPanel automation={automation} readOnly={readOnly} onPatch={onPatch} />}
      {trigger.type === "schedule" && (
        <ScheduleFields trigger={trigger} entities={entities} readOnly={readOnly}
          onTrigger={(next) => onPatch({ trigger: next, steps: next.entity !== trigger.entity ? resetSteps(steps) : steps })} />
      )}
    </div>
  );
}
