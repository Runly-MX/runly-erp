import assert from "node:assert/strict";
import test from "node:test";
import { FILTER_PRESETS, presetFilter, presetTint } from "../imageFilters.js";
import { moveLayer, resizeLayerToPoint, rotateLayerToPoint, scaleLayer } from "../imageLayers.js";

test("presetFilter is empty for the original and blends by amount", () => {
  assert.equal(presetFilter({ id: "none", amount: 100 }), "");
  assert.equal(presetFilter(null), "");
  assert.match(presetFilter({ id: "bw", amount: 100 }), /grayscale\(1\)/);
  assert.match(presetFilter({ id: "bw", amount: 0 }), /grayscale\(0\)/);
  assert.match(presetFilter({ id: "bw", amount: 50 }), /grayscale\(0\.5\)/);
  assert.ok(FILTER_PRESETS.every((p) => p.id && p.label));
});

const layer = { x: 100, y: 100, w: 80, h: 60, rot: 0 };

test("layers scale with a minimum size, move inside the picture and rotate to a point", () => {
  assert.equal(scaleLayer(layer, 2).w, 160);
  assert.ok(scaleLayer(layer, 0.0001).h >= 24 - 1e-9);
  const moved = moveLayer(layer, 500, -500, { w: 300, h: 200 });
  assert.deepEqual([moved.x, moved.y], [300, 0]);
  assert.equal(rotateLayerToPoint(layer, [100, 0]).rot, 0);
  assert.equal(rotateLayerToPoint(layer, [200, 100]).rot, 90);
  const grown = resizeLayerToPoint(layer, [200, 100]);
  assert.ok(Math.abs(grown.w / grown.h - 80 / 60) < 1e-9);
  assert.ok(Math.abs(Math.hypot(grown.w, grown.h) / 2 - 100) < 1e-6);
});

test("looks are strong and tinted ones carry a colour cast that scales with the intensity", () => {
  assert.match(presetFilter({ id: "vivid", amount: 100 }), /saturate\(2\)/);
  const warm = presetTint({ id: "warm", amount: 100 });
  assert.equal(warm.mode, "soft-light");
  assert.ok(warm.alpha > 0.3);
  assert.ok(Math.abs(presetTint({ id: "warm", amount: 50 }).alpha - warm.alpha / 2) < 1e-9);
  assert.equal(presetTint({ id: "bw", amount: 100 }), null);
  assert.equal(presetTint({ id: "none", amount: 100 }), null);
});
