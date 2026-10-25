// Block palette of the automation canvas. Each block can be tapped (it is added
// after the selected block, or at the end) or dragged onto the canvas, where it
// snaps to the nearest "+" slot. Dragging works with mouse, pen and touch; the
// items set touch-action: none so the page does not scroll under the finger.
import { useRef, useState } from "react";
import { Button } from "@runly/ui";
import { Blocks, Clock, Globe, ShieldCheck, X, Zap } from "lucide-react";

const ICONS = { action: Zap, delay: Clock, approval: ShieldCheck, http: Globe };
const DRAG_THRESHOLD = 6;

export function CanvasPalette({ open, onToggle, options, onAdd, onDragOver, onDrop }) {
  const [ghost, setGhost] = useState(null); // { kind, label, x, y }
  const drag = useRef(null);

  const start = (event, option) => {
    if (option.disabled || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = { kind: option.kind, label: option.label, x: event.clientX, y: event.clientY, moved: false };
  };
  const move = (event) => {
    const current = drag.current;
    if (!current) return;
    if (!current.moved && Math.hypot(event.clientX - current.x, event.clientY - current.y) < DRAG_THRESHOLD) return;
    current.moved = true;
    setGhost({ kind: current.kind, label: current.label, x: event.clientX, y: event.clientY });
    onDragOver(current.kind, { x: event.clientX, y: event.clientY });
  };
  const end = (event, cancelled) => {
    const current = drag.current;
    drag.current = null;
    setGhost(null);
    if (!current) return;
    if (current.moved) {
      onDragOver(null, null);
      if (!cancelled) onDrop(current.kind, { x: event.clientX, y: event.clientY });
    } else if (!cancelled) onAdd(current.kind);
  };

  return (
    <div className="absolute left-3 top-3 z-30" data-no-pan>
      {!open ? (
        <Button variant="outline" size="sm" onClick={onToggle} className="bg-[hsl(var(--card))] [@media(pointer:coarse)]:h-11">
          <Blocks className="mr-1.5 h-4 w-4" /> Agregar bloque
        </Button>
      ) : (
        <div className="w-64 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-2 shadow-md">
          <div className="mb-1 flex items-center justify-between px-1">
            <p className="text-sm font-semibold">Bloques</p>
            <button type="button" aria-label="Cerrar bloques" onClick={onToggle} className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11">
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="mb-2 px-1 text-xs text-[hsl(var(--muted-foreground))]">Toca un bloque para agregarlo, o arrástralo hasta un «+».</p>
          <ul className="space-y-1">
            {options.map((option) => {
              const Icon = ICONS[option.kind] ?? Zap;
              return (
                <li key={option.kind}>
                  <button
                    type="button"
                    disabled={option.disabled}
                    title={option.disabled ? option.reason : undefined}
                    style={{ touchAction: "none" }}
                    onPointerDown={(event) => start(event, option)}
                    onPointerMove={move}
                    onPointerUp={(event) => end(event, false)}
                    onPointerCancel={(event) => end(event, true)}
                    onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); if (!option.disabled) onAdd(option.kind); } }}
                    className="flex w-full cursor-grab select-none items-center gap-2.5 rounded-md border border-transparent px-2 py-2 text-left hover:border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]/60 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-transparent disabled:hover:bg-transparent [@media(pointer:coarse)]:min-h-12"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))]" aria-hidden="true"><Icon className="h-4 w-4" /></span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium leading-tight">{option.label}</span>
                      <span className="block text-xs leading-snug text-[hsl(var(--muted-foreground))]">{option.disabled ? option.reason : option.hint}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {ghost && (
        <div aria-hidden="true" className="pointer-events-none fixed z-[1000] rounded-lg border border-(--brand-primary) bg-[hsl(var(--card))] px-3 py-2 text-sm font-medium shadow-lg" style={{ left: ghost.x + 12, top: ghost.y + 12 }}>
          {ghost.label}
        </div>
      )}
    </div>
  );
}
