import test from "node:test";
import assert from "node:assert/strict";
import { NODE, clampScale, connect, dropIndex, edgePath, fitView, layoutNodes, nearestSlot, snap, startView, toCanvas, zoomAt } from "../canvasLayout.js";

const ids = (count) => Array.from({ length: count }, (_, index) => ({ id: `n${index}` }));

test("blocks are placed one after another and joined by arrows", () => {
  const layout = layoutNodes(ids(3));
  assert.deepEqual(layout.nodes.map((node) => node.x), [0, NODE.width + NODE.gap, 2 * (NODE.width + NODE.gap)]);
  assert.equal(layout.edges.length, 2);
  assert.deepEqual(layout.edges[0].start, { x: NODE.width, y: NODE.height / 2 });
  assert.deepEqual(layout.edges[0].end, { x: NODE.width + NODE.gap, y: NODE.height / 2 });
  assert.equal(layout.edges[0].out, "right");
  assert.equal(layout.edges[0].into, "left");
  assert.equal(layout.edges[0].toIndex, 1);
  assert.equal(layout.add.x, 2 * (NODE.width + NODE.gap) + NODE.width + NODE.gap);
  assert.deepEqual(layout.nodes[1].ports, { in: "left", out: "right" });
  assert.deepEqual(layout.nodes[2].ports, { in: "left", out: "right" }); // the last one leads to the add slot
});

test("the vertical preset stacks blocks and connects bottom to top", () => {
  const layout = layoutNodes(ids(2), "vertical");
  assert.deepEqual(layout.nodes.map((node) => node.y), [0, NODE.height + NODE.gap]);
  assert.deepEqual(layout.edges[0].start, { x: NODE.width / 2, y: NODE.height });
  assert.equal(layout.edges[0].out, "bottom");
  assert.ok(layout.bounds.height > NODE.height * 2);
});

test("manual positions override the grid and the arrows pick the nearest sides", () => {
  const layout = layoutNodes(ids(3), "horizontal", { n1: { x: 0, y: 300 } });
  assert.deepEqual([layout.nodes[1].x, layout.nodes[1].y], [0, 300]);
  assert.equal(layout.edges[0].out, "bottom"); // n1 sits right below n0
  assert.equal(layout.edges[0].into, "top");
  const back = connect({ x: 500, y: 0, width: 248, height: 92 }, { x: 0, y: 0, width: 248, height: 92 });
  assert.deepEqual([back.out, back.into], ["left", "right"]);
  assert.ok(layout.bounds.height >= 300 + NODE.height);
});

test("an empty list has no arrows or add slot", () => {
  const layout = layoutNodes([]);
  assert.equal(layout.edges.length, 0);
  assert.equal(layout.add, null);
});

test("edge paths leave and arrive along the sides they use", () => {
  assert.equal(edgePath({ start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, out: "right", into: "left" }), "M 0 0 C 50 0, 50 0, 100 0");
  assert.equal(edgePath({ start: { x: 0, y: 0 }, end: { x: 0, y: 100 }, out: "bottom", into: "top" }), "M 0 0 C 0 50, 0 50, 0 100");
  assert.equal(edgePath({ start: { x: 100, y: 0 }, end: { x: 0, y: 0 }, out: "left", into: "right" }), "M 100 0 C 50 0, 50 0, 0 0");
});

test("snap rounds to the 8 px grid", () => {
  assert.deepEqual([snap(3), snap(5), snap(-13), snap(20)], [0, 8, -16, 24]);
});

test("fit centres the flow and never zooms in past 1x", () => {
  const view = fitView({ x: 0, y: 0, width: 400, height: 100 }, { width: 1000, height: 600 });
  assert.equal(view.k, 1);
  assert.equal(view.x, 300);
  assert.equal(view.y, 250);
  assert.equal(fitView({ x: 0, y: 0, width: 2400, height: 200 }, { width: 600, height: 400 }).k, 0.4);
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
  assert.equal(wide.x, 56);
  const tall = startView({ x: 0, y: -56, width: 248, height: 1200 }, { width: 390, height: 500 });
  assert.equal(tall.k, 0.85);
  assert.ok(Math.abs(tall.x - (390 - 248 * 0.85) / 2) < 1e-9);
});
