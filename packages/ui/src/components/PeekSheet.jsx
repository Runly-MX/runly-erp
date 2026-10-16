import { useEffect, useId, useRef, useState } from "react";
import { ChevronUp } from "lucide-react";
import { cn } from "../lib/utils.js";

const TAP_SLOP = 6;
const SNAP_DISTANCE = 48;

// Persistent, non-modal bottom sheet for phones: a handle strip (the "peek")
// always stays visible above `bottom` and the panel expands over the page.
// Tap the handle, press Enter/Space on it, or drag it up/down to toggle;
// Escape collapses. Only the body scrolls (overscroll-contain, no scroll
// chaining), and while collapsed the body is inert (out of the tab order).
// Not a dialog: use Sheet for modal tasks. Hide it on large screens with
// className (e.g. "lg:hidden").
export function PeekSheet({
  expanded,
  onExpandedChange,
  handle,
  label,
  children,
  bottom = "0px",
  maxHeight = "75dvh",
  peekHeight = 56,
  className,
  bodyClassName,
}) {
  const bodyId = useId();
  const drag = useRef(null);
  const suppressClick = useRef(false);
  const [delta, setDelta] = useState(0);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!expanded) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape" && !event.defaultPrevented) onExpandedChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded, onExpandedChange]);

  const onPointerDown = (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    drag.current = { startY: event.clientY, moved: 0 };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = (event) => {
    if (!drag.current) return;
    const raw = event.clientY - drag.current.startY;
    const next = expanded ? Math.max(0, raw) : Math.min(0, raw);
    drag.current.moved = Math.max(drag.current.moved, Math.abs(raw));
    if (drag.current.moved > TAP_SLOP) setDragging(true);
    setDelta(next);
  };
  const onPointerUp = () => {
    const state = drag.current;
    drag.current = null;
    if (!state) return;
    if (state.moved > TAP_SLOP) {
      suppressClick.current = true;
      if (expanded && delta > SNAP_DISTANCE) onExpandedChange(false);
      else if (!expanded && delta < -SNAP_DISTANCE) onExpandedChange(true);
    }
    setDragging(false);
    setDelta(0);
  };

  const base = expanded ? "0px" : `calc(100% - ${peekHeight}px)`;
  return (
    <section
      aria-label={label}
      className={cn(
        "fixed inset-x-0 z-30 flex flex-col rounded-t-xl border-t border-[hsl(var(--border))] bg-[hsl(var(--card))]",
        "shadow-[0_-8px_24px_rgb(0_0_0/0.10)]",
        !dragging && "transition-transform duration-200 ease-out motion-reduce:transition-none",
        className,
      )}
      style={{ bottom, maxHeight, transform: `translateY(calc(${base} + ${delta}px))` }}
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={bodyId}
        onClick={() => {
          if (suppressClick.current) { suppressClick.current = false; return; }
          onExpandedChange(!expanded);
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="relative flex w-full shrink-0 touch-none select-none items-center gap-3 rounded-t-xl px-4 pt-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[hsl(var(--ring))]"
        style={{ minHeight: peekHeight }}
      >
        <span aria-hidden="true" className="absolute left-1/2 top-1.5 h-1 w-10 -translate-x-1/2 rounded-full bg-[hsl(var(--muted-foreground)/0.35)]" />
        <span className="min-w-0 flex-1">{handle}</span>
        <ChevronUp
          aria-hidden="true"
          className={cn("size-5 shrink-0 text-[hsl(var(--muted-foreground))] transition-transform motion-reduce:transition-none", expanded && "rotate-180")}
        />
      </button>
      <div
        id={bodyId}
        inert={!expanded}
        className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain", bodyClassName)}
      >
        {children}
      </div>
    </section>
  );
}
