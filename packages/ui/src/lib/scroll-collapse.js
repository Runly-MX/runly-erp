// Pure helpers behind useScrollCollapse (collapsing sticky headers).

// Matches the header transition (duration-200) plus a little slack.
export const COLLAPSE_SETTLE_MS = 260;
// Pixels the content must scroll before the header collapses.
export const COLLAPSE_THRESHOLD_PX = 12;

// An IntersectionObserver entry of the sentinel says "scrolled past" when the
// sentinel is laid out, no longer visible and not below the viewport (a
// sentinel below the fold has not been scrolled past yet).
export function isScrolledPast(entry) {
  if (!entry || entry.isIntersecting) return false;
  const rect = entry.boundingClientRect;
  if (!rect || (rect.width === 0 && rect.height === 0)) return false;
  const bottom = entry.rootBounds?.bottom ?? (typeof window !== "undefined" ? window.innerHeight : Infinity);
  return rect.top < bottom;
}

// Extra space kept under a collapsed header so the scroll height never
// changes (no layout jump, no collapse/expand loop on short pages).
export function reserveFor(expandedHeight, currentHeight) {
  const diff = Number(expandedHeight) - Number(currentHeight);
  return Number.isFinite(diff) && diff > 0 ? Math.round(diff) : 0;
}
