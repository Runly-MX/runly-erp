// apps/api/src/routes/chat/__tests__/mirai-history-budget.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { trimHistoryRows } from "../mirai-service.js";

test("trimHistoryRows keeps the newest messages within the char budget, oldest first", () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({ body: `${i}`.padEnd(3000, "x") })); // newest first
  const kept = trimHistoryRows(rows);
  assert.equal(kept.length, 3);
  assert.deepEqual(kept.map((m) => m.body[0]), ["2", "1", "0"]);
});

test("trimHistoryRows counts a huge message at its clipped size, so it never evicts the rest alone", () => {
  const kept = trimHistoryRows([{ body: "y".repeat(50_000) }, { body: "old" }]);
  assert.deepEqual(kept.map((m) => m.body.length), [3, 50_000]);
});
