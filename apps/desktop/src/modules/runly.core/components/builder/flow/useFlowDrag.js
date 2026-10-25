// Pointer-based reordering for the visual automation editor. Works with mouse,
// pen and touch (the grip handle sets touch-action: none, so the page still
// scrolls from anywhere else). Escape cancels. The hook only reports where the
// pointer is; the caller decides whether a drop is valid and applies it.
import { useCallback, useEffect, useRef, useState } from "react";

export function useFlowDrag({ itemRefs, count, canDrop, onDrop }) {
  const [drag, setDrag] = useState(null); // { from, over, valid }
  const active = useRef(null);

  const overAt = useCallback((y) => {
    let over = 0;
    for (let index = 0; index < count; index += 1) {
      const element = itemRefs.current[index];
      if (!element) continue;
      const rect = element.getBoundingClientRect();
      if (y >= rect.top) over = index;
      if (y <= rect.bottom) break;
    }
    return over;
  }, [count, itemRefs]);

  const finish = useCallback((commit) => {
    const current = active.current;
    active.current = null;
    setDrag(null);
    if (commit && current && current.over !== current.from && canDrop(current.from, current.over)) onDrop(current.from, current.over);
  }, [canDrop, onDrop]);

  useEffect(() => {
    if (!drag) return undefined;
    const onKey = (event) => { if (event.key === "Escape") finish(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drag, finish]);

  const handleProps = (index) => ({
    style: { touchAction: "none" },
    onPointerDown: (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      active.current = { from: index, over: index };
      setDrag({ from: index, over: index, valid: false });
    },
    onPointerMove: (event) => {
      if (!active.current) return;
      const over = overAt(event.clientY);
      if (over === active.current.over) return;
      active.current.over = over;
      setDrag({ from: active.current.from, over, valid: over !== active.current.from && canDrop(active.current.from, over) });
    },
    onPointerUp: () => finish(true),
    onPointerCancel: () => finish(false),
    onLostPointerCapture: () => { if (active.current) finish(false); },
  });

  return { drag, handleProps };
}
