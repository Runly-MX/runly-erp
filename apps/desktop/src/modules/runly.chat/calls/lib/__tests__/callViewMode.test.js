import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveCallView, resolveViewport, shouldAutoHideChrome } from "../callViewMode.js";
import { bestFitGrid, pageCount, pageSlice } from "../gridFit.js";

describe("resolveCallView", () => {
  it("in-person always wins", () => {
    assert.equal(resolveCallView({ inPerson: true, hasScreenShare: true }), "inperson");
  });
  it("a screen share is the stage unless the user forces the grid", () => {
    assert.equal(resolveCallView({ participantCount: 5, hasScreenShare: true }), "presentation");
    assert.equal(resolveCallView({ participantCount: 5, hasScreenShare: true, layoutPref: "grid" }), "grid");
  });
  it("1:1 without video shows big avatars, with video the direct PiP view", () => {
    assert.equal(resolveCallView({ participantCount: 2 }), "audio");
    assert.equal(resolveCallView({ participantCount: 2, isVideoActive: true }), "direct");
  });
  it("phones switch to speaker + carousel past four people", () => {
    assert.equal(resolveCallView({ participantCount: 4, isVideoActive: true, isPhone: true }), "grid");
    assert.equal(resolveCallView({ participantCount: 6, isVideoActive: true, isPhone: true }), "focus");
  });
  it("a pin turns the auto layout into focus", () => {
    assert.equal(resolveCallView({ participantCount: 6, isVideoActive: true, pinnedIdentity: "a" }), "focus");
  });
});

describe("resolveViewport / chrome", () => {
  it("classifies phones, tablets and desktops", () => {
    assert.equal(resolveViewport({ width: 390, height: 844, coarse: true }), "phone");
    assert.equal(resolveViewport({ width: 844, height: 390, coarse: true }), "phone-landscape");
    assert.equal(resolveViewport({ width: 820, height: 1180, coarse: true }), "tablet");
    assert.equal(resolveViewport({ width: 1440, height: 900 }), "desktop");
  });
  it("auto-hides chrome on landscape phones only", () => {
    assert.equal(shouldAutoHideChrome({ viewport: "phone-landscape", view: "grid" }), true);
    assert.equal(shouldAutoHideChrome({ viewport: "phone", view: "grid", isVideoActive: true }), false);
    assert.equal(shouldAutoHideChrome({ viewport: "desktop", view: "grid", isVideoActive: true }), false);
  });
});

describe("bestFitGrid", () => {
  it("puts 4 tiles in a 2x2 on a 16:9 box", () => {
    const fit = bestFitGrid({ count: 4, width: 1600, height: 900, gap: 0 });
    assert.equal(fit.cols, 2);
    assert.equal(fit.rows, 2);
  });
  it("stacks 2 tiles vertically on a tall phone box", () => {
    const fit = bestFitGrid({ count: 2, width: 390, height: 700, gap: 8 });
    assert.equal(fit.cols, 1);
  });
  it("caps a page at 16 and paginates the rest", () => {
    assert.equal(bestFitGrid({ count: 30, width: 1600, height: 900 }).perPage, 16);
    assert.equal(pageCount(30), 2);
    assert.equal(pageSlice([...Array(30).keys()], 1).length, 14);
    assert.equal(pageSlice([...Array(30).keys()], 9)[0], 16);
  });
});
