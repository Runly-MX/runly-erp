import test from "node:test";
import assert from "node:assert/strict";
import { eventsOnDay } from "../day-events.js";

test("a multi-day all-day span (project task) shows on every day it covers", () => {
  const task = { id: "t", allDay: true, startAt: "2026-10-29T00:00:00.000Z", endAt: "2026-10-31T00:00:00.000Z" };
  assert.deepEqual(eventsOnDay([task], "2026-10-29").allDay.map((e) => e.id), ["t"]);
  assert.deepEqual(eventsOnDay([task], "2026-10-31").allDay.map((e) => e.id), ["t"]);
  assert.equal(eventsOnDay([task], "2026-10-28").allDay.length, 0);
  assert.equal(eventsOnDay([task], "2026-11-01").allDay.length, 0);
});

test("a single-day all-day event without endAt only shows on its day", () => {
  const ev = { id: "e", allDay: true, startAt: "2026-10-29T00:00:00.000Z", endAt: null };
  assert.equal(eventsOnDay([ev], "2026-10-29").allDay.length, 1);
  assert.equal(eventsOnDay([ev], "2026-10-30").allDay.length, 0);
});
