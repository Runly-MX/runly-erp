import { useCallback, useEffect, useRef, useState } from "react";

export const PANE_MIN = 260;
export const PANE_MAX = 760;
export const PANE_DEFAULT = 320;
const KEY = "runly-files-preview-width";

const clamp = (w) => Math.max(PANE_MIN, Math.min(Math.min(PANE_MAX, Math.round(window.innerWidth * 0.5)), Math.round(w)));

// Width of a right-hand pane that the user drags by its LEFT edge (pointer + keyboard),
// remembered per browser. Double-click the handle to restore the default.
export function usePaneWidth() {
  const [width, setWidth] = useState(() => {
    try {
      const saved = Number(localStorage.getItem(KEY));
      return Number.isFinite(saved) && saved > 0 ? clamp(saved) : PANE_DEFAULT;
    } catch {
      return PANE_DEFAULT;
    }
  });
  const drag = useRef(null);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, String(width));
    } catch {
      /* storage blocked */
    }
  }, [width]);
  const onPointerDown = useCallback(
    (e) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { x: e.clientX, w: width };
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";
    },
    [width],
  );
  const onPointerMove = useCallback((e) => {
    if (drag.current) setWidth(clamp(drag.current.w - (e.clientX - drag.current.x)));
  }, []);
  const end = useCallback(() => {
    drag.current = null;
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
  }, []);
  const onKeyDown = useCallback((e) => {
    const step = e.shiftKey ? 48 : 16;
    if (e.key === "ArrowLeft") setWidth((w) => clamp(w + step));
    else if (e.key === "ArrowRight") setWidth((w) => clamp(w - step));
    else if (e.key === "Enter") setWidth(PANE_DEFAULT);
    else return;
    e.preventDefault();
  }, []);
  return {
    width,
    handleProps: {
      role: "separator",
      "aria-orientation": "vertical",
      "aria-label": "Cambiar el ancho de la vista previa",
      "aria-valuenow": width,
      "aria-valuemin": PANE_MIN,
      "aria-valuemax": PANE_MAX,
      tabIndex: 0,
      title: "Arrastra para cambiar el ancho; doble clic para restablecer",
      onPointerDown,
      onPointerMove,
      onPointerUp: end,
      onPointerCancel: end,
      onKeyDown,
      onDoubleClick: () => setWidth(PANE_DEFAULT),
    },
  };
}
