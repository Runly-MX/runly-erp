import test from "node:test";
import assert from "node:assert/strict";
import { duplicateDraft, exportFile, parseFile } from "../automationFile.js";

const item = {
  id: "i1", key: "avisar", label: "Avisar pedidos", enabled: true, webhookToken: "secreto", updatedAt: "x", lastRun: { status: "success" },
  trigger: { type: "webhook", fields: [{ key: "total", label: "Total" }] },
  steps: [
    { service: "runly.notifications:notifications.send", args: { userIds: { from: "value", value: ["u1"] }, title: { from: "template", template: "Pedido {{total}}" } } },
    { type: "approval", approvers: ["u1"], message: "¿Aprobado?" },
    { service: "runly.contacts:contacts.create", args: { name: { from: "value", value: "X" } } },
  ],
};

test("the exported file carries the flow, paused, with no ids or secrets", () => {
  const file = exportFile(item);
  const text = JSON.stringify(file);
  assert.equal(file.format, "runly.automation");
  assert.equal(file.automation.enabled, false);
  assert.ok(!text.includes("secreto") && !text.includes('"id"') && !text.includes("lastRun") && !text.includes('"key":"avisar"'));
});

test("a duplicate is paused, renamed, gets a free key and keeps the people", () => {
  const copy = duplicateDraft(item, new Set(["copia_de_avisar_pedidos"]));
  assert.equal(copy.label, "Copia de Avisar pedidos");
  assert.equal(copy.key, "copia_de_avisar_pedidos_2");
  assert.equal(copy.enabled, false);
  assert.equal(copy.webhookToken, undefined);
  assert.deepEqual(copy.steps[1].approvers, ["u1"]);
});

test("importing a file rebuilds the draft and drops the people of the other company", () => {
  const parsed = parseFile(JSON.stringify(exportFile(item)), new Set(["avisar_pedidos"]));
  assert.equal(parsed.draft.key, "avisar_pedidos_2");
  assert.equal(parsed.draft.enabled, false);
  assert.equal(parsed.removedPeople, 2);
  assert.equal(parsed.draft.steps[0].args.userIds, undefined);
  assert.deepEqual(parsed.draft.steps[1].approvers, []);
  assert.equal(parsed.draft.steps[0].args.title.template, "Pedido {{total}}");
});

test("importing refuses things that are not an automation file", () => {
  assert.match(parseFile("no json", new Set()).error, /JSON válido/);
  assert.match(parseFile(JSON.stringify({ format: "otra" }), new Set()).error, /no es una automatización/);
  assert.match(parseFile(JSON.stringify({ format: "runly.automation", version: 9, automation: {} }), new Set()).error, /versión más nueva/);
  assert.match(parseFile(JSON.stringify({ format: "runly.automation", version: 1, automation: { label: "x" } }), new Set()).error, /falta/);
  assert.match(parseFile("x".repeat(300 * 1024), new Set()).error, /demasiado grande/);
});
