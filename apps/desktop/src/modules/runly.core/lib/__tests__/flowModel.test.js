import test from "node:test";
import assert from "node:assert/strict";
import { backgroundFrom, describeStep, flowPlan, insertStep, isValidOrder, moveStep, removeStep, slotOptions, stepIssues } from "../flowModel.js";

const action = (service = "runly.contacts:contacts.create") => ({ service, args: {} });
const delay = { type: "delay", amount: 2, unit: "hours" };
const approval = { type: "approval", approvers: ["a"], message: "ok" };

test("pauses go between two actions and never at the edges or together", () => {
  assert.equal(isValidOrder([action(), delay, action()]), true);
  assert.equal(isValidOrder([delay, action()]), false);
  assert.equal(isValidOrder([action(), delay]), false);
  assert.equal(isValidOrder([action(), delay, approval, action()]), false);
});

test("inserting a wait at the end adds the action that must follow it", () => {
  const result = insertStep([action()], 1, "delay");
  assert.equal(result.ok, true);
  assert.deepEqual(result.steps.map((s) => s.type ?? "action"), ["action", "delay", "action"]);
  assert.equal(isValidOrder(result.steps), true);
  const middle = insertStep([action(), action()], 1, "approval");
  assert.deepEqual(middle.steps.map((s) => s.type ?? "action"), ["action", "approval", "action"]);
});

test("insert refuses with a reason when a rule would break", () => {
  assert.match(insertStep([action()], 0, "delay").reason, /necesitas un paso/);
  assert.match(insertStep([action(), delay, action()], 1, "approval").reason, /junto a otra/);
  assert.match(insertStep([action(), approval, action()], 3, "approval").reason, /Solo una aprobación/);
  const full = Array.from({ length: 12 }, () => action());
  assert.match(insertStep(full, 12, "http").reason, /Máximo 12 bloques/);
  assert.match(insertStep([action(), delay, action(), delay, action()], 1, "delay").reason, /Máximo 2 esperas/);
  const eleven = Array.from({ length: 11 }, () => action());
  assert.match(insertStep(eleven, 11, "delay").reason, /Máximo 12 bloques/); // delay + trailing action would make 13
  assert.equal(insertStep(eleven, 2, "delay").ok, true);
});

test("slotOptions explains every disabled kind", () => {
  const options = slotOptions([action()], 0);
  assert.equal(options.find((o) => o.kind === "action").disabled, false);
  assert.equal(options.find((o) => o.kind === "delay").disabled, true);
  assert.ok(options.find((o) => o.kind === "delay").reason);
});

test("remove cleans up pauses left dangling", () => {
  assert.deepEqual(removeStep([action(), delay, action()], 0).map((s) => s.type ?? "action"), ["action"]);
  assert.deepEqual(removeStep([action(), delay, action()], 2).map((s) => s.type ?? "action"), ["action"]);
  assert.deepEqual(removeStep([action(), delay, action(), action()], 2).map((s) => s.type ?? "action"), ["action", "delay", "action"]);
});

test("move only allows orders that stay valid", () => {
  const steps = [action("a"), delay, action("b"), action("c")];
  assert.equal(moveStep(steps, 1, 0), null); // wait cannot become first
  assert.equal(moveStep(steps, 0, 1), null); // the action swaps with the wait: wait first
  assert.deepEqual(moveStep(steps, 3, 2).map((s) => s.service ?? "delay"), ["a", "delay", "c", "b"]);
  assert.equal(moveStep(steps, 2, 2), null);
  assert.equal(moveStep(steps, 0, 9), null);
});

test("background starts after the first pause", () => {
  assert.equal(backgroundFrom([action(), action()]), -1);
  assert.equal(backgroundFrom([action(), delay, action()]), 2);
});

test("node texts and issues", () => {
  const label = () => "Contactos";
  assert.equal(describeStep(delay, label).title, "Esperar 2 horas");
  assert.equal(describeStep({ type: "delay", amount: 1, unit: "days" }, label).title, "Esperar 1 día");
  assert.equal(describeStep(action("nope"), label).title, "Elige una acción");
  assert.equal(describeStep({ type: "http", method: "POST", url: "https://hooks.example.com/x", body: {} }, label).detail, "hooks.example.com");
  assert.deepEqual(stepIssues({ type: "approval", approvers: [], message: "" }), ["Elige quién aprueba", "Escribe el mensaje"]);
  assert.deepEqual(stepIssues({ type: "http", method: "POST", url: "http://x", body: {} }), ["Escribe una dirección https"]);
  const mail = { service: "runly.notifications:email.send", args: { subject: { from: "value", value: "Hola" }, body: { from: "value", value: "Texto" } } };
  assert.deepEqual(stepIssues(mail), ["Elige quién recibe el correo"]);
  assert.deepEqual(stepIssues({ ...mail, args: { ...mail.args, to: { from: "value", value: "a@b.com" } } }), []);
  assert.equal(stepIssues(action()).length, 1); // contacts.create has required args
});

test("trigger and condition texts", async () => {
  const { describeTrigger, describeCondition } = await import("../flowModel.js");
  const events = [{ key: "fleet.vehicle.created", label: "Se creó un vehículo de la flota" }];
  const entities = [{ key: "orden", label: "Orden" }];
  assert.equal(describeTrigger({ type: "event", event: "fleet.vehicle.created" }, { events }).title, "Se creó un vehículo de la flota");
  assert.equal(describeTrigger({ type: "record", entity: "orden", on: "create" }, { entities }).title, "Cuando «Orden» se crea");
  assert.equal(describeTrigger({ type: "schedule", every: "week", weekday: 1, at: "08:00", entity: "orden" }, { entities }).title, "Cada lunes a las 08:00");
  assert.equal(describeTrigger({ type: "schedule", every: "week", weekday: 1, at: "08:00", entity: "orden" }, { entities }).detail, "Una vez por cada orden");
  assert.equal(describeTrigger({ type: "schedule", every: "hour" }).title, "Cada hora");
  assert.equal(describeCondition({ field: "estado", op: "not_equals", value: "cerrada" }), "estado no es «cerrada»");
  assert.equal(describeCondition({ field: "total", op: "gt", value: 100 }), "total es mayor que 100");
});

test("automation diagnostics are worded in Spanish and point at the block", async () => {
  const { describeAutomationDiagnostic } = await import("../flowModel.js");
  assert.equal(describeAutomationDiagnostic({ code: "AUTOMATION_SERVICE_UNKNOWN", path: "automations[0].steps[2].service", message: 'Unknown service ""' }), "Elige la acción del bloque 3.");
  assert.equal(describeAutomationDiagnostic({ code: "AUTOMATION_ARG_REQUIRED", path: "automations[0].steps[0].args.userIds", message: "x" }), "Falta el dato obligatorio «userIds» del bloque 1.");
  assert.match(describeAutomationDiagnostic({ code: "AUTOMATION_APPROVAL_INVALID", path: "automations[0].steps[1]" }), /aprobación del bloque 2/);
  assert.equal(describeAutomationDiagnostic({ code: "SOMETHING_NEW", message: "Texto" }), "Texto");
  assert.equal(describeAutomationDiagnostic({ message: "Sin código" }), "Sin código");
});

test("a block can use the trigger data and the results of the blocks before it", async () => {
  const { availableFields, outputsOf, fieldOptionsFor } = await import("../flowModel.js");
  const contacts = { service: "runly.contacts:contacts.create", args: {} };
  const send = { service: "runly.notifications:notifications.send", args: {} };
  const trigger = { type: "webhook", fields: [{ key: "total", label: "Total" }] };
  assert.deepEqual(fieldOptionsFor(trigger), [{ value: "total", label: "Total" }]);
  assert.deepEqual(availableFields({ trigger, steps: [contacts, send], index: 0 }).map((option) => option.value), ["total"]);
  const second = availableFields({ trigger, steps: [contacts, send], index: 1, ownerOf: () => "Contactos" });
  assert.ok(second.some((option) => option.value === "paso1_id" && option.label === "Identificador" && /Del paso 1 · Crear contactos \(Contactos\)/.test(option.group)));
  assert.deepEqual(outputsOf(contacts, 0).slice(0, 2).map((option) => option.value), ["paso1_id", "paso1_name"]);
  assert.deepEqual(outputsOf({ type: "delay" }, 1), []);
});

test("the layout positions follow the steps and presets forget them", async () => {
  const { positionsFromUi, uiWithPosition, uiWithLayout, uiArranged, uiAfterInsert, uiAfterRemove, uiAfterMove } = await import("../flowModel.js");
  let ui = uiWithPosition(undefined, "step-1", { x: 10.4, y: 20.6 }, 3);
  assert.deepEqual(ui, { layout: "free", steps: [null, { x: 10, y: 21 }, null] });
  ui = uiWithPosition(ui, "trigger", { x: 5, y: 6 }, 3);
  assert.deepEqual(positionsFromUi(ui), { trigger: { x: 5, y: 6 }, "step-1": { x: 10, y: 21 } });
  assert.deepEqual(uiAfterInsert(ui, 0).steps, [null, null, { x: 10, y: 21 }, null]);
  assert.equal(uiAfterRemove(ui, 1).steps, undefined);
  assert.deepEqual(uiAfterMove(ui, 1, 0).steps, [{ x: 10, y: 21 }, null, null]);
  assert.deepEqual(uiWithLayout("vertical"), { layout: "vertical" });
  assert.deepEqual(uiArranged(ui), { layout: "horizontal" });
  assert.deepEqual(uiArranged({ layout: "vertical" }), { layout: "vertical" });
  assert.equal(uiAfterInsert(undefined, 0), undefined);
});

const branch = (yes = 1, no = 1) => ({ type: "branch", when: [{ field: "total", op: "gt", value: 10 }], yes, no });

test("a condition brings its two paths and a block to join", () => {
  const middle = insertStep([action(), action()], 1, "branch");
  assert.deepEqual(middle.steps.map((s) => s.type ?? "action"), ["action", "branch", "action", "action", "action"]);
  const end = insertStep([action()], 1, "branch");
  assert.equal(end.steps.length, 5);
  assert.match(insertStep([action(), branch(), action(), action(), action()], 2, "branch", { branch: 1, which: "yes" }).reason, /dentro del camino de otra/);
  assert.match(insertStep([action(), branch(), action(), action(), action()], 3, "action").reason, /dentro del camino/);
});

test("blocks inserted on a path lengthen that path only", () => {
  const steps = [branch(), action(), action(), action()];
  const yes = insertStep(steps, 2, "action", { branch: 0, which: "yes" });
  assert.deepEqual([yes.steps[0].yes, yes.steps[0].no], [2, 1]);
  const no = insertStep(steps, 3, "action", { branch: 0, which: "no" });
  assert.deepEqual([no.steps[0].yes, no.steps[0].no], [1, 2]);
  assert.match(insertStep(steps, 3, "action", { branch: 0, which: "yes" }).reason, /no está en el camino/);
});

test("removing blocks keeps the paths consistent and drops a condition left without paths", () => {
  const steps = [branch(), action(), action(), action()];
  assert.deepEqual(removeStep(steps, 1).slice(0, 1).map((s) => [s.yes, s.no]), [[0, 1]]);
  assert.deepEqual(removeStep(steps, 0).map((s) => s.type ?? "action"), ["action", "action", "action"]);
  // The join block is the last one: without it the condition has nothing to join.
  assert.deepEqual(removeStep(steps, 3).map((s) => s.type ?? "action"), ["action", "action"]);
  assert.deepEqual(removeStep([branch(1, 0), action(), action()], 1).map((s) => s.type ?? "action"), ["action"]);
});

test("blocks only move inside their own path", () => {
  const steps = [action(), branch(2, 1), action(), action(), action(), action()];
  assert.ok(moveStep(steps, 2, 3));
  assert.equal(moveStep(steps, 3, 4), null);
  assert.equal(moveStep(steps, 0, 2), null);
  assert.equal(moveStep(steps, 1, 2), null);
});

test("the plan puts the Sí path above the main line and the No path below", () => {
  const { cells, links, tails } = flowPlan([action(), branch(2, 1), action(), action(), action(), action()]);
  assert.deepEqual(cells.map((cell) => [cell.col, cell.row]), [[0, 0], [1, 0], [2, -1], [3, -1], [2, 1], [4, 0]]);
  const labelled = links.filter((link) => link.label).map((link) => [link.from, link.to, link.label]);
  assert.deepEqual(labelled, [[1, 2, "Sí"], [1, 4, "No"]]);
  assert.equal(links.filter((link) => link.to === 5).length, 2);
  assert.deepEqual(tails, [{ from: 5, slot: { index: 6, lane: null } }]);
  const lonely = flowPlan([branch(1, 0), action(), action()]);
  assert.ok(lonely.links.some((link) => link.from === 0 && link.to === 2 && link.label === "No"));
});

test("a condition shows what it checks and its paths", () => {
  assert.deepEqual(describeStep(branch(2, 1), () => "", () => "Total"), { title: "Si Total es mayor que 10", detail: "Sí: 2 bloques · No: 1 bloque" });
  assert.deepEqual(stepIssues({ type: "branch", when: [], yes: 1, no: 1 }), ["Elige qué comprobar"]);
  assert.deepEqual(stepIssues(branch()), []);
});
