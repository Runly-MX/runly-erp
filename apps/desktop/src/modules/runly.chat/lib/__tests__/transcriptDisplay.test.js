import test from "node:test";
import assert from "node:assert/strict";
import { activeSegmentIndex, transcriptToVideoOffsetMs } from "../transcriptDisplay.js";

test("activeSegmentIndex finds the last segment started at or before the time", () => {
  const segments = [{ startMs: 0 }, { startMs: 5000 }, { startMs: 9000 }];
  assert.equal(activeSegmentIndex(segments, -1), -1);
  assert.equal(activeSegmentIndex(segments, 0), 0);
  assert.equal(activeSegmentIndex(segments, 8999), 1);
  assert.equal(activeSegmentIndex(segments, 99999), 2);
  assert.equal(activeSegmentIndex([], 10), -1);
});

test("transcriptToVideoOffsetMs only offsets PER_TRACK transcripts with plausible clocks", () => {
  const recording = { startedAt: "2026-10-24T10:00:00Z" };
  assert.equal(transcriptToVideoOffsetMs({ sourceKind: "PER_TRACK", createdAt: "2026-10-24T10:00:05Z" }, recording), 5000);
  assert.equal(transcriptToVideoOffsetMs({ sourceKind: "MIXED", createdAt: "2026-10-24T10:00:05Z" }, recording), 0);
  assert.equal(transcriptToVideoOffsetMs({ sourceKind: "PER_TRACK", createdAt: "2026-10-24T14:00:00Z" }, recording), 0);
});
