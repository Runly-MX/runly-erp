import test from "node:test";
import assert from "node:assert/strict";
import { dayNumber } from "../ganttLayout.js";
import { monthGrid, movedDates, pendingTasks, tasksOnDay, weekProgress, weekRangeLabel, weekStart } from "../weekLayout.js";

const d = (text) => dayNumber(text);

test("weeks start on Monday", () => {
  assert.equal(weekStart(d("2026-10-29")), d("2026-10-26")); // Thursday -> Monday
  assert.equal(weekStart(d("2026-10-26")), d("2026-10-26"));
  assert.equal(weekStart(d("2026-11-01")), d("2026-10-26")); // Sunday closes the week
  assert.equal(weekRangeLabel(d("2026-10-26")), "26 oct – 1 nov 2026");
});

test("a multi-day task shows on each day it covers; done tasks go last", () => {
  const span = { id: "a", title: "Inventario", startDate: "2026-10-29", dueDate: "2026-10-31", status: {} };
  const done = { id: "b", title: "Antes", dueDate: "2026-10-30", status: { isDone: true } };
  assert.deepEqual(tasksOnDay([done, span], d("2026-10-30")).map((t) => t.id), ["a", "b"]);
  assert.equal(tasksOnDay([span], d("2026-11-01")).length, 0);
});

test("pending splits overdue from undated and ignores done tasks", () => {
  const tasks = [
    { id: "late", dueDate: "2026-10-20", status: {} },
    { id: "nodate", status: {} },
    { id: "doneLate", dueDate: "2026-10-20", status: { isDone: true } },
  ];
  const { overdue, undated } = pendingTasks(tasks, d("2026-10-29"));
  assert.deepEqual(overdue.map((t) => t.id), ["late"]);
  assert.deepEqual(undated.map((t) => t.id), ["nodate"]);
});

test("week progress and month grid", () => {
  const tasks = [{ dueDate: "2026-10-28", status: { isDone: true } }, { dueDate: "2026-10-30", status: {} }];
  assert.deepEqual(weekProgress(tasks, d("2026-10-26")), { total: 2, done: 1, dueThisWeek: 1, percent: 50 });
  const grid = monthGrid(2026, 9);
  assert.equal(grid.length, 42);
  assert.equal(grid[0], d("2026-09-28")); // Oct 1 2026 is a Thursday
});

test("moving keeps the dates a task has and schedules undated ones", () => {
  assert.deepEqual(movedDates({ startDate: "2026-10-29", dueDate: "2026-10-31" }, 2), { startDate: "2026-10-31", dueDate: "2026-11-02" });
  assert.deepEqual(movedDates({ dueDate: "2026-10-29" }, -1), { startDate: undefined, dueDate: "2026-10-28" });
  assert.deepEqual(movedDates({}, 0, d("2026-10-30")), { startDate: "2026-10-30", dueDate: "2026-10-30" });
});
