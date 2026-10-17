import test from "node:test";
import assert from "node:assert/strict";
import { isScrolledPast, reserveFor } from "../scroll-collapse.js";

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
