import { test } from "node:test";
import assert from "node:assert/strict";
import { applyEdit, insideChip, parseSerialized, replaceRange, serializeRanges } from "../mentionRanges.js";

const U = "01900000-0000-7000-8000-000000000001";
const E = "01900000-0000-7000-8000-000000000002";
const SER = `mira @[${U}:Ana] y #[inventory_item:${E}:Asus TUF 15] ok`;

test("serialized text shows plain names and round-trips", () => {
  const { text, ranges } = parseSerialized(SER);
  assert.equal(text, "mira @Ana y Asus TUF 15 ok");
  assert.deepEqual(ranges.map((r) => [r.kind, r.start, r.end]), [["user", 5, 9], ["entity", 12, 23]]);
  assert.equal(serializeRanges(text, ranges), SER);
});

test("typing before a chip shifts it, typing after leaves it", () => {
  const { text, ranges } = parseSerialized(SER);
  const a = applyEdit(text, `hola ${text}`, ranges);
  assert.deepEqual(a.ranges.map((r) => r.start), [10, 17]);
  const b = applyEdit(text, `${text}!`, ranges);
  assert.deepEqual(b.ranges.map((r) => r.start), [5, 12]);
  assert.equal(serializeRanges(a.text, a.ranges), `hola ${SER}`);
});

test("backspace on the last character removes the whole chip", () => {
  const { text, ranges } = parseSerialized(SER);
  const edited = text.slice(0, 8) + text.slice(9); // delete the "a" of @Ana
  const res = applyEdit(text, edited, ranges);
  assert.equal(res.text, "mira  y Asus TUF 15 ok");
  assert.deepEqual(res.ranges.map((r) => [r.kind, r.start, r.end]), [["entity", 8, 19]]);
  assert.equal(res.caret, 5);
});

test("typing inside a chip keeps the text but drops the chip", () => {
  const { text, ranges } = parseSerialized(SER);
  const edited = text.slice(0, 7) + "X" + text.slice(7);
  const res = applyEdit(text, edited, ranges);
  assert.equal(res.text, edited);
  assert.deepEqual(res.ranges.map((r) => r.kind), ["entity"]);
});

test("replaceRange turns picked text into a chip and detects chip positions", () => {
  const base = replaceRange("busca /inv:asus", [], 6, 15, "Asus TUF 15", { kind: "entity", entityType: "inventory_item", id: E });
  assert.equal(base.text, "busca Asus TUF 15");
  assert.equal(serializeRanges(base.text, base.ranges), `busca #[inventory_item:${E}:Asus TUF 15]`);
  assert.equal(insideChip(base.ranges, 8), true);
  assert.equal(insideChip(base.ranges, 3), false);
});
