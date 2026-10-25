import test from "node:test";
import assert from "node:assert/strict";
import { clock, formatDuration, parseDuration } from "../timeFormat.js";

test("durations are read the way people type them", () => {
  assert.deepEqual(["90", "1:30", "1h30", "1h 30", "1.5h", "1,5 h", "45m", "45 min", "2h", "2 horas", "0:05"].map(parseDuration), [90, 90, 90, 90, 90, 90, 45, 45, 120, 120, 5]);
  assert.deepEqual(["", "  ", "abc", "1:99", "h", "-5", "1h 2h"].map(parseDuration), [null, null, null, null, null, null, null]);
});

test("minutes and clocks read well", () => {
  assert.deepEqual([formatDuration(0), formatDuration(45), formatDuration(60), formatDuration(95), formatDuration(null)], ["0 min", "45 min", "1 h", "1 h 35 min", ""]);
  assert.equal(clock(3909), "01:05:09");
  assert.equal(clock(-3), "00:00:00");
});
