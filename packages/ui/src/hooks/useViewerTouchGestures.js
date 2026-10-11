import { useEffect, useRef } from "react";

const LONG_PRESS_MS = 480;
const MOVE_TOLERANCE = 9;
const DOUBLE_TAP_MS = 280;
const SWIPE_COMMIT_RATIO = 0.22;
const SWIPE_COMMIT_VELOCITY = 0.5; // px/ms
const CLOSE_COMMIT_PX = 120;
const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

function point(t) {
  return { x: t.clientX, y: t.clientY };
}
function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

// Touch gestures for a full-screen media viewer (Photos-app style):
//  - long press            -> onLongPress (actions sheet), with a haptic tick
//  - horizontal swipe       -> previous/next file, the content follows the finger
//  - swipe down             -> close, the content follows and fades
//  - single tap             -> onTap (toggle the chrome)
//  - zoomable content: pinch-zoom, one-finger pan when zoomed, double tap 1x/2x
// Raw Touch Events (non-passive): iOS multi-touch Pointer Events are not
// reliable enough for pinch. `slideRef` is the element moved by swipes.
export function useViewerTouchGestures({
  surfaceRef,
  slideRef,
  enabled,
  zoomable = false,
  live, // ref: { zoom, pan, clampPan }
  setZoom,
  setPan,
  setPinching,
  setDragging,
  canPrev = false,
  canNext = false,
  onNavigate,
  onClose,
  onLongPress,
  onTap,
  minZoom = 0.25,
  maxZoom = 4,
  onDoubleTapZoom,
  deps = [],
}) {
  const cb = useRef({});
  cb.current = { canPrev, canNext, onNavigate, onClose, onLongPress, onTap, onDoubleTapZoom };

  useEffect(() => {
    const el = surfaceRef.current;
    if (!el || !enabled) return undefined;

    let g = null; // single-finger gesture state
    let pinch = null;
    let longTimer = null;
    let tapTimer = null;
    let lastTap = 0;

    const slide = () => slideRef?.current ?? null;
    const width = () => el.clientWidth || window.innerWidth;
    const clampZoom = (z) => Math.min(maxZoom, Math.max(minZoom, z));
    const centerAbs = () => {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    };

    function paint(x, y, animate) {
      const node = slide();
      if (!node) return;
      node.style.transition = animate ? `transform 260ms ${EASE}, opacity 260ms ${EASE}` : "none";
      node.style.transform = x || y ? `translate3d(${x}px, ${y}px, 0)` : "";
      node.style.opacity = y > 0 ? String(Math.max(0.35, 1 - y / 600)) : "";
    }

    function cancelLong() {
      clearTimeout(longTimer);
      longTimer = null;
    }

    function haptic() {
      try { navigator.vibrate?.(10); } catch { /* not supported */ }
    }

    function slideIn(dir) {
      const node = slide();
      if (!node) return;
      node.style.transition = "none";
      node.style.transform = `translate3d(${dir * 56}px, 0, 0)`;
      node.style.opacity = "0";
      requestAnimationFrame(() => requestAnimationFrame(() => paint(0, 0, true)));
    }

    function onTouchStart(e) {
      clearTimeout(tapTimer);
      if (e.touches.length >= 2) {
        cancelLong();
        g = null;
        if (!zoomable) return;
        e.preventDefault();
        const p0 = point(e.touches[0]);
        const p1 = point(e.touches[1]);
        const c = centerAbs();
        const m = midpoint(p0, p1);
        pinch = {
          dist: distance(p0, p1) || 1,
          zoom: live.current.zoom,
          pan: live.current.pan,
          center: c,
          midRel: { x: m.x - c.x, y: m.y - c.y },
        };
        setPinching?.(true);
        setDragging?.(false);
        return;
      }
      // Buttons, links and media controls keep their own taps.
      if (e.target?.closest?.("button, a, input, textarea, select, audio, video, [role='button'], [data-viewer-no-gesture]")) {
        g = null;
        cancelLong();
        return;
      }
      const p = point(e.touches[0]);
      g = { start: p, t0: Date.now(), mode: null, last: p, samples: [{ ...p, t: performance.now() }], pan: live.current?.pan, long: false };
      cancelLong();
      longTimer = setTimeout(() => {
        if (!g || g.mode) return;
        g.long = true;
        haptic();
        cb.current.onLongPress?.(p);
      }, LONG_PRESS_MS);
    }

    function onTouchMove(e) {
      if (pinch && e.touches.length >= 2) {
        e.preventDefault();
        const p0 = point(e.touches[0]);
        const p1 = point(e.touches[1]);
        const nextZoom = clampZoom(pinch.zoom * (distance(p0, p1) / pinch.dist));
        const ratio = nextZoom / pinch.zoom;
        const m = midpoint(p0, p1);
        const m1 = { x: m.x - pinch.center.x, y: m.y - pinch.center.y };
        setZoom(nextZoom);
        setPan(live.current.clampPan({
          x: m1.x + ratio * (pinch.pan.x - pinch.midRel.x),
          y: m1.y + ratio * (pinch.pan.y - pinch.midRel.y),
        }));
        return;
      }
      if (!g || e.touches.length !== 1) return;
      const p = point(e.touches[0]);
      const dx = p.x - g.start.x;
      const dy = p.y - g.start.y;
      g.last = p;
      g.samples.push({ ...p, t: performance.now() });
      if (g.samples.length > 5) g.samples.shift();
      if (!g.mode) {
        if (Math.hypot(dx, dy) < MOVE_TOLERANCE) return;
        cancelLong();
        if (g.long) { g.mode = "none"; return; }
        if (zoomable && live.current.zoom > 1.01) g.mode = "pan";
        else if (Math.abs(dx) > Math.abs(dy) * 1.2) g.mode = "swipe-x";
        else if (dy > 0 && Math.abs(dy) > Math.abs(dx) * 1.2) g.mode = "swipe-down";
        else g.mode = "none";
      }
      if (g.mode === "pan") {
        e.preventDefault();
        setDragging?.(true);
        setPan(live.current.clampPan({ x: g.pan.x + dx, y: g.pan.y + dy }));
      } else if (g.mode === "swipe-x") {
        e.preventDefault();
        const blocked = (dx > 0 && !cb.current.canPrev) || (dx < 0 && !cb.current.canNext);
        paint(blocked ? dx * 0.25 : dx, 0, false);
      } else if (g.mode === "swipe-down") {
        e.preventDefault();
        paint(0, Math.max(0, dy), false);
      }
    }

    function velocity(gesture, axis) {
      const s = gesture.samples;
      if (s.length < 2) return 0;
      const a = s[0];
      const b = s[s.length - 1];
      return b.t > a.t ? (b[axis] - a[axis]) / (b.t - a.t) : 0;
    }

    function onTouchEnd(e) {
      cancelLong();
      if (pinch) {
        if (e.touches.length === 1) {
          pinch = null;
          setPinching?.(false);
          const p = point(e.touches[0]);
          g = { start: p, t0: Date.now(), mode: "pan", last: p, samples: [{ ...p, t: performance.now() }], pan: live.current.pan, long: false };
        } else if (e.touches.length === 0) {
          pinch = null;
          setPinching?.(false);
          setDragging?.(false);
        }
        return;
      }
      if (!g || e.touches.length > 0) return;
      const gesture = g;
      g = null;
      setDragging?.(false);
      const dx = gesture.last.x - gesture.start.x;
      const dy = gesture.last.y - gesture.start.y;

      if (gesture.mode === "swipe-x") {
        const v = velocity(gesture, "x");
        const dir = dx < 0 ? 1 : -1; // finger left -> next
        const allowed = dir > 0 ? cb.current.canNext : cb.current.canPrev;
        if (allowed && (Math.abs(dx) > width() * SWIPE_COMMIT_RATIO || Math.abs(v) > SWIPE_COMMIT_VELOCITY)) {
          paint(-dir * width(), 0, true);
          setTimeout(() => {
            cb.current.onNavigate?.(dir);
            slideIn(dir);
          }, 200);
        } else {
          paint(0, 0, true);
        }
        return;
      }
      if (gesture.mode === "swipe-down") {
        if (dy > CLOSE_COMMIT_PX || velocity(gesture, "y") > 0.6) {
          paint(0, el.clientHeight || window.innerHeight, true);
          setTimeout(() => cb.current.onClose?.(), 180);
        } else {
          paint(0, 0, true);
        }
        return;
      }
      if (gesture.mode || gesture.long) return;
      if (Date.now() - gesture.t0 > 350) return;

      // Tap / double tap.
      const now = Date.now();
      if (zoomable && now - lastTap < DOUBLE_TAP_MS) {
        lastTap = 0;
        e.preventDefault();
        cb.current.onDoubleTapZoom?.();
        const c = centerAbs();
        setZoom((z) => {
          if (z > 1.01) {
            setPan({ x: 0, y: 0 });
            return 1;
          }
          setPan(live.current.clampPan({ x: -(gesture.start.x - c.x) * 0.6, y: -(gesture.start.y - c.y) * 0.6 }));
          return 2;
        });
        return;
      }
      lastTap = now;
      if (zoomable) tapTimer = setTimeout(() => cb.current.onTap?.(), DOUBLE_TAP_MS);
      else cb.current.onTap?.();
    }

    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    return () => {
      cancelLong();
      clearTimeout(tapTimer);
      paint(0, 0, false);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [enabled, zoomable, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
}
