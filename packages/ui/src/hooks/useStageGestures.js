import { useEffect, useRef } from "react";

// Wheel / trackpad-pinch zoom and two-pointer pinch + pan for an image stage.
// `el` is the stage DOM node (pass it through state so the hook re-binds when
// it mounts). Listeners are passive-free on wheel and capture-phase on pointers,
// so child tools (crop handles, drawing) keep their own single-pointer logic:
// they only need to bail out while `multiRef.current` is true (two or more
// fingers down, until all are lifted).
//
//   onZoom(factor, clientX, clientY)  factor > 1 = zoom in
//   onPan(dxClient, dyClient)         two-pointer drag
export function useStageGestures(el, { enabled = true, onZoom, onPan } = {}) {
  const multiRef = useRef(false);
  const handlers = useRef({});
  handlers.current = { onZoom, onPan };

  useEffect(() => {
    if (!el || !enabled) return undefined;
    const points = new Map();
    let last = null;

    const metrics = () => {
      const [a, b] = [...points.values()];
      return { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
    };
    const down = (e) => {
      points.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (points.size === 2) {
        multiRef.current = true;
        last = metrics();
      }
    };
    const move = (e) => {
      if (!points.has(e.pointerId)) return;
      points.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (points.size !== 2 || !last) return;
      const m = metrics();
      if (last.d > 0 && m.d > 0) handlers.current.onZoom?.(m.d / last.d, m.cx, m.cy);
      handlers.current.onPan?.(m.cx - last.cx, m.cy - last.cy);
      last = m;
    };
    const up = (e) => {
      points.delete(e.pointerId);
      if (points.size < 2) last = null;
      if (points.size === 0) multiRef.current = false;
    };
    const wheel = (e) => {
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : 1;
      const speed = e.ctrlKey ? 0.01 : 0.0015; // ctrl+wheel = trackpad pinch
      handlers.current.onZoom?.(Math.exp(-e.deltaY * unit * speed), e.clientX, e.clientY);
    };

    el.addEventListener("pointerdown", down, true);
    el.addEventListener("pointermove", move, true);
    el.addEventListener("pointerup", up, true);
    el.addEventListener("pointercancel", up, true);
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      el.removeEventListener("pointerdown", down, true);
      el.removeEventListener("pointermove", move, true);
      el.removeEventListener("pointerup", up, true);
      el.removeEventListener("pointercancel", up, true);
      el.removeEventListener("wheel", wheel);
      multiRef.current = false;
    };
  }, [el, enabled]);

  return { multiRef };
}
