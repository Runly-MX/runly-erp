import { test } from "node:test";
import assert from "node:assert/strict";
import { recordingOrientation, tileWidthFor } from "../videoAspect.js";

const person = (w, h, { muted = false } = {}) => ({
  identity: `p${w}x${h}${Math.random()}`,
  getTrackPublication: () => (w ? { track: {}, isMuted: muted, dimensions: { width: w, height: h } } : null),
});

test("two upright phone cameras record vertically", () => {
  assert.equal(recordingOrientation({ people: [person(720, 1280), person(1080, 1920)] }), "portrait");
});

test("a laptop camera, a screen share or a group records horizontally", () => {
  assert.equal(recordingOrientation({ people: [person(720, 1280), person(1280, 720)] }), "landscape");
  assert.equal(recordingOrientation({ people: [person(720, 1280)], hasScreenShare: true }), "landscape");
  assert.equal(recordingOrientation({ people: [person(720, 1280), person(720, 1280), person(720, 1280)] }), "landscape");
});

test("cameras that are off don't decide; no camera at all is landscape", () => {
  assert.equal(recordingOrientation({ people: [person(720, 1280), person(1280, 720, { muted: true })] }), "portrait");
  assert.equal(recordingOrientation({ people: [person(0, 0)] }), "landscape");
});

test("portrait tiles keep the row height and narrow their width", () => {
  assert.equal(tileWidthFor(16 / 9, 112, 176), 176);
  assert.equal(tileWidthFor(9 / 16, 112, 176), 63);
  assert.equal(tileWidthFor(null, 112, 176), 176);
});
