import assert from "node:assert/strict";
import test from "node:test";
import { canvasSize, remapAnnotation, remapLayer, remapPoint } from "../imageGeometry.js";

const src = { w: 400, h: 200 };
const ID = { quarterTurns: 0, angle: 0, flipX: false, flipY: false };
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`);

test("canvas size swaps on a quarter turn and grows when straightened", () => {
  assert.deepEqual(canvasSize(src, ID), { w: 400, h: 200 });
  assert.deepEqual(canvasSize(src, { ...ID, quarterTurns: 1 }), { w: 200, h: 400 });
  assert.ok(canvasSize(src, { ...ID, angle: 10 }).w > 400);
});

test("a clockwise quarter turn sends the top-left corner to the top-right", () => {
  const to = { ...ID, quarterTurns: 1 };
  const [x, y] = remapPoint([0, 0], ID, to, src);
  near(x, 200);
  near(y, 0);
  const [cx, cy] = remapPoint([200, 100], ID, to, src);
  near(cx, 100);
  near(cy, 200);
});

test("flips mirror about the center and a turn followed by its inverse is identity", () => {
  const [fx, fy] = remapPoint([50, 30], ID, { ...ID, flipX: true }, src);
  near(fx, 350);
  near(fy, 30);
  const turned = { ...ID, quarterTurns: 1 };
  const there = remapPoint([123, 45], ID, turned, src);
  const back = remapPoint(there, turned, ID, src);
  near(back[0], 123);
  near(back[1], 45);
});

test("annotations follow the picture; a rectangle becomes a closed outline", () => {
  const to = { ...ID, quarterTurns: 1 };
  const arrow = remapAnnotation({ type: "arrow", color: "#f00", width: 4, from: [0, 0], to: [400, 0] }, ID, to, src);
  near(arrow.from[0], 200);
  near(arrow.to[1], 400);
  const rect = remapAnnotation({ type: "rect", color: "#f00", width: 4, x: 10, y: 10, w: 100, h: 50 }, ID, to, src);
  assert.equal(rect.type, "pen");
  assert.equal(rect.points.length, 5);
});

test("layers keep their picture orientation: turn adds rotation, mirror flips", () => {
  const l = { x: 100, y: 100, w: 40, h: 40, rot: 0, flipX: false };
  const turned = remapLayer(l, ID, { ...ID, quarterTurns: 1 }, src);
  near(turned.rot, 90);
  assert.equal(turned.flipX, false);
  const mirrored = remapLayer(l, ID, { ...ID, flipX: true }, src);
  assert.equal(mirrored.flipX, true);
  near(mirrored.x, 300);
});
