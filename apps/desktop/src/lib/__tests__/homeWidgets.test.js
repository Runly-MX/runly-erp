import test from "node:test";
import assert from "node:assert/strict";
import { addWidget, availableWidgets, moveWidget, removeWidget, resolveShown, sizeFromDrag, sizeFromKey, sizeOf, withSize } from "../homeWidgets.js";

const catalog = [
  { id: "a", moduleKey: "m.a" },
  { id: "b", moduleKey: "m.b" },
  { id: "c", moduleKey: "m.c" },
];

test("only widgets of modules the person can open are offered", () => {
  assert.deepEqual(availableWidgets(catalog, ["m.a", "m.c"]).map((w) => w.id), ["a", "c"]);
  assert.deepEqual(availableWidgets(catalog, []).map((w) => w.id), []);
});

test("a widget with something waiting for the person is offered even without the module", () => {
  assert.deepEqual(availableWidgets(catalog, ["m.a"], ["c"]).map((w) => w.id), ["a", "c"]);
  assert.deepEqual(availableWidgets(catalog, ["m.a"], ["zzz"]).map((w) => w.id), ["a"]);
});

test("home starts empty and shows only what was added, in board order", () => {
  assert.deepEqual(resolveShown(undefined, ["a", "b", "c"]), []);
  assert.deepEqual(resolveShown({}, ["a", "b", "c"]), []);
  assert.deepEqual(resolveShown({ shown: ["c", "a"] }, ["a", "b", "c"]), ["c", "a"]);
});

test("a board that defaults to everything shows all offered widgets until the person saves", () => {
  assert.deepEqual(resolveShown({}, ["a", "b"], { defaultAll: true }), ["a", "b"]);
  assert.deepEqual(resolveShown({ shown: ["b"] }, ["a", "b"], { defaultAll: true }), ["b"]);
});

test("a saved widget whose module is no longer available, or repeated, is dropped", () => {
  assert.deepEqual(resolveShown({ shown: ["b", "gone", "a", "b"] }, ["a", "b"]), ["b", "a"]);
});

test("a legacy hidden/order preference keeps what the person saw", () => {
  assert.deepEqual(resolveShown({ hidden: ["b"] }, ["a", "b", "c"]), ["a", "c"]);
  assert.deepEqual(resolveShown({ hidden: [], order: ["c", "a"] }, ["a", "b", "c"]), ["c", "a", "b"]);
});

test("add, remove and move keep the list consistent", () => {
  assert.deepEqual(addWidget(["a"], "b"), ["a", "b"]);
  assert.deepEqual(addWidget(["a"], "a"), ["a"]);
  assert.deepEqual(removeWidget(["a", "b"], "a"), ["b"]);
  assert.deepEqual(moveWidget(["a", "b", "c"], "c", "a"), ["c", "a", "b"]);
  assert.deepEqual(moveWidget(["a", "b", "c"], "a", "a"), ["a", "b", "c"]);
  assert.deepEqual(moveWidget(["a", "b"], "a", "zzz"), ["a", "b"]);
});

test("sizes default to one cell, read the legacy widths and are clamped", () => {
  assert.deepEqual(sizeOf({}, "a"), { w: 1, h: 1 });
  assert.deepEqual(sizeOf({ size: { a: "lg" } }, "a"), { w: 3, h: 1 });
  assert.deepEqual(sizeOf(withSize({}, "a", { w: 9, h: 0 }), "a"), { w: 3, h: 1 });
  assert.deepEqual(sizeOf(withSize({ shown: ["a"] }, "a", { w: 2, h: 2 }), "a"), { w: 2, h: 2 });
});

test("dragging the corner changes the span by whole cells; arrows change one cell", () => {
  const cell = { width: 400, height: 240 };
  assert.deepEqual(sizeFromDrag({ w: 1, h: 1 }, { x: 420, y: 10 }, cell), { w: 2, h: 1 });
  assert.deepEqual(sizeFromDrag({ w: 2, h: 2 }, { x: -450, y: -260 }, cell), { w: 1, h: 1 });
  assert.deepEqual(sizeFromDrag({ w: 1, h: 1 }, { x: 5000, y: 5000 }, cell), { w: 3, h: 2 });
  assert.deepEqual(sizeFromKey({ w: 1, h: 1 }, "ArrowRight"), { w: 2, h: 1 });
  assert.deepEqual(sizeFromKey({ w: 3, h: 2 }, "ArrowRight"), { w: 3, h: 2 });
  assert.deepEqual(sizeFromKey({ w: 2, h: 2 }, "ArrowUp"), { w: 2, h: 1 });
  assert.deepEqual(sizeFromKey({ w: 2, h: 2 }, "x"), { w: 2, h: 2 });
});
