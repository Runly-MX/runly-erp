// Drag an item (a task, an event) onto a drop cell marked with `targetAttr` (its value is
// the drop key, read as a number when numeric). Touch: hold ~350 ms to lift it (a short
// vibration confirms), so a normal swipe still scrolls. Mouse: drag past 4 px.
// Returns the pointer handler for draggable chips, the live drag (for a ghost and the
// drop highlight) and wasDrag() so the click that ends a drag does not also open the item.
import { useCallback, useEffect, useRef, useState } from "react";

const HOLD_MS = 350;
const TOUCH_SLOP = 8;

function targetUnder(x, y, attr) {
  const value = document.elementFromPoint(x, y)?.closest?.(`[${attr}]`)?.getAttribute(attr);
  if (value == null) return null;
  return /^-?\d+$/.test(value) ? Number(value) : value;
}

export function useDayDrag({ onDrop, disabled = false, targetAttr = "data-drop-day" }) {
  const [drag, setDrag] = useState(null); // { item, from, x, y, over }
  const lastDragAt = useRef(0);
  const cleanupRef = useRef(null);

  useEffect(() => () => cleanupRef.current?.(), []);

  const onPointerDown = useCallback((event, item, from) => {
    if (disabled || (event.pointerType === "mouse" && event.button !== 0)) return;
    const touch = event.pointerType !== "mouse";
    const start = { x: event.clientX, y: event.clientY };
    let armed = false;
    let timer = null;

    const show = (x, y) => setDrag({ item, from, x, y, over: targetUnder(x, y, targetAttr) });
    const arm = (x, y) => {
      armed = true;
      navigator.vibrate?.(12);
      show(x, y);
    };
    // Once lifted, the finger moves the item instead of scrolling the page.
    const blockScroll = (e) => { if (armed && e.cancelable) e.preventDefault(); };
    const move = (e) => {
      if (armed) { show(e.clientX, e.clientY); return; }
      const distance = Math.hypot(e.clientX - start.x, e.clientY - start.y);
      if (touch && distance > TOUCH_SLOP) cleanup();
      else if (!touch && distance > 4) arm(e.clientX, e.clientY);
    };
    const up = (e) => {
      const wasArmed = armed;
      cleanup();
      if (!wasArmed) return;
      lastDragAt.current = Date.now();
      const target = targetUnder(e.clientX, e.clientY, targetAttr);
      if (target != null && e.type === "pointerup") onDrop(item, from, target);
    };
    function cleanup() {
      clearTimeout(timer);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("touchmove", blockScroll);
      cleanupRef.current = null;
      setDrag(null);
    }

    cleanupRef.current?.();
    cleanupRef.current = cleanup;
    if (touch) timer = setTimeout(() => arm(start.x, start.y), HOLD_MS);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("touchmove", blockScroll, { passive: false });
  }, [disabled, onDrop, targetAttr]);

  const wasDrag = useCallback(() => Date.now() - lastDragAt.current < 400, []);

  return { drag, onPointerDown, wasDrag };
}
