import test from "node:test";
import assert from "node:assert/strict";
import { validateSystemAutomation } from "@runly/module-compiler/browser";
import { EXAMPLES, STARTERS, keyFromName } from "../automationStarters.js";

test("keys are snake_case, start with a letter and stay unique", () => {
  assert.equal(keyFromName("Aviso de Órdenes de Compra"), "aviso_de_ordenes_de_compra");
  assert.equal(keyFromName("123 ventas"), "a_123_ventas");
  assert.equal(keyFromName("!!"), "automatizacion");
  assert.equal(keyFromName("Aviso", new Set(["aviso", "aviso_2"])), "aviso_3");
  assert.ok(keyFromName("x".repeat(100)).length <= 41);
});

test("every ready example is a valid company automation once it has a name", () => {
  for (const example of EXAMPLES) {
    const automation = { key: keyFromName(example.label), label: example.label, enabled: true, ...example.draft() };
    const errors = validateSystemAutomation(automation).filter((error) => !/required by the service|userIds/.test(error.message));
    assert.deepEqual(errors.map((e) => `${e.path}: ${e.message}`), [], example.id);
  }
});

test("starters begin with a valid trigger of each kind", () => {
  assert.deepEqual(STARTERS.map((starter) => starter.draft().trigger.type), ["event", "schedule", "webhook"]);
});
