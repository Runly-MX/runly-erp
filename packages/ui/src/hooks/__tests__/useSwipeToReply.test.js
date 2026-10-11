import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createSwipeController } from "../useSwipeToReply.js";

function makeTarget() {
  const calls = { capture: 0, release: 0 };
  return {
    calls,
    setPointerCapture() { calls.capture++; },
    releasePointerCapture() { calls.release++; },
  };
}
const target = makeTarget();

function drag(ctrl, points, tgt = target) {
  ctrl.onPointerDown({ clientX: points[0][0], clientY: points[0][1], pointerId: 1, currentTarget: tgt });
  for (const [x, y] of points.slice(1)) ctrl.onPointerMove({ clientX: x, clientY: y });
  ctrl.onPointerUp();
}

describe("createSwipeController", () => {
  it("leaves opposite-direction swipes to the parent without capturing", () => {
    const tgt = makeTarget();
    const ctrl = createSwipeController({ direction: "right" });
    drag(ctrl, [[200, 0], [170, 2], [80, 4]], tgt);
    assert.equal(tgt.calls.capture, 0);
  });
  it("fires onReply for a right swipe past threshold (direction=right)", () => {
    let fired = 0;
    const ctrl = createSwipeController({ threshold: 64, direction: "right", onReply: () => fired++, onTranslate: () => {} });
    drag(ctrl, [[0, 0], [30, 2], [80, 4]]);
    assert.equal(fired, 1);
  });

  it("does not fire for a right swipe that never reaches threshold", () => {
    let fired = 0;
    const ctrl = createSwipeController({ threshold: 64, direction: "right", onReply: () => fired++, onTranslate: () => {} });
    drag(ctrl, [[0, 0], [20, 0], [40, 0]]);
    assert.equal(fired, 0);
  });

  it("ignores a mostly-vertical drag (scroll intent) and never translates", () => {
    let fired = 0;
    const translates = [];
    const ctrl = createSwipeController({ threshold: 64, direction: "right", onReply: () => fired++, onTranslate: (v) => translates.push(v) });
    drag(ctrl, [[0, 0], [10, 40], [20, 120]]);
    assert.equal(fired, 0);
    assert.ok(translates.every((v) => v === 0), "no horizontal translate on vertical intent");
  });

  it("direction=left: a right drag never fires", () => {
    let fired = 0;
    const ctrl = createSwipeController({ threshold: 64, direction: "left", onReply: () => fired++, onTranslate: () => {} });
    drag(ctrl, [[100, 0], [140, 0], [180, 0]]);
    assert.equal(fired, 0);
  });

  it("direction=left: a left drag past threshold fires", () => {
    let fired = 0;
    const ctrl = createSwipeController({ threshold: 64, direction: "left", onReply: () => fired++, onTranslate: () => {} });
    drag(ctrl, [[200, 0], [160, 0], [120, 0]]);
    assert.equal(fired, 1);
  });

  it("resets translate to 0 on release below threshold", () => {
    const translates = [];
    const ctrl = createSwipeController({ threshold: 64, direction: "right", onReply: () => {}, onTranslate: (v) => translates.push(v) });
    drag(ctrl, [[0, 0], [30, 0]]);
    assert.equal(translates[translates.length - 1], 0);
  });

  // Regression: capturing on pointerdown retargets `click` in Chromium and
  // kills every button/link inside the message row. Must NOT capture on a
  // plain tap, and must only capture once a horizontal drag is confirmed.
  it("does not capture the pointer on a plain press/release (no move)", () => {
    const tgt = makeTarget();
    const ctrl = createSwipeController({ threshold: 64, direction: "right", onReply: () => {}, onTranslate: () => {} });
    ctrl.onPointerDown({ clientX: 0, clientY: 0, pointerId: 1, currentTarget: tgt });
    ctrl.onPointerUp();
    assert.equal(tgt.calls.capture, 0);
  });

  it("does not capture the pointer on a vertical drag (scroll)", () => {
    const tgt = makeTarget();
    const ctrl = createSwipeController({ threshold: 64, direction: "right", onReply: () => {}, onTranslate: () => {} });
    drag(ctrl, [[0, 0], [4, 40], [8, 120]], tgt);
    assert.equal(tgt.calls.capture, 0);
  });

  it("captures the pointer once a horizontal drag is confirmed, releases on up", () => {
    const tgt = makeTarget();
    const ctrl = createSwipeController({ threshold: 64, direction: "right", onReply: () => {}, onTranslate: () => {} });
    drag(ctrl, [[0, 0], [30, 2], [80, 4]], tgt);
    assert.equal(tgt.calls.capture, 1);
    assert.equal(tgt.calls.release, 1);
  });
});

describe("createSwipeController — threshold tick", () => {
  it("fires onThresholdCross once when the swipe arms, not on every move", () => {
    let ticks = 0;
    const ctrl = createSwipeController({ threshold: 40, onThresholdCross: () => { ticks += 1; } });
    drag(ctrl, [[0, 0], [20, 0], [45, 0], [60, 0], [80, 0]], makeTarget());
    assert.equal(ticks, 1);
  });
});
