import assert from "node:assert/strict";
import test from "node:test";
import { applyOps, colorOps } from "../canvasColor.js";

const px = (r, g, b) => new Uint8ClampedArray([r, g, b, 255]);

test("no filter and no adjustments produce no operations", () => {
  assert.deepEqual(colorOps({ id: "none", amount: 100 }, { brightness: 100, contrast: 100, saturation: 100 }), []);
  assert.deepEqual(colorOps(null, null), []);
});

test("brightness scales and clamps channels", () => {
  const data = px(100, 200, 50);
  applyOps(data, colorOps(null, { brightness: 150, contrast: 100, saturation: 100 }));
  assert.deepEqual([...data.slice(0, 3)], [150, 255, 75]);
});

test("grayscale turns pure red into a neutral grey with the CSS luminance weights", () => {
  const data = px(255, 0, 0);
  applyOps(data, colorOps({ id: "bw", amount: 100 }, null));
  assert.ok(data[0] === data[1] && data[1] === data[2]);
  assert.ok(data[0] > 40 && data[0] < 90);
});

test("zero saturation matches grayscale and contrast pivots around mid grey", () => {
  const a = px(255, 0, 0);
  applyOps(a, colorOps(null, { brightness: 100, contrast: 100, saturation: 0 }));
  assert.ok(a[0] === a[1] && a[1] === a[2]);
  const mid = px(128, 128, 128);
  applyOps(mid, colorOps(null, { brightness: 100, contrast: 200, saturation: 100 }));
  assert.ok(Math.abs(mid[0] - 128) <= 1);
});
