import { useRef } from "react";
import { moveRect, resizeRect } from "../lib/cropRect.js";

const HANDLES = [
  { id: "nw", hx: -1, hy: -1, pos: "left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize" },
  { id: "n", hx: 0, hy: -1, pos: "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize", edge: true },
  { id: "ne", hx: 1, hy: -1, pos: "right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize" },
  { id: "e", hx: 1, hy: 0, pos: "right-0 top-1/2 translate-x-1/2 -translate-y-1/2 cursor-ew-resize", edge: true },
  { id: "se", hx: 1, hy: 1, pos: "right-0 bottom-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize" },
  { id: "s", hx: 0, hy: 1, pos: "left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-ns-resize", edge: true },
  { id: "sw", hx: -1, hy: 1, pos: "left-0 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize" },
  { id: "w", hx: -1, hy: 0, pos: "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize", edge: true },
];

// Draggable crop rectangle drawn over the stage picture (display-pixel space).
// With `ratio` set, edge handles are hidden and corners keep the proportion.
// `scale` is the stage view zoom (pointer deltas are divided by it); `multiRef`
// (from useStageGestures) pauses dragging while two fingers are down.
export function ImageCropOverlay({ rect, bounds, ratio = null, scale = 1, multiRef = null, disabled = false, onChange }) {
  const dragRef = useRef(null);

  function begin(event, handle) {
    if (disabled || multiRef?.current) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { handle, px: event.clientX, py: event.clientY, start: rect };
  }

  function drag(event) {
    const d = dragRef.current;
    if (!d) return;
    if (multiRef?.current) {
      dragRef.current = null;
      return;
    }
    const dx = (event.clientX - d.px) / scale;
    const dy = (event.clientY - d.py) / scale;
    onChange(d.handle ? resizeRect(d.start, d.handle.hx, d.handle.hy, dx, dy, bounds, ratio) : moveRect(d.start, dx, dy, bounds));
  }

  function end(event) {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  const gesture = { onPointerMove: drag, onPointerUp: end, onPointerCancel: end };

  return (
    <div
      className="absolute cursor-move border border-white"
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)", touchAction: "none" }}
      onPointerDown={(e) => begin(e, null)}
      {...gesture}
    >
      <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="border border-white/25" />
        ))}
      </div>
      {HANDLES.filter((h) => !(ratio && h.edge)).map((h) => (
        <span
          key={h.id}
          onPointerDown={(e) => begin(e, h)}
          {...gesture}
          className={`absolute flex h-9 w-9 items-center justify-center ${h.pos}`}
          style={{ touchAction: "none", scale: 1 / scale }}
        >
          <span className="h-3.5 w-3.5 rounded-sm border border-black/40 bg-white shadow" />
        </span>
      ))}
    </div>
  );
}
