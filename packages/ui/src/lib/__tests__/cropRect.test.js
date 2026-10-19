import assert from "node:assert/strict";
import test from "node:test";
import { fitRect, moveRect, resizeRect, toSourceRect } from "../cropRect.js";

const bounds = { w: 400, h: 300 };

test("fitRect centers the largest rect of a ratio", () => {
  assert.deepEqual(fitRect(bounds, 1), { x: 50, y: 0, w: 300, h: 300 });
  assert.deepEqual(fitRect(bounds, null), { x: 0, y: 0, w: 400, h: 300 });
  const wide = fitRect(bounds, 16 / 9);
  assert.equal(wide.w, 400);
  assert.ok(Math.abs(wide.h - 225) < 1e-9);
});

test("moveRect stays inside the picture", () => {
  const moved = moveRect({ x: 10, y: 10, w: 100, h: 100 }, -50, 999, bounds);
  assert.deepEqual(moved, { x: 0, y: 200, w: 100, h: 100 });
});

test("free resize clamps to bounds and keeps a minimum size", () => {
  const start = { x: 100, y: 100, w: 100, h: 100 };
  const grown = resizeRect(start, 1, 1, 999, 999, bounds);
  assert.deepEqual(grown, { x: 100, y: 100, w: 300, h: 200 });
  const shrunk = resizeRect(start, 1, 0, -999, 0, bounds);
  assert.equal(shrunk.w, 24);
});

test("locked-ratio corner resize keeps the ratio and the opposite corner", () => {
  const start = { x: 100, y: 100, w: 100, h: 100 };
  const r = resizeRect(start, 1, 1, 50, 0, bounds, 1);
  assert.equal(r.w, r.h);
  assert.equal(r.x, 100);
  assert.equal(r.y, 100);
  assert.equal(r.w, 150);
  const topLeft = resizeRect(start, -1, -1, -50, -50, bounds, 1);
  assert.equal(topLeft.x + topLeft.w, 200);
  assert.equal(topLeft.y + topLeft.h, 200);
});

test("toSourceRect scales display space to source pixels", () => {
  const r = toSourceRect({ x: 10, y: 20, w: 100, h: 50 }, bounds, { width: 800, height: 600 });
  assert.deepEqual(r, { x: 20, y: 40, w: 200, h: 100 });
});
