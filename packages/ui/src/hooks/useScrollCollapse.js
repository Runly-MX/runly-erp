import { useCallback, useEffect, useRef, useState } from "react";
import {
  COLLAPSE_SETTLE_MS,
  COLLAPSE_THRESHOLD_PX,
  isScrolledPast,
  reserveFor,
} from "../lib/scroll-collapse.js";

// Collapsing-header state from an IntersectionObserver sentinel (no scroll
// listeners, works in any scroll container: ancestors clip the intersection).
//
//   const { sentinelRef, targetRef, collapsed } = useScrollCollapse()
//   <div ref={sentinelRef} />           // in the scroll flow, before the header
//   <header ref={targetRef} className="sticky top-0" />
//
// The sentinel is `threshold` px tall with a negative bottom margin (and it
// cancels its parent's flex/grid gap), so it never moves the layout.
// `reserve`: while collapsed, the header's bottom margin grows by the height
// it lost, so the scroll height stays the same (no jump, no flicker loop).
// Only meaningful when the header is sticky inside the same scroll flow.
export function useScrollCollapse({
  enabled = true,
  threshold = COLLAPSE_THRESHOLD_PX,
  reserve = false,
} = {}) {
  const [collapsed, setCollapsed] = useState(false);
  const [sentinel, setSentinel] = useState(null);
  const [target, setTarget] = useState(null);
  const collapsedRef = useRef(false);
  const expandedHeight = useRef(0);
  const settleAt = useRef(0);
  const applyRef = useRef(null);

  const sentinelRef = useCallback((node) => setSentinel(node), []);
  const targetRef = useCallback((node) => setTarget(node), []);

  useEffect(() => {
    if (!enabled || !sentinel || typeof IntersectionObserver === "undefined") return undefined;
    const parent = sentinel.parentElement;
    const display = parent ? getComputedStyle(parent).display : "";
    const gap = /flex|grid/.test(display) ? parseFloat(getComputedStyle(parent).rowGap) || 0 : 0;
    sentinel.style.height = `${threshold}px`;
    sentinel.style.marginBottom = `${-(threshold + gap)}px`;
    const observer = new IntersectionObserver(([entry]) => {
      const next = isScrolledPast(entry);
      if (next === collapsedRef.current) return;
      collapsedRef.current = next;
      settleAt.current = Date.now() + COLLAPSE_SETTLE_MS;
      setCollapsed(next);
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [enabled, sentinel, threshold]);

  useEffect(() => {
    if (!enabled || !reserve || !target || typeof ResizeObserver === "undefined") return undefined;
    const apply = () => {
      const height = target.getBoundingClientRect().height;
      if (!collapsedRef.current && Date.now() >= settleAt.current) expandedHeight.current = height;
      const extra = reserveFor(expandedHeight.current, height);
      target.style.marginBottom = "";
      if (extra > 0) {
        const base = parseFloat(getComputedStyle(target).marginBottom) || 0;
        target.style.marginBottom = `${base + extra}px`;
      }
    };
    applyRef.current = apply;
    const observer = new ResizeObserver(apply);
    observer.observe(target);
    return () => {
      observer.disconnect();
      applyRef.current = null;
      target.style.marginBottom = "";
    };
  }, [enabled, reserve, target]);

  // Re-check once the transition settles (the size may not change again).
  useEffect(() => {
    const timer = setTimeout(() => applyRef.current?.(), COLLAPSE_SETTLE_MS + 20);
    return () => clearTimeout(timer);
  }, [collapsed]);

  return { sentinelRef, targetRef, collapsed: enabled && collapsed };
}
