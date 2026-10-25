import test from "node:test";
import assert from "node:assert/strict";
import { arrowPath, barBox, breaksOrder, buildRange, dayNumber, dayOfX, dayText, deltaDays, dragSpan, headerTicks, monthBands, taskSpan, xOfDay } from "../ganttLayout.js";

const d = (text) => dayNumber(text);

test("days are counted in whole UTC days and round-trip", () => {
  assert.equal(d("2026-11-04") - d("2026-11-03"), 1);
  assert.equal(d("2026-11-03T12:00:00.000Z"), d("2026-11-03"));
  assert.equal(dayText(d("2026-11-03")), "2026-11-03");
  assert.equal(dayNumber(null), null);
  assert.equal(dayNumber("nada"), null);
});

test("a task span uses whichever date exists and orders a reversed range", () => {
  assert.deepEqual(taskSpan({ startDate: "2026-11-03", dueDate: "2026-11-05" }), { start: d("2026-11-03"), end: d("2026-11-05") });
  assert.deepEqual(taskSpan({ startDate: null, dueDate: "2026-11-05" }), { start: d("2026-11-05"), end: d("2026-11-05") });
  assert.deepEqual(taskSpan({ startDate: "2026-11-09", dueDate: "2026-11-05" }), { start: d("2026-11-05"), end: d("2026-11-09") });
  assert.equal(taskSpan({ startDate: null, dueDate: null }), null);
});

test("the range covers tasks and today with margins and a minimum length", () => {
  const today = d("2026-11-10");
  const range = buildRange([{ startDate: "2026-11-12", dueDate: "2026-11-14" }], today);
  assert.equal(range.origin, today - 7);
  assert.ok(range.days >= 42);
  const wide = buildRange([{ startDate: "2026-09-01", dueDate: "2026-12-31" }], today);
  assert.equal(wide.origin, d("2026-09-01") - 7);
  assert.equal(wide.origin + wide.days - 1, d("2026-12-31") + 14);
});

test("a bar covers both end days and sits in its row", () => {
  const origin = d("2026-11-01");
  const box = barBox({ start: d("2026-11-03"), end: d("2026-11-05") }, origin, 20, 2);
  assert.equal(box.x, 40);
  assert.equal(box.width, 60);
  assert.ok(box.y > 80 && box.y < 120);
  assert.equal(xOfDay(d("2026-11-03"), origin, 20), 40);
  assert.equal(dayOfX(59, origin, 20), d("2026-11-03"));
});

test("dragging moves or resizes by whole days and never inverts a bar", () => {
  const span = { start: 10, end: 12 };
  assert.deepEqual(dragSpan(span, "move", 3), { start: 13, end: 15 });
  assert.deepEqual(dragSpan(span, "end", 4), { start: 10, end: 16 });
  assert.deepEqual(dragSpan(span, "end", -9), { start: 10, end: 10 });
  assert.deepEqual(dragSpan(span, "start", -2), { start: 8, end: 12 });
  assert.deepEqual(dragSpan(span, "start", 9), { start: 12, end: 12 });
  assert.equal(deltaDays(31, 20), 2);
  assert.equal(deltaDays(-9, 20), 0);
});

test("arrows leave the blocker's right end and reach the blocked bar's left end", () => {
  const from = { x: 100, y: 8, width: 60, height: 24 };
  const ahead = arrowPath(from, { x: 220, y: 48, width: 40, height: 24 });
  assert.match(ahead.d, /^M 160 20 H 170 V 60 H 218$/);
  assert.deepEqual(ahead.end, { x: 220, y: 60 });
  const overlapping = arrowPath(from, { x: 130, y: 48, width: 40, height: 24 });
  assert.match(overlapping.d, /^M 160 20 H 170 V \d+(\.\d+)? H 120 V 60 H 128$/);
});

test("a blocked task that starts before its blocker ends is flagged", () => {
  assert.equal(breaksOrder({ start: 1, end: 5 }, { start: 5, end: 8 }), true);
  assert.equal(breaksOrder({ start: 1, end: 5 }, { start: 6, end: 8 }), false);
  assert.equal(breaksOrder(null, { start: 6, end: 8 }), false);
});

test("the header marks days, mondays and month starts, and bands each month", () => {
  const origin = d("2026-10-28");
  assert.equal(headerTicks(origin, 10, 44, "day").length, 10);
  assert.equal(headerTicks(origin, 10, 44, "day").find((tick) => tick.major).label, "1");
  assert.deepEqual(headerTicks(origin, 14, 20, "week").map((tick) => tick.label), ["2", "9"]);
  const bands = monthBands(origin, 10, 10);
  assert.deepEqual(bands.map((band) => [band.label, band.width]), [["Octubre de 2026", 40], ["Noviembre de 2026", 60]]);
});
