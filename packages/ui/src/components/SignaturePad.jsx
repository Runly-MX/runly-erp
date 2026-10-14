import { useCallback, useEffect, useRef, useState } from "react";
import { Eraser } from "lucide-react";
import { Button } from "./Button.jsx";
import { cn } from "../lib/utils.js";

// Hand-drawn signature capture. Pointer events cover mouse, pen and touch;
// the canvas backing store follows devicePixelRatio so strokes stay sharp.
// onChange receives a PNG data URL after each stroke, or null when cleared.
export function SignaturePad({
  label,
  hint = "Firma dentro del recuadro",
  onChange,
  disabled = false,
  height = 180,
  strokeColor = "#111827",
  strokeWidth = 2.2,
  className,
}) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastRef = useRef(null);
  const [empty, setEmpty] = useState(true);

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const width = wrap.clientWidth;
    // Resizing clears the canvas; keep the current drawing when possible.
    const previous = empty ? null : canvas.toDataURL("image/png");
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = strokeWidth;
    if (previous) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, width, height);
      img.src = previous;
    }
  }, [empty, height, strokeColor, strokeWidth]);

  useEffect(() => {
    resize();
    const wrap = wrapRef.current;
    if (!wrap || typeof ResizeObserver === "undefined") return undefined;
    let lastWidth = wrap.clientWidth;
    const observer = new ResizeObserver(() => {
      if (wrap.clientWidth !== lastWidth) {
        lastWidth = wrap.clientWidth;
        resize();
      }
    });
    observer.observe(wrap);
    return () => observer.disconnect();
    // Only re-run on size-affecting props; resize itself reads `empty`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height]);

  function point(event) {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function handleDown(event) {
    if (disabled) return;
    event.preventDefault();
    canvasRef.current.setPointerCapture?.(event.pointerId);
    drawingRef.current = true;
    const p = point(event);
    lastRef.current = p;
    const ctx = canvasRef.current.getContext("2d");
    ctx.beginPath();
    ctx.arc(p.x, p.y, strokeWidth / 2, 0, Math.PI * 2);
    ctx.fillStyle = strokeColor;
    ctx.fill();
  }

  function handleMove(event) {
    if (!drawingRef.current || disabled) return;
    event.preventDefault();
    const p = point(event);
    const ctx = canvasRef.current.getContext("2d");
    ctx.beginPath();
    ctx.moveTo(lastRef.current.x, lastRef.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastRef.current = p;
  }

  function handleUp() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastRef.current = null;
    setEmpty(false);
    onChange?.(canvasRef.current.toDataURL("image/png"));
  }

  function clear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    setEmpty(true);
    onChange?.(null);
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      {label ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-[hsl(var(--foreground))]">{label}</p>
        </div>
      ) : null}
      <div
        ref={wrapRef}
        className={cn(
          "relative w-full overflow-hidden rounded-md border border-dashed border-[hsl(var(--border))] bg-white",
          disabled && "opacity-60",
        )}
        style={{ height }}
      >
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
          <span className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs text-neutral-400">
            {disabled ? "Firma deshabilitada" : hint}
          </span>
        ) : null}
        <span className="pointer-events-none absolute inset-x-6 bottom-9 border-b border-neutral-300" />
      </div>
      <div className="flex justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={clear} disabled={disabled || empty}>
          <Eraser className="mr-1.5 h-3.5 w-3.5" />Limpiar firma
        </Button>
      </div>
    </div>
  );
}
