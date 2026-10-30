import test from "node:test";
import assert from "node:assert/strict";
import { pdfSafeText } from "../pdfText.js";

test("pdfSafeText keeps Spanish text and cp1252 punctuation as-is", () => {
  const text = "¿Qué opinas? Ñandú — “acuerdo” … 50 € • listo · ok";
  assert.equal(pdfSafeText(text), text);
});

test("pdfSafeText replaces characters jsPDF's Helvetica cannot encode", () => {
  assert.equal(pdfSafeText("10:30 a. m."), "10:30 a. m.");
  assert.equal(pdfSafeText("éxito"), "éxito");
  assert.equal(pdfSafeText("A → B ≥ 3 ‑ fin"), "A -> B >= 3 - fin");
  assert.equal(pdfSafeText("Listo \u{1F680} ya"), "Listo ya");
  assert.equal(pdfSafeText("Ł ą"), "L a");
});
