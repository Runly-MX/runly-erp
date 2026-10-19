import assert from "node:assert/strict";
import test from "node:test";
import { bounds, hitTest, isMeaningful, translateAnnotation } from "../imageAnnotations.js";
import { strokeBounds } from "../imageFx.js";
import { remapAnnotation } from "../imageGeometry.js";

const base = { color: "#f00", width: 6 };
const items = [
  { id: "a", type: "rect", ...base, x: 100, y: 100, w: 200, h: 100 },
  { id: "b", type: "arrow", ...base, from: [0, 0], to: [100, 0] },
  { id: "c", type: "pen", brush: "pen", ...base, points: [[400, 400], [500, 400]] },
  { id: "d", type: "ellipse", ...base, x: 600, y: 100, w: 100, h: 60 },
  { id: "e", type: "fx", mode: "blur", size: 40, strength: 50, points: [[300, 300], [320, 300]] },
];

test("hitTest picks the element under the pointer, topmost first, and ignores empty space", () => {
  assert.equal(hitTest(items, [100, 150], 8), "a");
  assert.equal(hitTest(items, [200, 150], 8), null, "inside an unfilled rect is not a hit");
  assert.equal(hitTest(items, [50, 2], 8), "b");
  assert.equal(hitTest(items, [450, 404], 8), "c");
  assert.equal(hitTest(items, [650, 100], 8), "d");
  assert.equal(hitTest(items, [310, 305], 8), "e");
  assert.equal(hitTest(items, [900, 900], 8), null);
});

test("translateAnnotation moves every kind of element and bounds follow", () => {
  for (const a of items) {
    const moved = translateAnnotation(a, 10, 20);
    assert.equal(Math.round(bounds(moved).x - bounds(a).x), 10);
    assert.equal(Math.round(bounds(moved).y - bounds(a).y), 20);
  }
});

test("isMeaningful rejects taps and empty text", () => {
  assert.equal(isMeaningful({ type: "pen", points: [[1, 1]] }), false);
  assert.equal(isMeaningful({ type: "ellipse", w: 2, h: 50 }), false);
  assert.equal(isMeaningful({ type: "text", text: "  " }), false);
  assert.equal(isMeaningful({ type: "text", text: "Hola" }), true);
});

test("remap keeps ids; ellipse and rect become outlines, retouch strokes follow the picture", () => {
  const src = { w: 400, h: 200 };
  const from = { quarterTurns: 0, angle: 0, flipX: false, flipY: false };
  const to = { ...from, quarterTurns: 1 };
  const ellipse = remapAnnotation(items[3], from, to, src);
  assert.equal(ellipse.id, "d");
  assert.equal(ellipse.type, "pen");
  const fx = remapAnnotation({ id: "e", type: "fx", mode: "blur", size: 40, strength: 50, points: [[0, 0]] }, from, to, src);
  assert.equal(fx.type, "fx");
  assert.ok(Math.abs(fx.points[0][0] - 200) < 1e-6);
});

test("strokeBounds clamps to the canvas and snaps to the pixel grid", () => {
  assert.deepEqual(strokeBounds([[5, 5]], 20, 100, 100), { x: 0, y: 0, w: 17, h: 17 });
  const snapped = strokeBounds([[53, 53]], 10, 200, 200, 8);
  assert.equal(snapped.x % 8, 0);
  assert.equal(strokeBounds([[500, 500]], 10, 100, 100), null);
});
