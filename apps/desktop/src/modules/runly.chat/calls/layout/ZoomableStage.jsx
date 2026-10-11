import { useCallback, useEffect, useRef, useState } from "react";
import { ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import { cn } from "@runly/ui";

const MIN = 1;
const MAX = 4;
const DOUBLE_TAP_MS = 280;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// Pinch-zoom + pan for a shared screen: two fingers zoom around their
// midpoint, one finger pans while zoomed, double tap toggles 1x/2.5x,
// Ctrl/⌘ + wheel zooms on desktop. Only transform is animated.
export function ZoomableStage({ children, className = "", showControls = true }) {
  const boxRef = useRef(null);
  const pointers = useRef(new Map());
  const gesture = useRef(null);
  const lastTap = useRef(0);
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const zoomed = view.scale > 1.01;

  const clampPan = useCallback((scale, x, y) => {
    const box = boxRef.current?.getBoundingClientRect();
    if (!box) return { x, y };
    const maxX = ((scale - 1) * box.width) / 2;
    const maxY = ((scale - 1) * box.height) / 2;
    return { x: clamp(x, -maxX, maxX), y: clamp(y, -maxY, maxY) };
  }, []);

  // Zoom keeping the point (cx, cy) — relative to the box center — still.
  const zoomAround = useCallback((nextScale, cx, cy) => {
    setView((current) => {
      const scale = clamp(nextScale, MIN, MAX);
      const ratio = scale / current.scale;
      const x = cx - (cx - current.x) * ratio;
      const y = cy - (cy - current.y) * ratio;
      return { scale, ...clampPan(scale, x, y) };
    });
  }, [clampPan]);

  const reset = useCallback(() => setView({ scale: 1, x: 0, y: 0 }), []);

  function center(event) {
    const box = boxRef.current.getBoundingClientRect();
    return { cx: event.clientX - box.left - box.width / 2, cy: event.clientY - box.top - box.height / 2 };
  }

  function onPointerDown(event) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 1) {
      const now = Date.now();
      if (event.pointerType !== "mouse" && now - lastTap.current < DOUBLE_TAP_MS) {
        const { cx, cy } = center(event);
        if (zoomed) reset();
        else zoomAround(2.5, cx, cy);
        lastTap.current = 0;
        return;
      }
      lastTap.current = now;
      gesture.current = { type: "pan", startX: event.clientX, startY: event.clientY, origin: view };
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const box = boxRef.current.getBoundingClientRect();
      gesture.current = {
        type: "pinch",
        startDist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        mid: { cx: (a.x + b.x) / 2 - box.left - box.width / 2, cy: (a.y + b.y) / 2 - box.top - box.height / 2 },
        origin: view,
      };
    }
    if (zoomed || pointers.current.size === 2) event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function onPointerMove(event) {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const g = gesture.current;
    if (!g) return;
    if (g.type === "pinch" && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const scale = clamp(g.origin.scale * (dist / g.startDist), MIN, MAX);
      const ratio = scale / g.origin.scale;
      const x = g.mid.cx - (g.mid.cx - g.origin.x) * ratio;
      const y = g.mid.cy - (g.mid.cy - g.origin.y) * ratio;
      setView({ scale, ...clampPan(scale, x, y) });
    } else if (g.type === "pan" && g.origin.scale > 1.01) {
      setView({ scale: g.origin.scale, ...clampPan(g.origin.scale, g.origin.x + event.clientX - g.startX, g.origin.y + event.clientY - g.startY) });
    }
  }

  function onPointerUp(event) {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size === 0) gesture.current = null;
    else if (pointers.current.size === 1) {
      const [p] = [...pointers.current.values()];
      gesture.current = { type: "pan", startX: p.x, startY: p.y, origin: view };
    }
  }

  useEffect(() => {
    const node = boxRef.current;
    if (!node) return undefined;
    function onWheel(event) {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const { cx, cy } = center(event);
      setView((current) => {
        const scale = clamp(current.scale * (event.deltaY < 0 ? 1.12 : 1 / 1.12), MIN, MAX);
        const ratio = scale / current.scale;
        return { scale, ...clampPan(scale, cx - (cx - current.x) * ratio, cy - (cy - current.y) * ratio) };
      });
    }
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [clampPan]);

  return (
    <div
      ref={boxRef}
      className={cn("relative h-full w-full overflow-hidden", zoomed ? "cursor-grab active:cursor-grabbing" : "", className)}
      style={{ touchAction: zoomed ? "none" : "pan-y pinch-zoom" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div
        className="h-full w-full will-change-transform"
        style={{
          transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`,
          transition: gesture.current ? "none" : "transform 180ms ease-out",
        }}
      >
        {children}
      </div>
      {showControls && (
        <div className="absolute bottom-2 right-2 z-10 flex items-center gap-1 rounded-full bg-black/55 p-1 text-white/85 backdrop-blur">
          <button type="button" aria-label="Alejar" disabled={!zoomed} onClick={() => zoomAround(view.scale / 1.5, 0, 0)} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10 disabled:opacity-30">
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="min-w-9 text-center text-[11px] tabular-nums">{Math.round(view.scale * 100)}%</span>
          <button type="button" aria-label="Acercar" disabled={view.scale >= MAX} onClick={() => zoomAround(view.scale * 1.5, 0, 0)} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10 disabled:opacity-30">
            <ZoomIn className="h-4 w-4" />
          </button>
          {zoomed && (
            <button type="button" aria-label="Restablecer zoom" onClick={reset} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10">
              <RotateCcw className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
