// Pure helpers behind useScrollCollapse (collapsing sticky headers).

// Matches the header transition (duration-200) plus a little slack.
export const COLLAPSE_SETTLE_MS = 260;
// Scroll distance before the header collapses, and the distance from the top
// at which it expands again. The gap between both (hysteresis) stops the
// header from flickering on iOS rubber-band scrolling.
export const COLLAPSE_AT_PX = 56;
export const EXPAND_AT_PX = 8;
// Kept for callers that still import it.
export const COLLAPSE_THRESHOLD_PX = COLLAPSE_AT_PX;
// Extra scrollable room (beyond what the header loses) required before a page
// is allowed to collapse its header. Short pages never collapse, so collapsing
// can never shrink the page under the finger and bounce it back.
export const MIN_SPARE_SCROLL_PX = 160;

// Next collapsed state from the scroll position of the scroll container.
// scrollTop: current offset; scrollRange: scrollHeight - clientHeight;
// headerDelta: how much shorter the header gets when collapsed.
export function nextCollapsed(current, { scrollTop, scrollRange, headerDelta = 0 }) {
  const top = Math.max(0, Number(scrollTop) || 0);
  const range = Math.max(0, Number(scrollRange) || 0);
  if (!current) {
    // Not enough content to scroll comfortably after collapsing: stay expanded.
    if (range < Math.max(0, Number(headerDelta) || 0) + MIN_SPARE_SCROLL_PX) return false;
    return top > COLLAPSE_AT_PX;
  }
  return top > EXPAND_AT_PX;
}

// Nearest ancestor that scrolls vertically (falls back to the document).
export function findScrollParent(node) {
  if (typeof window === "undefined") return null;
  let el = node?.parentElement ?? null;
  while (el && el !== document.body && el !== document.documentElement) {
    const style = getComputedStyle(el);
    if (/(auto|scroll|overlay)/.test(style.overflowY) && el.scrollHeight > el.clientHeight) return el;
    el = el.parentElement;
  }
  return document.scrollingElement || document.documentElement;
}

// Legacy helpers (still exported for compatibility with existing imports/tests).
export function isScrolledPast(entry) {
  if (!entry || entry.isIntersecting) return false;
  const rect = entry.boundingClientRect;
  if (!rect || (rect.width === 0 && rect.height === 0)) return false;
  const bottom = entry.rootBounds?.bottom ?? (typeof window !== "undefined" ? window.innerHeight : Infinity);
  return rect.top < bottom;
}

export function reserveFor(expandedHeight, currentHeight) {
  const diff = Number(expandedHeight) - Number(currentHeight);
  return Number.isFinite(diff) && diff > 0 ? Math.round(diff) : 0;
}
