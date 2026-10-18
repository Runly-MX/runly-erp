import { useEffect, useRef, useState } from "react";
import { cn } from "../lib/utils.js";

const clamp01 = (n) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

// Round icon-only control of the VideoPlayer bar (white on the dark gradient).
export function PlayerButton({ label, active = false, className, children, ...props }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-9 min-w-9 items-center justify-center rounded-md px-2 text-white transition-colors",
        "hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70",
        "[&_svg]:size-5 [&_svg]:shrink-0",
        active && "text-[hsl(var(--primary))]",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

// Horizontal slider (seek bar and volume): pointer drag, click, arrow keys.
// `value` and `buffered` are 0..1; `step` is the arrow-key increment (0..1).
export function ScrubBar({ value, buffered = 0, onChange, onScrubStart, onScrubEnd, label, valueText, step = 0.05, className, thick = false }) {
  const trackRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const fractionAt = (clientX) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect?.width) return 0;
    return clamp01((clientX - rect.left) / rect.width);
  };

  function onPointerDown(event) {
    if (event.button !== undefined && event.button !== 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragging(true);
    onScrubStart?.();
    onChange(fractionAt(event.clientX));
  }

  function onPointerMove(event) {
    if (dragging) onChange(fractionAt(event.clientX));
  }

  function onPointerUp(event) {
    if (!dragging) return;
    setDragging(false);
    onChange(fractionAt(event.clientX));
    onScrubEnd?.();
  }

  function onKeyDown(event) {
    const delta = { ArrowRight: step, ArrowUp: step, ArrowLeft: -step, ArrowDown: -step }[event.key];
    if (delta === undefined && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Home") onChange(0);
    else if (event.key === "End") onChange(1);
    else onChange(clamp01(value + delta));
  }

  const pct = `${clamp01(value) * 100}%`;
  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamp01(value) * 100)}
      aria-valuetext={valueText}
      className={cn("group/scrub relative flex h-4 cursor-pointer touch-none items-center focus-visible:outline-none", className)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
    >
      <div className={cn("relative w-full overflow-hidden rounded-full bg-white/25 transition-[height]", thick || dragging ? "h-1.5" : "h-1 group-hover/scrub:h-1.5 [@media(hover:none)]:h-1.5")}>
        <div className="absolute inset-y-0 left-0 bg-white/40" style={{ width: `${clamp01(buffered) * 100}%` }} />
        <div className="absolute inset-y-0 left-0 bg-[hsl(var(--primary))]" style={{ width: pct }} />
      </div>
      <div
        className={cn(
          "pointer-events-none absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow transition-opacity [@media(hover:none)]:size-4",
          // Touch screens have no hover: the thumb is always visible there.
          dragging ? "opacity-100" : "opacity-0 group-hover/scrub:opacity-100 group-focus-visible/scrub:opacity-100 [@media(hover:none)]:opacity-100",
        )}
        style={{ left: pct }}
      />
    </div>
  );
}

export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

// Playback speed picker. Rendered inside the player (not a portal) so it stays
// visible in fullscreen, where portaled menus would be hidden.
export function SpeedMenu({ speed, onSelect }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => { if (!rootRef.current?.contains(event.target)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <PlayerButton
        label={`Velocidad de reproducción: ${speed}x`}
        aria-haspopup="menu"
        aria-expanded={open}
        className="text-xs font-semibold tabular-nums"
        onClick={() => setOpen((value) => !value)}
      >
        {speed}x
      </PlayerButton>
      {open ? (
        <div role="menu" aria-label="Velocidad" className="absolute bottom-full right-0 z-30 mb-2 min-w-24 overflow-hidden rounded-md border border-white/10 bg-black/90 py-1 shadow-lg">
          {SPEEDS.map((value) => (
            <button
              key={value}
              type="button"
              role="menuitemradio"
              aria-checked={value === speed}
              className={cn(
                "block w-full px-3 py-1.5 text-left text-sm tabular-nums text-white hover:bg-white/15 focus-visible:bg-white/15 focus-visible:outline-none",
                value === speed && "bg-white/10 font-semibold",
              )}
              onClick={() => { onSelect(value); setOpen(false); }}
            >
              {value === 1 ? "Normal" : `${value}x`}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
