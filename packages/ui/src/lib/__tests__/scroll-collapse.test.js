import test from "node:test";
import assert from "node:assert/strict";
import { isScrolledPast, nextCollapsed, reserveFor } from "../scroll-collapse.js";

const rect = (top, width = 300, height = 12) => ({ top, width, height });

test("isScrolledPast: only a sentinel scrolled above the view collapses", () => {
  const rootBounds = { top: 0, bottom: 800 };
  assert.equal(isScrolledPast({ isIntersecting: true, boundingClientRect: rect(10), rootBounds }), false);
  assert.equal(isScrolledPast({ isIntersecting: false, boundingClientRect: rect(40), rootBounds }), true);
  assert.equal(isScrolledPast({ isIntersecting: false, boundingClientRect: rect(900), rootBounds }), false);
  assert.equal(isScrolledPast({ isIntersecting: false, boundingClientRect: rect(0, 0, 0), rootBounds }), false);
  assert.equal(isScrolledPast(null), false);
});

test("reserveFor keeps the expanded height", () => {
  assert.equal(reserveFor(120, 48), 72);
  assert.equal(reserveFor(48, 120), 0);
  assert.equal(reserveFor(undefined, 10), 0);
});

test("nextCollapsed: short pages never collapse", () => {
  assert.equal(nextCollapsed(false, { scrollTop: 120, scrollRange: 150, headerDelta: 80 }), false);
});

test("nextCollapsed: collapses past the threshold on long pages", () => {
  assert.equal(nextCollapsed(false, { scrollTop: 40, scrollRange: 2000, headerDelta: 80 }), false);
  assert.equal(nextCollapsed(false, { scrollTop: 60, scrollRange: 2000, headerDelta: 80 }), true);
});

test("nextCollapsed: hysteresis keeps it collapsed until near the top", () => {
  assert.equal(nextCollapsed(true, { scrollTop: 30, scrollRange: 2000 }), true);
  assert.equal(nextCollapsed(true, { scrollTop: 5, scrollRange: 2000 }), false);
});
