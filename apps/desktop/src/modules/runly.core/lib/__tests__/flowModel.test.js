import test from "node:test";
import assert from "node:assert/strict";
import { backgroundFrom, describeStep, insertStep, isValidOrder, moveStep, removeStep, slotOptions, stepIssues } from "../flowModel.js";

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
  assert.match(insertStep([action(), delay, action(), delay, action()], 5, "http").reason, /Máximo 5 pasos/);
  assert.match(insertStep([action(), delay, action(), delay, action()], 1, "delay").reason, /Máximo 5 pasos/);
  const four = [action(), action(), action(), action()];
  assert.match(insertStep(four, 4, "delay").reason, /Máximo 5 pasos/); // delay + trailing action would make 6
  assert.equal(insertStep(four, 2, "delay").ok, true);
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
