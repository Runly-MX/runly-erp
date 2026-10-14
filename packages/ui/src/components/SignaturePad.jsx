import { useCallback, useEffect, useRef, useState } from "react";
import { Eraser, PenLine } from "lucide-react";
import { Button } from "./Button.jsx";
import { cn } from "../lib/utils.js";
import {
  SIGNATURE_ASPECT,
  SIGNATURE_EXPORT_SIZE,
  SIGNATURE_EXPORT_STROKE,
  denormalizeStrokes,
  fitStrokesForExport,
  normalizePoint,
  paintStrokes,
} from "../lib/signature-strokes.js";

// Reference surface width for the on-screen stroke width (it scales with the
// surface so a resized drawing keeps its proportions).
const REFERENCE_WIDTH = 500;

// Hand-drawn signature capture. Pointer events cover mouse, pen and touch.
// The surface keeps a fixed 5:2 aspect ratio (full width, capped by `height`)
// and strokes are recorded in normalized 0..1 coordinates, so rotating,
// resizing or zooming repaints the same drawing without distortion. The pad
// follows the app theme (foreground strokes); the exported PNG is always a
// fixed 600 x 240 transparent image with the drawing cropped to its bounds,
// scaled uniformly, centered and stroked in `exportColor`.
// onChange receives that PNG data URL after each stroke, or null when cleared.
// `initialImage` shows an existing signature read-only; `allowRedraw` adds
// "Volver a firmar" to replace it.
export function SignaturePad({
  label,
  hint = "Firma dentro del recuadro",
  onChange,
  disabled = false,
  height = 240,
  strokeWidth = 2.2,
  exportColor = "#111827",
  initialImage = null,
  allowRedraw = true,
  redrawLabel = "Volver a firmar",
  className,
}) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const strokesRef = useRef([]);
  const currentRef = useRef(null);
  const [empty, setEmpty] = useState(true);
  const [redrawing, setRedrawing] = useState(false);
  const showImage = Boolean(initialImage) && !redrawing;

  const themeColor = useCallback(() => {
    const wrap = wrapRef.current;
    return (wrap && window.getComputedStyle(wrap).color) || "#111827";
  }, []);

  const lineWidthFor = useCallback(
    (width) => Math.max(1.5, (strokeWidth * width) / REFERENCE_WIDTH),
    [strokeWidth],
  );

  // Size the backing store (high-DPI) and repaint every stroke in the theme color.
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const width = wrap.clientWidth;
    const surfaceHeight = wrap.clientHeight;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(surfaceHeight * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${surfaceHeight}px`;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    paintStrokes(ctx, denormalizeStrokes(strokesRef.current, width, surfaceHeight), themeColor(), lineWidthFor(width));
  }, [lineWidthFor, themeColor]);

  useEffect(() => {
    if (showImage) return undefined;
    render();
    const wrap = wrapRef.current;
    const cleanups = [];
    if (wrap && typeof ResizeObserver !== "undefined") {
      let last = `${wrap.clientWidth}x${wrap.clientHeight}`;
      const observer = new ResizeObserver(() => {
        const next = `${wrap.clientWidth}x${wrap.clientHeight}`;
        if (next !== last) {
          last = next;
          render();
        }
      });
      observer.observe(wrap);
      cleanups.push(() => observer.disconnect());
    }
    // devicePixelRatio changes on browser zoom or moving between screens.
    const onResize = () => render();
    window.addEventListener("resize", onResize);
    cleanups.push(() => window.removeEventListener("resize", onResize));
    // Theme switches toggle classes/attributes on <html>; repaint in the new color.
    if (typeof MutationObserver !== "undefined") {
      const themeObserver = new MutationObserver(() => render());
      themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "style"] });
      cleanups.push(() => themeObserver.disconnect());
    }
    return () => cleanups.forEach((fn) => fn());
  }, [render, showImage]);

  function exportPng() {
    const out = document.createElement("canvas");
    out.width = SIGNATURE_EXPORT_SIZE.width;
    out.height = SIGNATURE_EXPORT_SIZE.height;
    paintStrokes(out.getContext("2d"), fitStrokesForExport(strokesRef.current), exportColor, SIGNATURE_EXPORT_STROKE);
    return out.toDataURL("image/png");
  }

  function surfacePoint(event) {
    const rect = canvasRef.current.getBoundingClientRect();
    return { px: event.clientX - rect.left, py: event.clientY - rect.top, rect };
  }

  function handleDown(event) {
    if (disabled) return;
    event.preventDefault();
    canvasRef.current.setPointerCapture?.(event.pointerId);
    const { px, py, rect } = surfacePoint(event);
    currentRef.current = [normalizePoint(px, py, rect.width, rect.height)];
    strokesRef.current.push(currentRef.current);
    const ctx = canvasRef.current.getContext("2d");
    ctx.fillStyle = themeColor();
    ctx.beginPath();
    ctx.arc(px, py, lineWidthFor(rect.width) / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  function handleMove(event) {
    const stroke = currentRef.current;
    if (!stroke || disabled) return;
    event.preventDefault();
    const { px, py, rect } = surfacePoint(event);
    const last = stroke[stroke.length - 1];
    const ctx = canvasRef.current.getContext("2d");
    ctx.strokeStyle = themeColor();
    ctx.lineWidth = lineWidthFor(rect.width);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(last.x * rect.width, last.y * rect.height);
    ctx.lineTo(px, py);
    ctx.stroke();
    stroke.push(normalizePoint(px, py, rect.width, rect.height));
  }

  function handleUp() {
    if (!currentRef.current) return;
    currentRef.current = null;
    setEmpty(false);
    onChange?.(exportPng());
  }

  function clear() {
    strokesRef.current = [];
    render();
    setEmpty(true);
    onChange?.(null);
  }

  function startRedraw() {
    strokesRef.current = [];
    setEmpty(true);
    setRedrawing(true);
    onChange?.(null);
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      {label ? (
        <p className="text-sm font-medium text-[hsl(var(--foreground))]">{label}</p>
      ) : null}
      <div
        ref={wrapRef}
        className={cn(
          "relative mx-auto w-full overflow-hidden rounded-md border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.4)] text-[hsl(var(--foreground))]",
          disabled && "opacity-60",
        )}
        style={{ aspectRatio: `${SIGNATURE_ASPECT}`, maxWidth: Math.round(height * SIGNATURE_ASPECT) }}
      >
        {showImage ? (
          <img
            src={initialImage}
            alt={label ? `Firma: ${label}` : "Firma guardada"}
            className="h-full w-full object-contain p-2 dark:invert"
          />
        ) : (
          <>
            <canvas
              ref={canvasRef}
              role="img"
              aria-label={label ? `Área de firma: ${label}` : "Área de firma"}
              className={cn("block touch-none", disabled ? "cursor-not-allowed" : "cursor-crosshair")}
              onPointerDown={handleDown}
              onPointerMove={handleMove}
              onPointerUp={handleUp}
              onPointerLeave={handleUp}
              onPointerCancel={handleUp}
            />
            {empty ? (
              <span className="pointer-events-none absolute inset-x-0 bottom-[8%] text-center text-xs text-[hsl(var(--muted-foreground))]">
                {disabled ? "Firma deshabilitada" : hint}
              </span>
            ) : null}
            <span className="pointer-events-none absolute inset-x-6 bottom-[22%] border-b border-[hsl(var(--border))]" />
          </>
        )}
      </div>
      {showImage && !allowRedraw ? null : (
        <div className="mx-auto flex w-full justify-end" style={{ maxWidth: Math.round(height * SIGNATURE_ASPECT) }}>
          {showImage ? (
            <Button type="button" variant="ghost" size="sm" onClick={startRedraw} disabled={disabled}>
              <PenLine className="mr-1.5 h-3.5 w-3.5" />{redrawLabel}
            </Button>
          ) : (
            <Button type="button" variant="ghost" size="sm" onClick={clear} disabled={disabled || empty}>
              <Eraser className="mr-1.5 h-3.5 w-3.5" />Limpiar firma
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
