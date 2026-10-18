import { useCallback, useEffect, useRef, useState } from "react";
import { COLLAPSE_SETTLE_MS, findScrollParent, nextCollapsed } from "../lib/scroll-collapse.js";

// Collapsing-header state from the scroll position of the sentinel's scroll
// container (works for the window and for any scrollable pane).
//
//   const { sentinelRef, targetRef, collapsed } = useScrollCollapse()
//   <div ref={sentinelRef} />           // in the scroll flow, before the header
//   <header ref={targetRef} className="sticky top-0" />
//
// Collapses after scrolling COLLAPSE_AT_PX and expands again only near the top
// (hysteresis), and never on pages too short to scroll comfortably once
// collapsed, so it cannot loop. The sentinel takes no space.
// `reserve` is accepted for compatibility and ignored: the header no longer
// changes margins while scrolling (that moved content under the finger on iOS).
export function useScrollCollapse({ enabled = true } = {}) {
  const [collapsed, setCollapsed] = useState(false);
  const [sentinel, setSentinel] = useState(null);
  const [target, setTarget] = useState(null);
  const collapsedRef = useRef(false);
  const expandedHeight = useRef(0);
  const lockedUntil = useRef(0);

  const sentinelRef = useCallback((node) => setSentinel(node), []);
  const targetRef = useCallback((node) => setTarget(node), []);

  useEffect(() => {
    if (!enabled || !sentinel || typeof window === "undefined") return undefined;
    sentinel.style.height = "0px";
    const scroller = findScrollParent(sentinel);
    const source = scroller === document.scrollingElement || scroller === document.documentElement ? window : scroller;
    let frame = 0;

    const evaluate = () => {
      frame = 0;
      if (!scroller) return;
      const headerHeight = target ? target.getBoundingClientRect().height : 0;
      if (!collapsedRef.current && headerHeight) expandedHeight.current = headerHeight;
      // While the collapse/expand transition runs, ignore the layout it causes.
      if (Date.now() < lockedUntil.current) return;
      const next = nextCollapsed(collapsedRef.current, {
        scrollTop: scroller.scrollTop,
        scrollRange: scroller.scrollHeight - scroller.clientHeight,
        headerDelta: collapsedRef.current ? 0 : expandedHeight.current * 0.5,
      });
      if (next === collapsedRef.current) return;
      collapsedRef.current = next;
      lockedUntil.current = Date.now() + COLLAPSE_SETTLE_MS;
      setCollapsed(next);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(evaluate); };

    source.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    evaluate();
    return () => {
      source.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [enabled, sentinel, target]);

  return { sentinelRef, targetRef, collapsed: enabled && collapsed };
}
