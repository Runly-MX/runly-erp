import { useCallback, useEffect, useRef, useState } from "react";

// Google Photos style density control for a tile grid: the column count changes
// with a two-finger pinch (touch), Ctrl+wheel / trackpad pinch (desktop) or the
// +/- buttons. Fewer columns = bigger tiles. The value is persisted through
// `read` / `write` (the gallery's localStorage helpers).

const isPhone = () => typeof window !== "undefined" && window.innerWidth < 640;

export function gridZoomBounds() {
  return isPhone() ? { min: 1, max: 7 } : { min: 2, max: 12 };
}

export function defaultGridColumns() {
  if (typeof window === "undefined") return 4;
  const w = window.innerWidth;
  if (w < 640) return 3;
  if (w < 1024) return 4;
  if (w < 1536) return 6;
  return 8;
}

const clamp = (n) => {
  const { min, max } = gridZoomBounds();
  return Math.min(max, Math.max(min, Math.round(n)));
};

export function useGridZoom({ enabled = true, initial, onPersist }) {
  const [columns, setColumnsState] = useState(() => clamp(Number(initial) || defaultGridColumns()));
  const columnsRef = useRef(columns);
  columnsRef.current = columns;

  const setColumns = useCallback((next) => {
    const value = clamp(typeof next === "function" ? next(columnsRef.current) : next);
    if (value === columnsRef.current) return;
    columnsRef.current = value;
    setColumnsState(value);
    onPersist?.(value);
  }, [onPersist]);

  // Pinch: two touch pointers. Spreading fingers (distance grows) zooms in = fewer columns.
  const pointers = useRef(new Map());
  const pinch = useRef(null);
  const justPinched = useRef(false);

  const handlers = {
    onPointerDownCapture: (e) => {
      if (!enabled || e.pointerType === "mouse") return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.current.size === 2) {
        const [a, b] = [...pointers.current.values()];
        pinch.current = { distance: Math.hypot(a.x - b.x, a.y - b.y) || 1, columns: columnsRef.current };
        justPinched.current = true;
      }
    },
    onPointerMoveCapture: (e) => {
      if (!pointers.current.has(e.pointerId)) return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (!pinch.current || pointers.current.size < 2) return;
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      setColumns(pinch.current.columns * (pinch.current.distance / distance));
    },
    onPointerUpCapture: (e) => release(e),
    onPointerCancelCapture: (e) => release(e),
    // A pinch must never end as a tap that opens a tile.
    onClickCapture: (e) => {
      if (justPinched.current && pointers.current.size === 0) {
        justPinched.current = false;
        e.stopPropagation();
        e.preventDefault();
      }
    },
  };

  function release(e) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0 && justPinched.current) setTimeout(() => { justPinched.current = false; }, 80);
  }

  // Ctrl+wheel (also what a trackpad pinch emits): non-passive so the page does not zoom.
  const wheelAcc = useRef(0);
  const [node, setNode] = useState(null);
  useEffect(() => {
    if (!enabled || !node) return undefined;
    const onWheel = (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      wheelAcc.current += e.deltaY;
      if (Math.abs(wheelAcc.current) < 40) return;
      const step = wheelAcc.current > 0 ? 1 : -1; // wheel down / pinch in = more columns
      wheelAcc.current = 0;
      setColumns((n) => n + step);
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [enabled, node, setColumns]);

  const { min, max } = gridZoomBounds();
  return {
    columns,
    setColumns,
    canZoomIn: columns > min,
    canZoomOut: columns < max,
    zoomIn: () => setColumns((n) => n - 1),
    zoomOut: () => setColumns((n) => n + 1),
    containerProps: { ref: setNode, ...(enabled ? handlers : {}) },
  };
}
