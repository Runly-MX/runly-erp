import test from "node:test";
import assert from "node:assert/strict";
import { adjustmentNote, normalizeNumber, resolveAllowNegative, sanitizePastedNumber } from "../number-bounds.js";

test("resolveAllowNegative turns negatives off when min >= 0", () => {
  assert.equal(resolveAllowNegative(true, 0), false);
  assert.equal(resolveAllowNegative(undefined, "5"), false);
  assert.equal(resolveAllowNegative(true, -10), true);
  assert.equal(resolveAllowNegative(false, undefined), false);
  assert.equal(resolveAllowNegative(undefined, undefined), true);
});

test("normalizeNumber clamps to the nearest bound", () => {
  assert.deepEqual(normalizeNumber("-123", { min: 0, max: 100 }), { value: 0, reason: "min" });
  assert.deepEqual(normalizeNumber("250", { min: 0, max: 100 }), { value: 100, reason: "max" });
  assert.equal(normalizeNumber("50", { min: 0, max: 100 }), null);
  assert.equal(normalizeNumber("", { min: 1 }), null);
  assert.equal(normalizeNumber("abc", { min: 1 }), null);
});

test("normalizeNumber rounds when decimals are not allowed", () => {
  assert.deepEqual(normalizeNumber("4.6", { allowDecimal: false }), { value: 5, reason: "integer" });
  assert.deepEqual(normalizeNumber("10.7", { max: 10, allowDecimal: false }), { value: 10, reason: "max" });
  assert.equal(normalizeNumber("2.5", { max: 3 }), null);
  assert.deepEqual(normalizeNumber("3.5", { max: 3 }), { value: 3, reason: "max" });
});

test("adjustmentNote and sanitizePastedNumber", () => {
  assert.equal(adjustmentNote({ value: 100, reason: "max" }), "Se ajustó al máximo permitido (100).");
  assert.equal(adjustmentNote({ value: 0, reason: "min" }), "Se ajustó al mínimo permitido (0).");
  assert.equal(sanitizePastedNumber("-12", { allowNegative: false }), "12");
  assert.equal(sanitizePastedNumber("-12", { allowNegative: true }), null);
  assert.equal(sanitizePastedNumber("12", { allowNegative: false }), null);
  assert.equal(sanitizePastedNumber("-x", { allowNegative: false }), "");
});
