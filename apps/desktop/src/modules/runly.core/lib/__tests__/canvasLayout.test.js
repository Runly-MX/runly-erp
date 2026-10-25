import test from "node:test";
import assert from "node:assert/strict";
import { NODE, clampScale, dropIndex, edgePath, fitView, layoutNodes, nearestSlot, startView, toCanvas, zoomAt } from "../canvasLayout.js";

const ids = (count) => Array.from({ length: count }, (_, index) => ({ id: `n${index}` }));

test("nodes are placed one after another and joined by edges", () => {
  const layout = layoutNodes(ids(3));
  assert.deepEqual(layout.nodes.map((node) => node.x), [0, NODE.width + NODE.gap, 2 * (NODE.width + NODE.gap)]);
  assert.equal(layout.edges.length, 2);
  assert.deepEqual(layout.edges[0].start, { x: NODE.width, y: NODE.height / 2 });
  assert.deepEqual(layout.edges[0].end, { x: NODE.width + NODE.gap, y: NODE.height / 2 });
  assert.equal(layout.edges[0].toIndex, 1);
  assert.equal(layout.add.x, 2 * (NODE.width + NODE.gap) + NODE.width + NODE.gap);
});

test("vertical orientation stacks nodes and connects bottom to top ports", () => {
  const layout = layoutNodes(ids(2), "vertical");
  assert.deepEqual(layout.nodes.map((node) => node.y), [0, NODE.height + NODE.gap]);
  assert.deepEqual(layout.edges[0].start, { x: NODE.width / 2, y: NODE.height });
  assert.deepEqual(layout.edges[0].end, { x: NODE.width / 2, y: NODE.height + NODE.gap });
  assert.ok(layout.bounds.height > NODE.height * 2);
});

test("an empty list has no edges or add slot", () => {
  const layout = layoutNodes([]);
  assert.equal(layout.edges.length, 0);
  assert.equal(layout.add, null);
});

test("edge paths are straight when aligned and curved otherwise", () => {
  assert.match(edgePath({ start: { x: 0, y: 0 }, end: { x: 100, y: 0 } }), /^M 0 0 C 50 0, 50 0, 100 0$/);
  assert.match(edgePath({ start: { x: 0, y: 0 }, end: { x: 0, y: 100 } }, "vertical"), /^M 0 0 C 0 50, 0 50, 0 100$/);
});

test("fit centres the flow and never zooms in past 1x", () => {
  const view = fitView({ x: 0, y: 0, width: 400, height: 100 }, { width: 1000, height: 600 });
  assert.equal(view.k, 1);
  assert.equal(view.x, 300);
  assert.equal(view.y, 250);
  const small = fitView({ x: 0, y: 0, width: 2400, height: 200 }, { width: 600, height: 400 });
  assert.ok(small.k < 0.4 + 0.001 || small.k <= 0.25 * 2);
  assert.equal(small.k, 0.4); // clamped at the minimum
});

test("zoom keeps the point under the cursor in place and respects the limits", () => {
  const view = { x: 100, y: 50, k: 1 };
  const anchor = { x: 300, y: 200 };
  const next = zoomAt(view, 2, anchor);
  assert.equal(next.k, 1.6);
  const before = toCanvas(view, anchor);
  const after = toCanvas(next, anchor);
  assert.ok(Math.abs(before.x - after.x) < 1e-9 && Math.abs(before.y - after.y) < 1e-9);
  assert.equal(clampScale(0.01), 0.4);
});

test("nearest slot wins inside reach and nothing outside it", () => {
  const slots = [{ index: 0, point: { x: 0, y: 0 } }, { index: 1, point: { x: 300, y: 0 } }];
  assert.equal(nearestSlot(slots, { x: 260, y: 20 }).index, 1);
  assert.equal(nearestSlot(slots, { x: 1000, y: 1000 }), null);
});

test("drop index counts the other steps before the pointer", () => {
  assert.equal(dropIndex([100, 300, 500], 2, 50), 0);
  assert.equal(dropIndex([100, 300, 500], 2, 350), 2);
  assert.equal(dropIndex([100, 300, 500], 0, 350), 1);
  assert.equal(dropIndex([100, 300, 500], 0, 900), 2);
});

test("the opening view keeps text readable: whole flow when it fits, its start otherwise", () => {
  const small = startView({ x: 0, y: 0, width: 600, height: 100 }, { width: 1000, height: 500 });
  assert.equal(small.k, 1);
  const wide = startView({ x: 0, y: 0, width: 2400, height: 100 }, { width: 1000, height: 500 });
  assert.equal(wide.k, 0.85);
  assert.equal(wide.x, 56); // anchored at the first block, not centred
});

test("a tall flow opens at its top, centred horizontally", () => {
  const tall = startView({ x: 0, y: 0, width: 248, height: 1200 }, { width: 390, height: 500 });
  assert.equal(tall.k, 0.85);
  assert.equal(tall.y, 72);
  assert.ok(Math.abs(tall.x - (390 - 248 * 0.85) / 2) < 1e-9);
});
