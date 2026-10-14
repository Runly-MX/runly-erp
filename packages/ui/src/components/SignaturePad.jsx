import { useCallback, useEffect, useRef, useState } from "react";
import { Eraser, PenLine } from "lucide-react";
import { Button } from "./Button.jsx";
import { cn } from "../lib/utils.js";

// Hand-drawn signature capture. Pointer events cover mouse, pen and touch;
// the canvas backing store follows devicePixelRatio so strokes stay sharp.
// The pad follows the app theme (strokes use the foreground color), but the
// exported PNG is always re-rendered from the recorded points with
// `exportColor` on a transparent background so it prints correctly.
// onChange receives that PNG data URL after each stroke, or null when cleared.
// `initialImage` shows an existing signature read-only with "Volver a firmar".
export function SignaturePad({
  label,
  hint = "Firma dentro del recuadro",
  onChange,
  disabled = false,
  height = 180,
  strokeWidth = 2.2,
  exportColor = "#111827",
  initialImage = null,
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

  const paint = useCallback((ctx, color, width) => {
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    for (const stroke of strokesRef.current) {
      if (stroke.length === 1) {
        ctx.beginPath();
        ctx.arc(stroke[0].x, stroke[0].y, width / 2, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(stroke[0].x, stroke[0].y);
      for (let i = 1; i < stroke.length; i += 1) ctx.lineTo(stroke[i].x, stroke[i].y);
      ctx.stroke();
    }
  }, []);

  const themeColor = useCallback(() => {
    const wrap = wrapRef.current;
    return (wrap && window.getComputedStyle(wrap).color) || "#111827";
  }, []);

  // Size the backing store and repaint every recorded stroke in the theme color.
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const width = wrap.clientWidth;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    paint(ctx, themeColor(), strokeWidth);
  }, [height, paint, strokeWidth, themeColor]);

  useEffect(() => {
    if (showImage) return undefined;
    render();
    const wrap = wrapRef.current;
    const cleanups = [];
    if (wrap && typeof ResizeObserver !== "undefined") {
      let lastWidth = wrap.clientWidth;
      const observer = new ResizeObserver(() => {
        if (wrap.clientWidth !== lastWidth) {
          lastWidth = wrap.clientWidth;
          render();
        }
      });
      observer.observe(wrap);
      cleanups.push(() => observer.disconnect());
    }
    // Theme switches toggle classes/attributes on <html>; repaint in the new color.
    if (typeof MutationObserver !== "undefined") {
      const themeObserver = new MutationObserver(() => render());
      themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "style"] });
      cleanups.push(() => themeObserver.disconnect());
    }
    return () => cleanups.forEach((fn) => fn());
  }, [render, showImage]);

  function exportPng() {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const out = document.createElement("canvas");
    out.width = canvas.width;
    out.height = canvas.height;
    const ratio = canvas.width / (canvas.clientWidth || 1);
    const ctx = out.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    paint(ctx, exportColor, strokeWidth);
    return out.toDataURL("image/png");
  }

  function point(event) {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function handleDown(event) {
    if (disabled) return;
    event.preventDefault();
    canvasRef.current.setPointerCapture?.(event.pointerId);
    const p = point(event);
    currentRef.current = [p];
    strokesRef.current.push(currentRef.current);
    const ctx = canvasRef.current.getContext("2d");
    ctx.fillStyle = themeColor();
    ctx.beginPath();
    ctx.arc(p.x, p.y, strokeWidth / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  function handleMove(event) {
    const stroke = currentRef.current;
    if (!stroke || disabled) return;
    event.preventDefault();
    const p = point(event);
    const last = stroke[stroke.length - 1];
    const ctx = canvasRef.current.getContext("2d");
    ctx.strokeStyle = themeColor();
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    stroke.push(p);
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
          "relative w-full overflow-hidden rounded-md border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.4)] text-[hsl(var(--foreground))]",
          disabled && "opacity-60",
        )}
        style={{ height }}
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
              <span className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs text-[hsl(var(--muted-foreground))]">
                {disabled ? "Firma deshabilitada" : hint}
              </span>
            ) : null}
            <span className="pointer-events-none absolute inset-x-6 bottom-9 border-b border-[hsl(var(--border))]" />
          </>
        )}
      </div>
      <div className="flex justify-end">
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
    </div>
  );
}
