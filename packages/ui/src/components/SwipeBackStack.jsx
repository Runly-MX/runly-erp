import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { cn } from "../lib/utils.js";

const EDGE_PX = 28;            // touches starting this close to the left edge can swipe back
const COMMIT_RATIO = 0.35;     // released past 35% of the width -> go back
const COMMIT_VELOCITY = 0.45;  // ...or flicked faster than this (px/ms)
const PARALLAX = 0.28;         // the base layer starts this far to the left
const EASE = "cubic-bezier(0.32, 0.72, 0, 1)"; // iOS navigation curve
const DURATION_MS = 340;

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

// Phone navigation stack with an iOS-style interactive "back": the detail
// screen slides in from the right; dragging from the left edge pulls it
// away with the finger while the base screen comes back with a parallax and
// fades its scrim. Release past ~35% (or with a flick) completes the back,
// otherwise it springs back. `ref.back()` runs the same exit animation for
// a header back button. Pointer Events + transforms only.
export const SwipeBackStack = forwardRef(function SwipeBackStack(
  { open, onBack, base, detail, className, onThresholdCross = null },
  ref,
) {
  const rootRef = useRef(null);
  const detailRef = useRef(null);
  const baseRef = useRef(null);
  const scrimRef = useRef(null);
  const drag = useRef(null);
  const crossed = useRef(false);
  const [phase, setPhase] = useState(open ? "idle" : "closed"); // closed | entering | idle | dragging | leaving
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  const width = () => rootRef.current?.clientWidth || window.innerWidth;

  // Paint a frame: detail at x px, base parallax + scrim follow progress.
  const paint = useCallback((x, animate) => {
    const w = width();
    const progress = Math.min(1, Math.max(0, x / w));
    const duration = prefersReducedMotion() ? 120 : DURATION_MS;
    const transition = animate ? `transform ${duration}ms ${EASE}` : "none";
    if (detailRef.current) {
      detailRef.current.style.transition = transition;
      detailRef.current.style.transform = `translate3d(${x}px, 0, 0)`;
    }
    if (baseRef.current) {
      baseRef.current.style.transition = transition;
      baseRef.current.style.transform = `translate3d(${-w * PARALLAX * (1 - progress)}px, 0, 0)`;
    }
    if (scrimRef.current) {
      scrimRef.current.style.transition = animate ? `opacity ${duration}ms ${EASE}` : "none";
      scrimRef.current.style.opacity = String(0.28 * (1 - progress));
    }
  }, []);

  const finishLeave = useCallback(() => {
    setPhase("closed");
    onBackRef.current?.();
  }, []);

  const animateTo = useCallback((x, done) => {
    paint(x, true);
    const node = detailRef.current;
    if (!node) { done?.(); return; }
    let finished = false;
    const end = () => {
      if (finished) return;
      finished = true;
      node.removeEventListener("transitionend", end);
      done?.();
    };
    node.addEventListener("transitionend", end);
    setTimeout(end, (prefersReducedMotion() ? 120 : DURATION_MS) + 80);
  }, [paint]);

  useImperativeHandle(ref, () => ({
    back() {
      if (phase === "closed") { onBackRef.current?.(); return; }
      setPhase("leaving");
      animateTo(width(), finishLeave);
    },
  }), [phase, animateTo, finishLeave]);

  // open: slide the detail in from the right. closed from outside (route
  // change without our animation): just drop it.
  useLayoutEffect(() => {
    if (open && (phase === "closed" || phase === "leaving")) {
      setPhase("entering");
      paint(width(), false);
      requestAnimationFrame(() => requestAnimationFrame(() => animateTo(0, () => setPhase("idle"))));
    } else if (!open && phase !== "closed" && phase !== "leaving") {
      setPhase("closed");
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Safari reserves edge touches for browser history; keep them for us.
  // Never for a touch that starts on a control: preventDefault on touchstart
  // also cancels the click, and the header back arrow lives right on that
  // left edge — taps on it were silently swallowed.
  useEffect(() => {
    const node = detailRef.current;
    if (!node || phase === "closed") return undefined;
    function contain(event) {
      if (event.touches.length !== 1) return;
      if (event.target?.closest?.('button, a, input, textarea, select, [role="button"], [data-swipe-ignore]')) return;
      const x = event.touches[0].clientX;
      if (x < EDGE_PX || x > window.innerWidth - 20) event.preventDefault();
    }
    node.addEventListener("touchstart", contain, { passive: false });
    return () => node.removeEventListener("touchstart", contain);
  }, [phase]);

  // Capture phase: an edge touch belongs to "back", not to whatever sits
  // under the finger (e.g. swipe-to-reply on a message bubble).
  function onPointerDownCapture(event) {
    if (event.pointerType !== "touch" || phase !== "idle") return;
    const left = rootRef.current?.getBoundingClientRect().left ?? 0;
    if (event.clientX - left > EDGE_PX) return;
    event.stopPropagation();
    drag.current = { id: event.pointerId, x0: event.clientX, y0: event.clientY, x: 0, samples: [], engaged: false };
    crossed.current = false;
  }

  function onPointerMove(event) {
    const d = drag.current;
    if (!d || d.id !== event.pointerId) return;
    const dx = event.clientX - d.x0;
    const dy = event.clientY - d.y0;
    if (!d.engaged) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      if (dx <= 0 || Math.abs(dx) < Math.abs(dy) * 1.2) { drag.current = null; return; }
      d.engaged = true;
      try { detailRef.current?.setPointerCapture?.(event.pointerId); } catch { /* noop */ }
      setPhase("dragging");
    }
    d.x = Math.max(0, dx);
    d.samples.push({ x: d.x, t: performance.now() });
    if (d.samples.length > 5) d.samples.shift();
    const past = d.x > width() * COMMIT_RATIO;
    if (past !== crossed.current) {
      crossed.current = past;
      if (past) onThresholdCross?.();
    }
    paint(d.x, false);
  }

  function onPointerUp(event) {
    const d = drag.current;
    drag.current = null;
    if (!d?.engaged) return;
    try { detailRef.current?.releasePointerCapture?.(event.pointerId); } catch { /* noop */ }
    const first = d.samples[0];
    const last = d.samples[d.samples.length - 1];
    const velocity = first && last && last.t > first.t ? (last.x - first.x) / (last.t - first.t) : 0;
    if (d.x > width() * COMMIT_RATIO || velocity > COMMIT_VELOCITY) {
      setPhase("leaving");
      animateTo(width(), finishLeave);
    } else {
      animateTo(0, () => setPhase("idle"));
    }
  }

  const showBase = phase !== "idle";
  const showDetail = phase !== "closed";

  return (
    <div ref={rootRef} className={cn("relative h-full min-h-0 w-full overflow-hidden", className)}>
      <div
        ref={baseRef}
        className="absolute inset-0 flex min-h-0 flex-col"
        style={{ visibility: showBase || !showDetail ? "visible" : "hidden" }}
        aria-hidden={showDetail && !showBase ? true : undefined}
      >
        {base}
        {showDetail && <div ref={scrimRef} className="pointer-events-none absolute inset-0 bg-black" style={{ opacity: 0.28 }} aria-hidden />}
      </div>
      {showDetail && (
        <div
          ref={detailRef}
          className="absolute inset-0 flex min-h-0 flex-col bg-[hsl(var(--background))] shadow-[-12px_0_32px_-12px_rgba(0,0,0,0.35)]"
          style={{ touchAction: "pan-y" }}
          onPointerDownCapture={onPointerDownCapture}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {detail}
        </div>
      )}
    </div>
  );
});
