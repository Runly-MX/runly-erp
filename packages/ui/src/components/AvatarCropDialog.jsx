import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Crop, FlipHorizontal2, FlipVertical2, Minus, Plus, RotateCcw, RotateCw } from "lucide-react";
import { Button } from "./Button.jsx";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "./Dialog.jsx";
import { canvasToFile, cropSquare, loadImageFromFile, renderTransformed } from "../lib/imageEdit.js";

const MAX_STAGE_HEIGHT = 420;
const MIN_FRAME = 56;
const KEY_STEP = 8;
const NO_TRANSFORM = { quarterTurns: 0, angle: 0, flipX: false, flipY: false };

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// Profile-photo framing tool. The whole picture stays visible; the user can
// rotate / mirror / straighten it and move + resize a circular frame over it
// (the area that will be shown as the avatar). Nothing is cropped until
// "Usar esta foto", which resolves to a square File of `outputSize` px (default 1024).
// `onConfirm(file)` may return a promise.
export function AvatarCropDialog({
  open,
  onOpenChange,
  file,
  onConfirm,
  outputSize = 1024,
  busy = false,
  title = "Ajustar foto de perfil",
}) {
  const stageWrapRef = useRef(null);
  const dragRef = useRef(null);
  const [source, setSource] = useState(null);
  const [transform, setTransform] = useState(NO_TRANSFORM);
  const [wrapWidth, setWrapWidth] = useState(0);
  const [frame, setFrame] = useState({ x: 0, y: 0, size: 0 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setSource(null);
    setError(null);
    setTransform(NO_TRANSFORM);
    if (!open || !file) return undefined;
    let cancelled = false;
    loadImageFromFile(file)
      .then((img) => !cancelled && setSource(img))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [open, file]);

  const work = useMemo(() => (source ? renderTransformed(source, transform) : null), [source, transform]);

  useEffect(() => {
    const node = stageWrapRef.current;
    if (!open || !node) return undefined;
    const measure = () => setWrapWidth(node.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [open, work]);

  // Displayed picture size: contained in the available width and max height.
  const display = useMemo(() => {
    if (!work || !wrapWidth) return null;
    const scale = Math.min(wrapWidth / work.width, MAX_STAGE_HEIGHT / work.height, 1);
    return { w: Math.round(work.width * scale), h: Math.round(work.height * scale) };
  }, [work, wrapWidth]);

  const canvasRef = useCallback(
    (node) => {
      if (!node || !work) return;
      node.width = work.width;
      node.height = work.height;
      node.getContext("2d").drawImage(work, 0, 0);
    },
    [work],
  );

  const maxFrame = display ? Math.min(display.w, display.h) : 0;
  const minFrame = Math.min(MIN_FRAME, maxFrame);

  const centerFrame = useCallback(() => {
    if (!display) return;
    const size = Math.min(display.w, display.h);
    setFrame({ x: (display.w - size) / 2, y: (display.h - size) / 2, size });
  }, [display]);

  // Re-seed when the picture (transform) or the stage size changes.
  useEffect(() => {
    centerFrame();
  }, [centerFrame]);

  function moveTo(x, y, size = frame.size) {
    if (!display) return;
    setFrame({ x: clamp(x, 0, display.w - size), y: clamp(y, 0, display.h - size), size });
  }

  function resizeTo(nextSize) {
    if (!display) return;
    const size = clamp(nextSize, minFrame, maxFrame);
    moveTo(frame.x + frame.size / 2 - size / 2, frame.y + frame.size / 2 - size / 2, size);
  }

  function patchTransform(patch) {
    setTransform((t) => ({ ...t, ...patch }));
  }

  function handlePointerDown(event) {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { px: event.clientX, py: event.clientY, x: frame.x, y: frame.y };
  }

  function handlePointerMove(event) {
    const drag = dragRef.current;
    if (!drag) return;
    moveTo(drag.x + event.clientX - drag.px, drag.y + event.clientY - drag.py);
  }

  function handlePointerUp(event) {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleKeyDown(event) {
    const moves = { ArrowLeft: [-KEY_STEP, 0], ArrowRight: [KEY_STEP, 0], ArrowUp: [0, -KEY_STEP], ArrowDown: [0, KEY_STEP] };
    const delta = moves[event.key];
    if (delta) {
      event.preventDefault();
      event.stopPropagation();
      moveTo(frame.x + delta[0], frame.y + delta[1]);
    } else if (event.key === "+" || event.key === "=") {
      resizeTo(frame.size + KEY_STEP * 2);
    } else if (event.key === "-") {
      resizeTo(frame.size - KEY_STEP * 2);
    }
  }

  async function handleConfirm() {
    if (!work || !display) return;
    setSaving(true);
    try {
      const ratio = work.width / display.w;
      const squared = cropSquare(work, { x: frame.x * ratio, y: frame.y * ratio, side: frame.size * ratio }, outputSize);
      // Straightened pictures have transparent corners, so they need PNG.
      const keepPng = file?.type === "image/png" || transform.angle !== 0;
      const type = keepPng ? "image/png" : "image/jpeg";
      const baseName = (file?.name ?? "avatar").replace(/\.[^.]+$/, "");
      await onConfirm?.(await canvasToFile(squared, { name: `${baseName}.${keepPng ? "png" : "jpg"}`, type }));
    } finally {
      setSaving(false);
    }
  }

  const working = busy || saving;
  const zoomPct = maxFrame > minFrame ? Math.round(((maxFrame - frame.size) / (maxFrame - minFrame)) * 100) : 0;
  const edited = JSON.stringify(transform) !== JSON.stringify(NO_TRANSFORM);

  function resetAll() {
    setTransform(NO_TRANSFORM);
    centerFrame();
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !working && onOpenChange?.(next)}>
      <DialogContent size="xl">
        <DialogHeader icon={Crop}>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Arrastra el círculo para elegir la parte que se mostrará. Puedes girar, voltear y enderezar la imagen.</DialogDescription>
        </DialogHeader>

        <div ref={stageWrapRef} className="flex w-full justify-center">
          {work ? (
            <div
              className="relative select-none overflow-hidden rounded-lg bg-[hsl(var(--muted))]"
              style={display ? { width: display.w, height: display.h } : { width: "100%", height: 240 }}
            >
              <canvas ref={canvasRef} aria-label="Foto seleccionada" className="absolute inset-0 h-full w-full" />
              {display ? (
                <div
                  role="slider"
                  tabIndex={0}
                  aria-label="Encuadre de la foto de perfil. Usa las flechas para mover y más o menos para el tamaño"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={zoomPct}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  onKeyDown={handleKeyDown}
                  className="absolute cursor-grab rounded-full border-2 border-white outline-none active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                  style={{
                    left: frame.x,
                    top: frame.y,
                    width: frame.size,
                    height: frame.size,
                    boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
                    touchAction: "none",
                  }}
                />
              ) : null}
            </div>
          ) : error ? (
            <p className="py-10 text-sm text-[hsl(var(--destructive))]">{error}</p>
          ) : (
            <div className="h-60 w-full animate-pulse rounded-lg bg-[hsl(var(--muted))]" />
          )}
        </div>

        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-1">
            <Button type="button" variant="ghost" size="icon" aria-label="Girar a la izquierda" title="Girar a la izquierda" disabled={working || !work} onClick={() => patchTransform({ quarterTurns: transform.quarterTurns - 1 })}>
              <RotateCcw className="h-4 w-4" />
            </Button>
            <Button type="button" variant="ghost" size="icon" aria-label="Girar a la derecha" title="Girar a la derecha" disabled={working || !work} onClick={() => patchTransform({ quarterTurns: transform.quarterTurns + 1 })}>
              <RotateCw className="h-4 w-4" />
            </Button>
            <Button type="button" variant="ghost" size="icon" aria-label="Voltear horizontalmente" title="Voltear horizontalmente" aria-pressed={transform.flipX} disabled={working || !work} onClick={() => patchTransform({ flipX: !transform.flipX })}>
              <FlipHorizontal2 className="h-4 w-4" />
            </Button>
            <Button type="button" variant="ghost" size="icon" aria-label="Voltear verticalmente" title="Voltear verticalmente" aria-pressed={transform.flipY} disabled={working || !work} onClick={() => patchTransform({ flipY: !transform.flipY })}>
              <FlipVertical2 className="h-4 w-4" />
            </Button>
            <div className="ml-auto">
              <Button type="button" variant="ghost" size="sm" disabled={working || !work || (!edited && zoomPct === 0)} onClick={resetAll}>
                Restablecer
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="w-14 shrink-0 text-xs text-[hsl(var(--muted-foreground))]">Ángulo</span>
            <input
              type="range"
              min={-45}
              max={45}
              step={1}
              value={transform.angle}
              disabled={working || !work}
              aria-label="Ángulo de la imagen"
              onChange={(e) => patchTransform({ angle: Number(e.target.value) })}
              className="h-2 flex-1 cursor-pointer accent-[hsl(var(--primary))]"
            />
            <span className="w-10 shrink-0 text-right text-xs tabular-nums">{transform.angle}°</span>
          </div>

          <div className="flex items-center gap-3">
            <span className="w-14 shrink-0 text-xs text-[hsl(var(--muted-foreground))]">Zoom</span>
            <Button type="button" variant="ghost" size="icon" aria-label="Alejar encuadre" disabled={working || !display} onClick={() => resizeTo(frame.size + 24)}>
              <Minus className="h-4 w-4" />
            </Button>
            <input
              type="range"
              min={0}
              max={100}
              value={zoomPct}
              disabled={working || !display}
              aria-label="Zoom del encuadre"
              onChange={(e) => resizeTo(maxFrame - (Number(e.target.value) / 100) * (maxFrame - minFrame))}
              className="h-2 flex-1 cursor-pointer accent-[hsl(var(--primary))]"
            />
            <Button type="button" variant="ghost" size="icon" aria-label="Acercar encuadre" disabled={working || !display} onClick={() => resizeTo(frame.size - 24)}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={working} onClick={() => onOpenChange?.(false)}>
            Cancelar
          </Button>
          <Button type="button" disabled={working || !display} onClick={handleConfirm}>
            {working ? "Guardando..." : "Usar esta foto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
