import { useRef } from "react";
import { moveLayer, resizeLayerToPoint, rotateLayerToPoint } from "../lib/imageLayers.js";

const HIT = 44; // minimum touch target, in screen px
const DOT = 14;

// Image layers drawn over the edited picture, with a selection box (move, corner
// resize, rotate handle) when `interactive`. Rendered inside a wrapper that is
// `picture.w x picture.h` CSS px and scaled to the stage, so everything here is
// in picture pixels; `scale` (stage fit x view zoom) converts screen deltas and
// keeps the handles a constant screen size.
export function ImageLayerOverlay({ layers, selectedId, interactive, scale, picture, wrapRef, multiRef = null, onSelect, onChange }) {
  const dragRef = useRef(null);

  function toPicture(event) {
    const box = wrapRef.current.getBoundingClientRect();
    return [((event.clientX - box.left) * picture.w) / box.width, ((event.clientY - box.top) * picture.h) / box.height];
  }

  function begin(event, layer, mode) {
    if (!interactive || multiRef?.current) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    onSelect(layer.id);
    dragRef.current = { mode, id: layer.id, px: event.clientX, py: event.clientY, start: layer };
  }

  function drag(event) {
    const d = dragRef.current;
    if (!d) return;
    if (multiRef?.current) {
      dragRef.current = null;
      return;
    }
    let next;
    if (d.mode === "move") next = moveLayer(d.start, (event.clientX - d.px) / scale, (event.clientY - d.py) / scale, picture);
    else if (d.mode === "resize") next = resizeLayerToPoint(d.start, toPicture(event));
    else next = rotateLayerToPoint(d.start, toPicture(event));
    onChange(d.id, next);
  }

  function end(event) {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  const gesture = { onPointerMove: drag, onPointerUp: end, onPointerCancel: end };
  const hit = HIT / scale;
  const dot = DOT / scale;

  return (
    <>
      {layers.map((l) => {
        const selected = interactive && l.id === selectedId;
        return (
          <div
            key={l.id}
            onPointerDown={(e) => begin(e, l, "move")}
            {...gesture}
            className={interactive ? "cursor-move" : "pointer-events-none"}
            style={{
              position: "absolute",
              left: l.x - l.w / 2,
              top: l.y - l.h / 2,
              width: l.w,
              height: l.h,
              transform: `rotate(${l.rot}deg)`,
              touchAction: "none",
              outline: selected ? `${2 / scale}px solid hsl(var(--primary))` : "none",
            }}
          >
            <img
              src={l.src}
              alt=""
              draggable={false}
              className="pointer-events-none h-full w-full select-none"
              style={{ opacity: l.opacity, transform: l.flipX ? "scaleX(-1)" : undefined }}
            />
            {selected ? (
              <>
                {[
                  { k: "nw", pos: { left: 0, top: 0 } },
                  { k: "ne", pos: { left: l.w, top: 0 } },
                  { k: "sw", pos: { left: 0, top: l.h } },
                  { k: "se", pos: { left: l.w, top: l.h } },
                ].map(({ k, pos }) => (
                  <span
                    key={k}
                    onPointerDown={(e) => begin(e, l, "resize")}
                    {...gesture}
                    className="absolute flex items-center justify-center"
                    style={{ ...pos, width: hit, height: hit, transform: "translate(-50%, -50%)", touchAction: "none", cursor: "nwse-resize" }}
                  >
                    <span className="rounded-full border-2 border-[hsl(var(--primary))] bg-white shadow" style={{ width: dot, height: dot }} />
                  </span>
                ))}
                <span
                  onPointerDown={(e) => begin(e, l, "rotate")}
                  {...gesture}
                  className="absolute flex items-center justify-center"
                  style={{ left: l.w / 2, top: -hit * 0.9, width: hit, height: hit, transform: "translate(-50%, -50%)", touchAction: "none", cursor: "grab" }}
                >
                  <span className="rounded-full border-2 border-[hsl(var(--primary))] bg-[hsl(var(--primary))] shadow" style={{ width: dot, height: dot }} />
                </span>
              </>
            ) : null}
          </div>
        );
      })}
    </>
  );
}
