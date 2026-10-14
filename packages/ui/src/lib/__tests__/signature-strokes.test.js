import test from "node:test";
import assert from "node:assert/strict";
import { denormalizeStrokes, fitStrokesForExport, normalizePoint, strokesBounds } from "../signature-strokes.js";

const near = (a, b) => Math.abs(a - b) < 1e-6;

test("normalizes and restores points at any surface size", () => {
  const p = normalizePoint(250, 50, 500, 200);
  assert.deepEqual(p, { x: 0.5, y: 0.25 });
  assert.deepEqual(denormalizeStrokes([[p]], 1000, 400), [[{ x: 500, y: 100 }]]);
  assert.deepEqual(normalizePoint(-5, 900, 500, 200), { x: 0, y: 1 });
});

test("export crops to the bounds and fits uniformly, centered", () => {
  // A wide stroke in the middle of the surface: width-bound fit.
  const out = fitStrokesForExport([[{ x: 0.2, y: 0.4 }, { x: 0.8, y: 0.6 }]], { width: 600, height: 240, padding: 12 });
  const [a, b] = out[0];
  assert.ok(near(a.x, 12) && near(b.x, 588));
  // Uniform scale: x span 0.6*2.5 = 1.5 -> 576 px, so y span 0.2 -> 76.8 px, centered vertically.
  assert.ok(near(b.y - a.y, 76.8));
  assert.ok(near((a.y + b.y) / 2, 120));
});

test("a tall drawing is height-bound and centered horizontally", () => {
  const [[a, b]] = fitStrokesForExport([[{ x: 0.5, y: 0.1 }, { x: 0.52, y: 0.9 }]], { width: 600, height: 240, padding: 12 });
  assert.ok(near(a.y, 12) && near(b.y, 228));
  assert.ok(near((a.x + b.x) / 2, 300));
});

test("same drawing at a different source size exports identically", () => {
  const strokes = [[normalizePoint(100, 40, 500, 200), normalizePoint(400, 160, 500, 200)]];
  const resized = [[normalizePoint(200, 80, 1000, 400), normalizePoint(800, 320, 1000, 400)]];
  assert.deepEqual(fitStrokesForExport(strokes), fitStrokesForExport(resized));
});

test("empty and single-point drawings are safe", () => {
  assert.deepEqual(fitStrokesForExport([]), []);
  assert.equal(strokesBounds([]), null);
  const [[dot]] = fitStrokesForExport([[{ x: 0.3, y: 0.3 }]], { width: 600, height: 240 });
  assert.ok(near(dot.x, 300) && near(dot.y, 120));
});
