// Pure helpers behind the visual automation editor ("Flujo"): inserting,
// moving and removing steps while keeping the rules the compiler enforces
// (docs/developers/automatizaciones.md), and the texts shown on each node.
// No React in here so it can be unit tested.
import { MAX_BRANCHES, MAX_DELAYS, MAX_STEPS, SERVICE_CONTRACTS, branchLanes, conditionsOf, isApprovalStep, isBranchStep, isDelayStep, isHttpStep, isPauseStep, laneOwner, stepOutputKeys } from "@runly/module-compiler/browser";

export const STEP_KINDS = Object.freeze({
  action: { label: "Hacer algo en un módulo", hint: "Crear un contacto, enviar una notificación, agendar un evento..." },
  delay: { label: "Esperar", hint: "Continuar después de unos minutos, horas o días" },
  approval: { label: "Pedir aprobación", hint: "Detenerse hasta que una persona apruebe o rechace" },
  http: { label: "Llamar a una URL", hint: "Enviar los datos a otro sistema (webhook)" },
  branch: { label: "Condición Sí / No", hint: "Divide el flujo: un camino si se cumple y otro si no" },
});

export const newStep = (kind) => {
  if (kind === "delay") return { type: "delay", amount: 1, unit: "days" };
  if (kind === "approval") return { type: "approval", approvers: [], message: "" };
  if (kind === "http") return { type: "http", method: "POST", url: "", body: {} };
  if (kind === "branch") return { type: "branch", when: [], yes: 1, no: 1 };
  return { service: "", args: {} };
};

const approvalsIn = (steps) => steps.filter(isApprovalStep).length;
const delaysIn = (steps) => steps.filter(isDelayStep).length;

// A wait or approval sits between two actions and never next to another pause.
export function isValidOrder(steps) {
  return steps.every((step, index) => !isPauseStep(step) || (index > 0 && index < steps.length - 1 && !isPauseStep(steps[index - 1])));
}

const limitReason = `Máximo ${MAX_STEPS} bloques por automatización.`;
const refuse = (reason) => ({ ok: false, reason });

// Can a step of `kind` be inserted before position `index`? `lane` ({ branch, which })
// puts it in the middle or end of one path of a condition. Returns the new list or a
// short reason in Spanish. Pauses get an empty action after them when they would
// otherwise end the flow; a condition brings its two paths (and a block to join).
export function insertStep(steps, index, kind, lane = null) {
  if (steps.length >= MAX_STEPS) return refuse(limitReason);
  if (lane) {
    const [start, end] = branchLanes(steps[lane.branch], lane.branch)[lane.which];
    if (index < start || index > end) return refuse("Ese lugar no está en el camino de la condición.");
  } else if (steps.some((step, at) => isBranchStep(step) && index > at && index <= at + step.yes + step.no)) {
    return refuse("Ese lugar está dentro del camino de una condición.");
  }
  const withLane = (list) => {
    if (!lane) return list;
    const next = [...list];
    next[lane.branch] = { ...next[lane.branch], [lane.which]: next[lane.branch][lane.which] + 1 };
    return next;
  };
  if (kind === "branch") {
    if (lane) return refuse("Una condición no puede ir dentro del camino de otra.");
    if (steps.filter(isBranchStep).length >= MAX_BRANCHES) return refuse(`Máximo ${MAX_BRANCHES} condiciones por automatización.`);
    const added = [newStep("branch"), newStep("action"), newStep("action"), ...(index >= steps.length ? [newStep("action")] : [])];
    if (steps.length + added.length > MAX_STEPS) return refuse(`Una condición necesita ${added.length} bloques y ya no caben.`);
    return { ok: true, steps: [...steps.slice(0, index), ...added, ...steps.slice(index)] };
  }
  const pause = kind === "delay" || kind === "approval";
  if (!pause) return { ok: true, steps: withLane([...steps.slice(0, index), newStep(kind), ...steps.slice(index)]) };
  if (kind === "delay" && delaysIn(steps) >= MAX_DELAYS) return refuse(`Máximo ${MAX_DELAYS} esperas por automatización.`);
  if (kind === "approval" && approvalsIn(steps) >= 1) return refuse("Solo una aprobación por automatización.");
  if (index === 0) return refuse("Antes de esperar o pedir una aprobación necesitas un paso.");
  if (isPauseStep(steps[index - 1]) || isPauseStep(steps[index])) return refuse("No puede ir junto a otra espera o aprobación.");
  const atEnd = index >= steps.length;
  const next = [...steps.slice(0, index), newStep(kind), ...(atEnd ? [newStep("action")] : []), ...steps.slice(index)];
  if (next.length > MAX_STEPS) return refuse(limitReason);
  return { ok: true, steps: withLane(next) };
}

// Which kinds are available at a slot, with the reason when they are not.
export function slotOptions(steps, index, lane = null) {
  return Object.keys(STEP_KINDS).map((kind) => {
    const result = insertStep(steps, index, kind, lane);
    return { kind, ...STEP_KINDS[kind], disabled: !result.ok, reason: result.ok ? null : result.reason };
  });
}

// -1 for the main line, otherwise an id of the path (condition + Sí/No) the block is on.
function laneKey(steps, index) {
  const owner = laneOwner(steps, index);
  return owner < 0 ? -1 : owner * 2 + (index < branchLanes(steps[owner], owner).yes[1] ? 0 : 1);
}

// Removes one block keeping the paths of the conditions consistent: a block of a path
// leaves it shorter, a condition leaves its blocks in the main line.
function removeAt(list, index) {
  const next = list.filter((_, i) => i !== index);
  if (isBranchStep(list[index])) return next;
  const owner = laneOwner(list, index);
  if (owner >= 0) {
    const which = index < branchLanes(list[owner], owner).yes[1] ? "yes" : "no";
    next[owner] = { ...next[owner], [which]: next[owner][which] - 1 };
  }
  return next;
}

// A condition with no blocks in its paths, or whose paths reach the end of the flow
// (nothing left to join), cannot stay: it is dropped and its blocks remain.
function settleBranches(list) {
  let next = list;
  for (let at = 0; at < next.length; at += 1) {
    if (!isBranchStep(next[at])) continue;
    if (next[at].yes + next[at].no < 1 || at + next[at].yes + next[at].no >= next.length - 1) {
      next = removeAt(next, at);
      at -= 1;
    }
  }
  return next;
}

export function removeStep(steps, index) {
  let next = settleBranches(removeAt(steps, index));
  // Removing an action can leave a wait at the edge or two pauses together: drop those too.
  for (;;) {
    const bad = next.findIndex((step, i) => isPauseStep(step) && (i === 0 || i === next.length - 1 || isPauseStep(next[i - 1])));
    if (bad < 0) break;
    next = settleBranches(removeAt(next, bad));
  }
  return next;
}

// Moves a step to position `to` (index in the final list). Null when the result
// would break the placement rules or nothing changes. A block only moves within its
// own path (or the main line between conditions), never across a condition.
export function moveStep(steps, from, to) {
  if (from === to || to < 0 || to >= steps.length) return null;
  const path = laneKey(steps, from);
  for (let i = Math.min(from, to); i <= Math.max(from, to); i += 1) {
    if (isBranchStep(steps[i]) || laneKey(steps, i) !== path) return null;
  }
  const next = [...steps];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return isValidOrder(next) ? next : null;
}

// Where each block sits on the canvas and how they connect. The main line is row 0;
// a condition sends its "Sí" path to row -1 and its "No" path to row 1, and both join
// again at the next main-line block. Each link carries `slot`: the position and path
// a block inserted on that arrow would take. `from` -1 is the side of the trigger.
export function flowPlan(steps) {
  const cells = [];
  const links = [];
  let tails = [{ from: -1, slot: { index: 0, lane: null } }];
  let col = 0;
  const join = (to) => { for (const tail of tails) links.push({ ...tail, to }); tails = []; };
  for (let i = 0; i < steps.length; i += 1) {
    cells[i] = { col, row: 0 };
    join(i);
    col += 1;
    const step = steps[i];
    if (!isBranchStep(step)) { tails = [{ from: i, slot: { index: i + 1, lane: null } }]; continue; }
    const room = steps.length - 1 - i;
    const yes = Math.max(0, Math.min(step.yes, room));
    const no = Math.max(0, Math.min(step.no, room - yes));
    const paths = [["yes", yes, i + 1, -1, "Sí"], ["no", no, i + 1 + yes, 1, "No"]];
    for (const [which, count, start, row, label] of paths) {
      const lane = { branch: i, which };
      if (!count) { tails.push({ from: i, label, slot: { index: start, lane } }); continue; }
      for (let k = 0; k < count; k += 1) {
        cells[start + k] = { col: col + k, row };
        links.push({ from: k === 0 ? i : start + k - 1, to: start + k, label: k === 0 ? label : undefined, slot: { index: start + k, lane } });
      }
      tails.push({ from: start + count - 1, slot: { index: start + count, lane } });
    }
    col += Math.max(yes, no);
    i += yes + no;
  }
  return { cells, links, tails };
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
export function describeStep(step, ownerOf = () => "", fieldLabel = (name) => name) {
  if (isBranchStep(step)) {
    const conditions = conditionsOf(step.when);
    return {
      title: conditions.length ? `Si ${conditions.map((condition) => describeCondition(condition, fieldLabel)).join(" y ")}` : "Condición sin definir",
      detail: `Sí: ${step.yes} ${step.yes === 1 ? "bloque" : "bloques"} · No: ${step.no} ${step.no === 1 ? "bloque" : "bloques"}`,
    };
  }
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
  if (isBranchStep(step)) {
    const conditions = conditionsOf(step.when);
    if (!conditions.length) return ["Elige qué comprobar"];
    return conditions.every((condition) => condition.field) ? [] : ["Completa la condición"];
  }
  if (isDelayStep(step)) return Number.isInteger(step.amount) && step.amount >= 1 ? [] : ["Indica cuánto esperar"];
  if (isApprovalStep(step)) return [...(step.approvers?.length ? [] : ["Elige quién aprueba"]), ...(step.message?.trim() ? [] : ["Escribe el mensaje"])];
  if (isHttpStep(step)) return /^https:\/\/[^\s/]+/i.test(step.url ?? "") ? [] : ["Escribe una dirección https"];
  const contract = SERVICE_CONTRACTS[step.service];
  if (!contract) return ["Elige la acción"];
  const missing = Object.entries(contract.args)
    .filter(([name, spec]) => spec.required && !["sourceEntityId", "idempotencyKey"].includes(name) && !step.args?.[name])
    .map(([name]) => name);
  if (missing.length) return [`Faltan datos obligatorios (${missing.length})`];
  // An email needs someone to send it to: a company person or an outside address.
  if (step.service === "runly.notifications:email.send" && !step.args?.userIds && !step.args?.to) return ["Elige quién recibe el correo"];
  return [];
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
  if (isBranchStep(step)) return "Condición";
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
    case "AUTOMATION_STEPS_INVALID": return `El flujo necesita de 1 a ${MAX_STEPS} bloques.`;
    case "AUTOMATION_BRANCH_INVALID": return `Revisa la condición${place}: cada camino necesita bloques, no puede quedar al final ni dentro de otra condición (máximo ${MAX_BRANCHES}).`;
    default: return diagnostic.message ?? "No se pudo guardar.";
  }
}

// ---- data available to a block ------------------------------------------------

export const keyOf = (item) => item.key ?? item.name;

// Fields a block can read from the trigger: the entity's fields, the event payload
// or the fields a webhook announces.
export function fieldOptionsFor(trigger, entities = [], events = []) {
  if (trigger.type === "webhook") return (trigger.fields ?? []).map((field) => ({ value: field.key, label: field.label || field.key }));
  if (trigger.type === "event") return (events.find((event) => event.key === trigger.event)?.payload ?? []).map((key) => ({ value: key, label: key }));
  const entity = entities.find((item) => keyOf(item) === trigger.entity);
  return (entity?.fields ?? []).map((field) => ({ value: keyOf(field), label: field.label ?? keyOf(field) }));
}

const OUTPUT_LABELS = {
  id: "Identificador", name: "Nombre", type: "Tipo", email: "Correo", phone: "Teléfono", title: "Título", status: "Estado", summary: "Resumen",
  link: "Enlace", plate: "Placa", mimeType: "Tipo de archivo", sizeBytes: "Tamaño", description: "Descripción", startAt: "Inicio", endAt: "Fin",
  dueDate: "Vence", projectId: "Proyecto", taskNumber: "Número de tarea", assetTag: "Número de activo", enabled: "Activo",
};
const outputKey = (value) => value.replace(/^paso\d+_/, "");

// Everything the block at `index` can use: the trigger's data, then the results of
// the service blocks before it (paso<N>_<key>). Each option is { value, label, group }.
export function availableFields({ trigger, entities = [], events = [], steps = [], index = steps.length, ownerOf = () => "" }) {
  return withStepOutputs(fieldOptionsFor(trigger, entities, events), steps, index, ownerOf);
}

// Trigger options plus the results of the service blocks before `index`.
export function withStepOutputs(triggerOptions, steps, index, ownerOf = () => "") {
  const options = triggerOptions.map((option) => (option.group ? option : { ...option, group: "Del disparador" }));
  steps.slice(0, index).forEach((step, stepIndex) => {
    const contract = SERVICE_CONTRACTS[step?.service];
    if (!contract) return;
    const owner = ownerOf(step.service);
    const group = `Del paso ${stepIndex + 1} · ${contract.label}${owner ? ` (${owner})` : ""}`;
    for (const value of stepOutputKeys(stepIndex, contract)) options.push({ value, label: OUTPUT_LABELS[outputKey(value)] ?? outputKey(value), group });
  });
  return options;
}

// What the block at `index` offers to the blocks after it.
export function outputsOf(step, index) {
  const contract = SERVICE_CONTRACTS[step?.service];
  return contract ? stepOutputKeys(index, contract).map((value) => ({ value, label: OUTPUT_LABELS[outputKey(value)] ?? value })) : [];
}

// ---- canvas layout stored with the automation (cosmetic) ---------------------

const cleanUi = (ui) => {
  const next = { ...ui, steps: (ui.steps ?? []).some(Boolean) ? ui.steps : undefined };
  for (const name of Object.keys(next)) if (next[name] === undefined || next[name] === null) delete next[name];
  return Object.keys(next).length ? next : undefined;
};

// Positions as the canvas wants them: node id -> { x, y }.
export function positionsFromUi(ui) {
  const positions = {};
  if (ui?.trigger) positions.trigger = ui.trigger;
  if (ui?.conditions) positions.conditions = ui.conditions;
  (ui?.steps ?? []).forEach((point, index) => { if (point) positions[`step-${index}`] = point; });
  return positions;
}

export function uiWithPosition(ui, nodeId, point, stepCount) {
  const rounded = { x: Math.round(point.x), y: Math.round(point.y) };
  const next = { ...(ui ?? {}), layout: "free" };
  if (nodeId === "trigger" || nodeId === "conditions") next[nodeId] = rounded;
  else {
    const steps = Array.from({ length: stepCount }, (_, index) => (ui?.steps ?? [])[index] ?? null);
    steps[Number(nodeId.replace("step-", ""))] = rounded;
    next.steps = steps;
  }
  return cleanUi(next);
}

// Presets forget manual positions.
export const uiWithLayout = (layout) => ({ layout });
export const uiArranged = (ui) => ({ layout: ui?.layout === "vertical" ? "vertical" : "horizontal" });

// The positions list follows the steps when one is added, removed or moved.
export function uiAfterInsert(ui, index, count = 1) {
  if (!ui?.steps) return ui;
  const steps = [...ui.steps];
  steps.splice(index, 0, ...Array(count).fill(null));
  return cleanUi({ ...ui, steps });
}
export function uiAfterRemove(ui, index) {
  if (!ui?.steps) return ui;
  return cleanUi({ ...ui, steps: ui.steps.filter((_, i) => i !== index) });
}
export function uiAfterMove(ui, from, to) {
  if (!ui?.steps) return ui;
  const steps = [...ui.steps];
  while (steps.length <= Math.max(from, to)) steps.push(null);
  const [item] = steps.splice(from, 1);
  steps.splice(to, 0, item);
  return cleanUi({ ...ui, steps });
}

// The positions list never outlives the steps (a removal can drop more than one block).
export function uiFit(ui, count) {
  if (!ui?.steps || ui.steps.length <= count) return ui;
  return cleanUi({ ...ui, steps: ui.steps.slice(0, count) });
}
