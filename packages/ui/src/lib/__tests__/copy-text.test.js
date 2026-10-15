import test from "node:test";
import assert from "node:assert/strict";
import { copiedMessage, copyableText } from "../copy-text.js";

test("copyableText ignores blanks and placeholders", () => {
  assert.equal(copyableText("—"), "");
  assert.equal(copyableText("  "), "");
  assert.equal(copyableText(null), "");
  assert.equal(copyableText("  AB   123 "), "AB 123");
});

test("copiedMessage truncates long values", () => {
  assert.equal(copiedMessage("SN1"), "Copiado: SN1");
  assert.ok(copiedMessage("x".repeat(100)).length < 70);
});
