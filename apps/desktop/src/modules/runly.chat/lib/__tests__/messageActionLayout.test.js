import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeAnchoredMenuLayout, computeSpotlightLayout } from "../messageActionLayout.js";

const base = {
  vw: 390,
  vh: 844,
  pillSize: { width: 276, height: 44 },
  cardSize: { width: 240, height: 560 },
  safeTop: 59,
  safeBottom: 34,
  gap: 8,
  margin: 8,
};
const mTop = base.margin + base.safeTop;       // 67
const mBottom = base.margin + base.safeBottom;  // 42

function assertNoOverlap(out) {
  assert.ok(out.pillTop >= mTop - 0.5, `pill top ${out.pillTop}`);
  assert.ok(out.pillTop + base.pillSize.height <= out.cloneTop, "pill above the bubble");
  assert.ok(out.cloneTop + out.cloneHeight <= out.cardTop, "card below the bubble");
  assert.ok(out.cardTop + out.cardMaxHeight <= base.vh - mBottom + 0.5, `card bottom ${out.cardTop + out.cardMaxHeight}`);
}

describe("computeSpotlightLayout", () => {
  it("leaves a small mid-screen message in place with the full card", () => {
    const out = computeSpotlightLayout({ ...base, cardSize: { width: 240, height: 300 }, rect: { top: 300, bottom: 350, left: 12, right: 300 } });
    assert.equal(out.cloneTop, 300);
    assert.equal(out.cardMaxHeight, 300);
    assert.equal(out.cropped, false);
    assertNoOverlap(out);
  });

  it("shifts a message near the bottom up instead of covering it", () => {
    const out = computeSpotlightLayout({ ...base, isOwn: true, rect: { top: 740, bottom: 790, left: 90, right: 378 } });
    assert.ok(out.cloneTop < 740, `cloneTop ${out.cloneTop}`);
    assertNoOverlap(out);
  });

  it("caps the card so it scrolls when actions don't fit, keeping the whole bubble", () => {
    const out = computeSpotlightLayout({ ...base, rect: { top: 400, bottom: 640, left: 12, right: 300 } });
    assert.ok(out.cardMaxHeight < base.cardSize.height);
    assert.ok(out.cardMaxHeight >= 200);
    assert.equal(out.cloneHeight, 240);
    assertNoOverlap(out);
  });

  it("crops only a bubble taller than the remaining room", () => {
    const out = computeSpotlightLayout({ ...base, rect: { top: 100, bottom: 1500, left: 12, right: 320 } });
    assert.equal(out.cropped, true);
    assert.equal(out.cardMaxHeight, 200);
    assertNoOverlap(out);
  });

  it("hugs the sender's side for pill and card", () => {
    const own = computeSpotlightLayout({ ...base, isOwn: true, rect: { top: 300, bottom: 350, left: 100, right: 378 } });
    assert.equal(own.cardLeft + base.cardSize.width, 378);
    assert.equal(own.pillLeft + base.pillSize.width, 378);
    const received = computeSpotlightLayout({ ...base, rect: { top: 300, bottom: 350, left: 14, right: 200 } });
    assert.equal(received.cardLeft, 14);
    assert.equal(received.pillLeft, 14);
  });
});

describe("computeAnchoredMenuLayout — mouse", () => {
  it("clamps the menu inside the bottom inset when the cursor is low", () => {
    const out = computeAnchoredMenuLayout({ ...base, rect: null, anchorPoint: { x: 40, y: 830 }, size: { width: 240, height: 300 } });
    assert.ok(out.top + 300 <= base.vh - mBottom + 0.5);
  });
});
