import { test } from "node:test";
import assert from "node:assert/strict";
import { availableWidgets, visibleWidgets, toggleHidden, orderWidgets, moveInOrder, nextSize } from "../homeWidgets.js";

const catalog = [
  { id: "agenda", moduleKey: "runly.calendar" },
  { id: "pfm", moduleKey: "runly.pfm" },
  { id: "online", moduleKey: "runly.chat" },
];

test("only widgets of available modules are offered, in catalog order", () => {
  assert.deepEqual(
    availableWidgets(catalog, ["runly.chat", "runly.calendar"]).map((w) => w.id),
    ["agenda", "online"],
  );
});

test("hidden widgets are filtered out; unknown hidden ids are ignored", () => {
  const keys = ["runly.calendar", "runly.pfm", "runly.chat"];
  assert.deepEqual(visibleWidgets(catalog, keys, ["pfm", "gone"]).map((w) => w.id), ["agenda", "online"]);
  assert.equal(visibleWidgets(catalog, keys).length, 3);
});

test("toggleHidden adds and removes ids", () => {
  assert.deepEqual(toggleHidden(["a"], "b"), ["a", "b"]);
  assert.deepEqual(toggleHidden(["a", "b"], "a"), ["b"]);
});

test("orderWidgets honours the saved order and keeps new widgets after it", () => {
  const catalog = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  assert.deepEqual(orderWidgets(catalog, ["c", "a"]).map((w) => w.id), ["c", "a", "b", "d"]);
  assert.deepEqual(orderWidgets(catalog, []).map((w) => w.id), ["a", "b", "c", "d"]);
  assert.deepEqual(orderWidgets(catalog, ["zzz", "d"]).map((w) => w.id), ["d", "a", "b", "c"]);
});

test("moveInOrder moves one place and stops at the edges; sizes cycle", () => {
  assert.deepEqual(moveInOrder(["a", "b", "c"], "b", -1), ["b", "a", "c"]);
  assert.deepEqual(moveInOrder(["a", "b", "c"], "a", -1), ["a", "b", "c"]);
  assert.deepEqual(moveInOrder(["a", "b", "c"], "c", 1), ["a", "b", "c"]);
  assert.deepEqual([nextSize(undefined), nextSize("sm"), nextSize("md"), nextSize("lg")], ["md", "md", "lg", "sm"]);
});
