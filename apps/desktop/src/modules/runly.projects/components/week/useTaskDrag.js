// Drag a task chip onto a day cell ([data-week-day]). Touch: hold ~350 ms to lift it
// (a short vibration confirms), so a normal swipe still scrolls. Mouse: drag past 4 px.
// Returns the pointer handler for chips, the live drag (for the ghost and the drop
// highlight) and wasDrag() so the click that ends a drag does not also open the task.
import { useCallback, useEffect, useRef, useState } from "react";

const HOLD_MS = 350;
const TOUCH_SLOP = 8;

function dayUnder(x, y) {
  const value = document.elementFromPoint(x, y)?.closest?.("[data-week-day]")?.getAttribute("data-week-day");
  return value == null ? null : Number(value);
}

export function useTaskDrag({ onDrop, disabled = false }) {
  const [drag, setDrag] = useState(null); // { task, fromDay, x, y, overDay }
  const lastDragAt = useRef(0);
  const cleanupRef = useRef(null);

  useEffect(() => () => cleanupRef.current?.(), []);

  const onPointerDown = useCallback((event, task, fromDay) => {
    if (disabled || (event.pointerType === "mouse" && event.button !== 0)) return;
    const touch = event.pointerType !== "mouse";
    const start = { x: event.clientX, y: event.clientY };
    let armed = false;
    let timer = null;

    const show = (x, y) => setDrag({ task, fromDay, x, y, overDay: dayUnder(x, y) });
    const arm = (x, y) => {
      armed = true;
      navigator.vibrate?.(12);
      show(x, y);
    };
    // Once lifted, the finger moves the chip instead of scrolling the page.
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
      const target = dayUnder(e.clientX, e.clientY);
      if (target != null && e.type === "pointerup") onDrop(task, fromDay, target);
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
  }, [disabled, onDrop]);

  const wasDrag = useCallback(() => Date.now() - lastDragAt.current < 400, []);

  return { drag, onPointerDown, wasDrag };
}
