// Pan and zoom of the automation canvas for mouse, trackpad, pen and touch.
// - One pointer on the background pans (a small threshold keeps taps as taps).
// - Two pointers pinch-zoom around their midpoint.
// - Wheel pans; Ctrl/Cmd + wheel (or a trackpad pinch) zooms around the cursor.
// - Anything marked [data-no-pan] (nodes, buttons, panels) never starts a pan.
// The page keeps scrolling normally outside the canvas; inside it the browser's
// own touch scrolling is off (touch-action: none on the viewport).
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { clampScale, fitView, startView, zoomAt } from "../../../lib/canvasLayout";

const PAN_THRESHOLD = 4;

export function useCanvasView({ bounds, fitKey }) {
  const viewportRef = useRef(null);
  const [view, setViewState] = useState({ x: 0, y: 0, k: 1 });
  const [animate, setAnimate] = useState(false);
  const viewRef = useRef(view);
  const pointers = useRef(new Map());
  const gesture = useRef(null);

  const setView = useCallback((next, { animated = false } = {}) => {
    viewRef.current = next;
    setAnimate(animated);
    setViewState(next);
  }, []);

  const size = () => {
    const rect = viewportRef.current?.getBoundingClientRect();
    return { width: rect?.width ?? 800, height: rect?.height ?? 500 };
  };

  // "Ajustar": the whole flow at any size.
  const fit = useCallback((animated = true) => setView(fitView(bounds, size()), { animated }), [bounds, setView]);

  // Opening view; recomputed when the shape of the flow changes (blocks added/removed, orientation).
  useLayoutEffect(() => { setView(startView(bounds, size())); }, [fitKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const zoomBy = useCallback((factor) => {
    const { width, height } = size();
    setView(zoomAt(viewRef.current, viewRef.current.k * factor, { x: width / 2, y: height / 2 }), { animated: true });
  }, [setView]);

  const local = (event) => {
    const rect = viewportRef.current.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const onPointerDown = (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (event.target.closest?.("[data-no-pan]")) return;
    pointers.current.set(event.pointerId, local(event));
    if (pointers.current.size === 1) {
      gesture.current = { mode: "pending", start: local(event), origin: { ...viewRef.current }, moved: false };
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { mode: "pinch", distance: Math.hypot(a.x - b.x, a.y - b.y) || 1, origin: { ...viewRef.current }, midpoint: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
    }
  };

  const onPointerMove = (event) => {
    if (!pointers.current.has(event.pointerId) || !gesture.current) return;
    pointers.current.set(event.pointerId, local(event));
    const current = gesture.current;
    if (current.mode === "pinch" && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const zoomed = zoomAt(current.origin, current.origin.k * (distance / current.distance), current.midpoint);
      setView({ ...zoomed, x: zoomed.x + (midpoint.x - current.midpoint.x), y: zoomed.y + (midpoint.y - current.midpoint.y) });
      return;
    }
    const point = local(event);
    const dx = point.x - current.start.x;
    const dy = point.y - current.start.y;
    if (current.mode === "pending" && Math.hypot(dx, dy) > PAN_THRESHOLD) {
      current.mode = "pan";
      viewportRef.current.setPointerCapture?.(event.pointerId);
    }
    if (current.mode === "pan") setView({ ...current.origin, x: current.origin.x + dx, y: current.origin.y + dy });
  };

  const endPointer = (event) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size === 0) gesture.current = null;
    else if (pointers.current.size === 1 && gesture.current?.mode === "pinch") {
      const [rest] = [...pointers.current.values()];
      gesture.current = { mode: "pan", start: rest, origin: { ...viewRef.current }, moved: true };
    }
  };

  // When the canvas gets taller or shorter (the console opens), keep what was in the
  // middle in the middle instead of cropping it.
  useEffect(() => {
    const element = viewportRef.current;
    if (!element || typeof ResizeObserver === "undefined") return undefined;
    let height = element.clientHeight;
    const observer = new ResizeObserver(() => {
      const next = element.clientHeight;
      if (next !== height && height > 0) setView({ ...viewRef.current, y: viewRef.current.y + (next - height) / 2 });
      height = next;
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [setView]);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return undefined;
    const onWheel = (event) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      if (event.ctrlKey || event.metaKey) {
        const anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
        setView(zoomAt(viewRef.current, viewRef.current.k * Math.exp(-event.deltaY * 0.0025), anchor));
      } else {
        const swap = event.shiftKey && event.deltaX === 0;
        setView({ ...viewRef.current, x: viewRef.current.x - (swap ? event.deltaY : event.deltaX), y: viewRef.current.y - (swap ? 0 : event.deltaY) });
      }
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [setView]);

  // Pans (only if needed) so a block is fully visible inside the free part of the
  // viewport; `reserveRight` is the width an inspector is about to take.
  const reveal = useCallback((rect, reserveRight = 0) => {
    const { width, height } = size();
    const free = width - reserveRight;
    const current = viewRef.current;
    const left = rect.x * current.k + current.x;
    const right = left + rect.width * current.k;
    const top = rect.y * current.k + current.y;
    const bottom = top + rect.height * current.k;
    const margin = 32;
    if (left >= margin && right <= free - margin && top >= margin && bottom <= height - margin) return;
    setView({ ...current, x: free / 2 - (rect.x + rect.width / 2) * current.k, y: height / 2 - (rect.y + rect.height / 2) * current.k }, { animated: true });
  }, [setView]);

  return {
    reveal,
    view,
    animate,
    viewportRef,
    fit,
    zoomBy,
    setScale: (k) => setView({ ...viewRef.current, k: clampScale(k) }),
    bind: { onPointerDown, onPointerMove, onPointerUp: endPointer, onPointerCancel: endPointer },
  };
}
