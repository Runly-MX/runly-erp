import test from "node:test";
import assert from "node:assert/strict";
import { addDays, daysBetween, monthCells, shiftedEvent, weekStartOf, weekSummary } from "../week-grid.js";

test("weeks start on Sunday and cross months", () => {
  assert.equal(weekStartOf("2026-10-29"), "2026-10-25");
  assert.equal(weekStartOf("2026-11-01"), "2026-11-01");
  assert.equal(addDays("2026-10-30", 3), "2026-11-02");
  assert.equal(daysBetween("2026-10-29", "2026-11-02"), 4);
  const cells = monthCells(2026, 9);
  assert.equal(cells.length, 42);
  assert.equal(cells[0], "2026-09-27");
});

test("moving an all-day event keeps UTC midnight; a timed one keeps its clock time", () => {
  const allDay = { allDay: true, startAt: "2026-10-29T00:00:00.000Z", endAt: "2026-10-31T00:00:00.000Z" };
  assert.deepEqual(shiftedEvent(allDay, 2), { startAt: "2026-10-31T00:00:00.000Z", endAt: "2026-11-02T00:00:00.000Z" });
  const start = new Date(2026, 9, 29, 10, 30);
  const moved = new Date(shiftedEvent({ allDay: false, startAt: start.toISOString(), endAt: null }, -1).startAt);
  assert.equal(moved.getDate(), 28);
  assert.equal(moved.getHours(), 10);
  assert.equal(shiftedEvent({ allDay: false, startAt: start.toISOString(), endAt: null }, 1).endAt, null);
});

test("week summary counts each event once", () => {
  const span = { id: "a", allDay: true, startAt: "x" };
  const meeting = { id: "b", allDay: false, startAt: "2026-10-29T16:00:00Z", endAt: "2026-10-29T17:30:00Z" };
  const byDay = new Map([
    ["2026-10-29", { allDay: [span], timed: [meeting] }],
    ["2026-10-30", { allDay: [span], timed: [] }],
  ]);
  assert.deepEqual(weekSummary(byDay), { total: 2, hours: 1.5, busiest: { dateStr: "2026-10-29", count: 2 } });
});
