// Pure helpers behind the visual automation editor ("Flujo"): inserting,
// moving and removing steps while keeping the rules the compiler enforces
// (docs/developers/automatizaciones.md), and the texts shown on each node.
// No React in here so it can be unit tested.
import { MAX_DELAYS, MAX_STEPS, SERVICE_CONTRACTS, isApprovalStep, isDelayStep, isHttpStep, isPauseStep } from "@runly/module-compiler/browser";

export const STEP_KINDS = Object.freeze({
  action: { label: "Hacer algo en un módulo", hint: "Crear un contacto, enviar una notificación, agendar un evento..." },
  delay: { label: "Esperar", hint: "Continuar después de unos minutos, horas o días" },
  approval: { label: "Pedir aprobación", hint: "Detenerse hasta que una persona apruebe o rechace" },
  http: { label: "Llamar a una URL", hint: "Enviar los datos a otro sistema (webhook)" },
});

export const newStep = (kind) => {
  if (kind === "delay") return { type: "delay", amount: 1, unit: "days" };
  if (kind === "approval") return { type: "approval", approvers: [], message: "" };
  if (kind === "http") return { type: "http", method: "POST", url: "", body: {} };
  return { service: "", args: {} };
};

const approvalsIn = (steps) => steps.filter(isApprovalStep).length;
const delaysIn = (steps) => steps.filter(isDelayStep).length;

// A wait or approval sits between two actions and never next to another pause.
export function isValidOrder(steps) {
  return steps.every((step, index) => !isPauseStep(step) || (index > 0 && index < steps.length - 1 && !isPauseStep(steps[index - 1])));
}

// Can a step of `kind` be inserted before position `index`? Returns the new list
// or a short reason in Spanish. Pauses get an empty action after them when they
// would otherwise end the flow.
export function insertStep(steps, index, kind) {
  if (steps.length >= MAX_STEPS) return { ok: false, reason: `Máximo ${MAX_STEPS} pasos por automatización.` };
  const pause = kind === "delay" || kind === "approval";
  if (!pause) return { ok: true, steps: [...steps.slice(0, index), newStep(kind), ...steps.slice(index)] };
  if (kind === "delay" && delaysIn(steps) >= MAX_DELAYS) return { ok: false, reason: `Máximo ${MAX_DELAYS} esperas por automatización.` };
  if (kind === "approval" && approvalsIn(steps) >= 1) return { ok: false, reason: "Solo una aprobación por automatización." };
  if (index === 0) return { ok: false, reason: "Antes de esperar o pedir una aprobación necesitas un paso." };
  if (isPauseStep(steps[index - 1]) || isPauseStep(steps[index])) return { ok: false, reason: "No puede ir junto a otra espera o aprobación." };
  const atEnd = index >= steps.length;
  const next = [...steps.slice(0, index), newStep(kind), ...(atEnd ? [newStep("action")] : []), ...steps.slice(index)];
  if (next.length > MAX_STEPS) return { ok: false, reason: `Máximo ${MAX_STEPS} pasos por automatización.` };
  return { ok: true, steps: next };
}

// Which kinds are available at a slot, with the reason when they are not.
export function slotOptions(steps, index) {
  return Object.keys(STEP_KINDS).map((kind) => {
    const result = insertStep(steps, index, kind);
    return { kind, ...STEP_KINDS[kind], disabled: !result.ok, reason: result.ok ? null : result.reason };
  });
}

export function removeStep(steps, index) {
  const next = steps.filter((_, i) => i !== index);
  // Removing an action can leave a wait at the edge or two pauses together: drop those too.
  while (next.length && !isValidOrder(next)) {
    const bad = next.findIndex((step, i) => isPauseStep(step) && (i === 0 || i === next.length - 1 || isPauseStep(next[i - 1])));
    if (bad < 0) break;
    next.splice(bad, 1);
  }
  return next;
}

// Moves a step to position `to` (index in the final list). Null when the result
// would break the placement rules or nothing changes.
export function moveStep(steps, from, to) {
  if (from === to || to < 0 || to >= steps.length) return null;
  const next = [...steps];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return isValidOrder(next) ? next : null;
}

// Index of the first wait/approval: from the next step on, everything runs in the background.
export const backgroundFrom = (steps) => {
  const index = steps.findIndex(isPauseStep);
  return index < 0 ? -1 : index + 1;
};

const UNITS = { minutes: ["minuto", "minutos"], hours: ["hora", "horas"], days: ["día", "días"] };
export function durationText(step) {
  const [one, many] = UNITS[step.unit] ?? ["", ""];
  return `${step.amount} ${step.amount === 1 ? one : many}`;
}

// Title and one-line detail of a step node.
export function describeStep(step, ownerOf = () => "") {
  if (isDelayStep(step)) return { title: `Esperar ${durationText(step)}`, detail: "Después sigue en segundo plano" };
  if (isApprovalStep(step)) {
    const people = step.approvers?.length ?? 0;
    return { title: "Pedir aprobación", detail: people ? `${people} ${people === 1 ? "persona decide" : "personas pueden decidir"}${step.message ? ` · ${step.message}` : ""}` : "Falta elegir quién aprueba" };
  }
  if (isHttpStep(step)) {
    let host = "";
    try { host = new URL(step.url).hostname; } catch { /* empty url */ }
    return { title: `${step.method ?? "POST"} a una URL`, detail: host || "Falta la dirección" };
  }
  const contract = SERVICE_CONTRACTS[step.service];
  if (!contract) return { title: "Elige una acción", detail: "Qué debe hacer este paso" };
  const first = Object.values(step.args ?? {}).find((source) => source?.from === "template")?.template;
  return { title: contract.label, detail: [ownerOf(step.service), first].filter(Boolean).join(" · ") };
}

// Things still missing in a step (shown as a marker on the node).
export function stepIssues(step) {
  if (isDelayStep(step)) return Number.isInteger(step.amount) && step.amount >= 1 ? [] : ["Indica cuánto esperar"];
  if (isApprovalStep(step)) return [...(step.approvers?.length ? [] : ["Elige quién aprueba"]), ...(step.message?.trim() ? [] : ["Escribe el mensaje"])];
  if (isHttpStep(step)) return /^https:\/\/[^\s/]+/i.test(step.url ?? "") ? [] : ["Escribe una dirección https"];
  const contract = SERVICE_CONTRACTS[step.service];
  if (!contract) return ["Elige la acción"];
  const missing = Object.entries(contract.args)
    .filter(([name, spec]) => spec.required && !["sourceEntityId", "idempotencyKey"].includes(name) && !step.args?.[name])
    .map(([name]) => name);
  return missing.length ? [`Faltan datos obligatorios (${missing.length})`] : [];
}

const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const ON_TEXT = { create: "se crea", update: "se actualiza", save: "se guarda" };
const OP_TEXT = { equals: "es", not_equals: "no es", contains: "contiene", gt: "es mayor que", lt: "es menor que", changed: "cambió", filled: "tiene valor" };

// Title and detail of the trigger node.
export function describeTrigger(trigger, { entities = [], events = [] } = {}) {
  if (trigger.type === "webhook") {
    const count = trigger.fields?.length ?? 0;
    return { title: "Recibe datos de otro sistema", detail: count ? `${count} ${count === 1 ? "campo" : "campos"} esperados` : "Aún sin campos: envía un mensaje de prueba" };
  }
  if (trigger.type === "event") {
    return { title: events.find((event) => event.key === trigger.event)?.label ?? "Elige un evento", detail: "Evento de otro módulo" };
  }
  if (trigger.type === "schedule") {
    const at = trigger.at ?? "";
    const title = trigger.every === "hour" ? "Cada hora"
      : trigger.every === "day" ? `Cada día a las ${at}`
      : trigger.every === "week" ? `Cada ${WEEKDAYS[trigger.weekday ?? 1]} a las ${at}`
      : `El día ${trigger.day ?? 1} de cada mes a las ${at}`;
    const entity = entities.find((item) => (item.key ?? item.name) === trigger.entity);
    return { title, detail: entity ? `Una vez por cada ${(entity.label ?? entity.key).toLowerCase()}` : "Horario" };
  }
  const entity = entities.find((item) => (item.key ?? item.name) === trigger.entity);
  return { title: `Cuando ${entity ? `«${entity.label ?? entity.key}»` : "un registro"} ${ON_TEXT[trigger.on] ?? "cambia"}`, detail: "Registro de este módulo" };
}

// Text of one condition, e.g. `estado no es "cerrada"`.
export function describeCondition(condition, fieldLabel = (name) => name) {
  const value = condition.value === undefined ? "" : ` ${typeof condition.value === "string" ? `«${condition.value}»` : condition.value}`;
  return `${fieldLabel(condition.field)} ${OP_TEXT[condition.op] ?? condition.op}${value}`;
}

// Short type label shown on top of a canvas node.
export function stepKindLabel(step) {
  if (isDelayStep(step)) return "Espera";
  if (isApprovalStep(step)) return "Aprobación";
  if (isHttpStep(step)) return "Llamada HTTP";
  return "Acción";
}

export function triggerKindLabel(trigger) {
  return { record: "Disparador · registro", event: "Disparador · evento", schedule: "Disparador · horario", webhook: "Disparador · webhook" }[trigger.type] ?? "Disparador";
}

// Spanish wording for the diagnostics the API returns when an automation does not
// validate ({ path, code, message }). The path tells which block.
export function describeAutomationDiagnostic(diagnostic) {
  if (!diagnostic?.code) return diagnostic?.message ?? "No se pudo guardar.";
  const index = /steps\[(\d+)\]/.exec(diagnostic.path ?? "");
  const where = index ? `bloque ${Number(index[1]) + 1}` : /\.action/.test(diagnostic.path ?? "") ? "bloque 1" : "";
  const arg = /\.(?:args|body)\.([A-Za-z0-9_]+)/.exec(diagnostic.path ?? "")?.[1];
  const place = where ? ` del ${where}` : "";
  switch (diagnostic.code) {
    case "AUTOMATION_SERVICE_UNKNOWN": return `Elige la acción${place}.`;
    case "AUTOMATION_ARG_REQUIRED": return `Falta el dato obligatorio «${arg ?? ""}»${place}.`;
    case "AUTOMATION_ARG_UNKNOWN": return `La acción${place} no acepta el dato «${arg ?? ""}».`;
    case "AUTOMATION_ARG_INVALID": return `El dato «${arg ?? ""}»${place} no es válido: ${diagnostic.message}`;
    case "AUTOMATION_FIELD_NOT_FOUND": return `El ${where || "flujo"} usa un campo que no existe en este disparador.`;
    case "AUTOMATION_HTTP_INVALID": return `Revisa la llamada a una URL${place}: dirección https fija y método POST, PUT o PATCH.`;
    case "AUTOMATION_APPROVAL_INVALID": return `Revisa la aprobación${place}: elige de 1 a 5 personas y escribe el mensaje; va entre dos acciones.`;
    case "AUTOMATION_DELAY_INVALID": return `Revisa la espera${place}: de 1 minuto a 30 días y entre dos acciones.`;
    case "AUTOMATION_SERVICE_NEEDS_USER": return `La acción${place} necesita a una persona y no puede correr en segundo plano.`;
    case "AUTOMATION_SERVICE_READONLY": return `La acción${place} solo consulta datos; elige una que cree o cambie algo.`;
    case "AUTOMATION_CONDITION_INVALID": return "Revisa las condiciones del flujo.";
    case "AUTOMATION_TRIGGER_INVALID": return "Revisa el disparador (horario, campos o tipo).";
    case "AUTOMATION_EVENT_UNKNOWN": return "Elige el evento que dispara la automatización.";
    case "AUTOMATION_STEPS_INVALID": return "El flujo necesita de 1 a 5 bloques.";
    default: return diagnostic.message ?? "No se pudo guardar.";
  }
}
