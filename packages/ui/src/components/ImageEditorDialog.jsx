import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Crop, FlipVertical2, FlipHorizontal2, Hand, Loader2, Minus, PencilRuler, PenLine, Plus, RotateCcw, RotateCw, Rotate3d, Maximize, SlidersHorizontal, Square, Type, Undo2 } from "lucide-react";
import { Button } from "./Button.jsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./Dialog.jsx";
import { ConfirmDialog } from "./ConfirmDialog.jsx";
import { ImageAnnotationLayer } from "./ImageAnnotationLayer.jsx";
import { ImageCropOverlay } from "./ImageCropOverlay.jsx";
import { ANNOTATION_COLORS, drawAnnotations } from "../lib/imageAnnotations.js";
import { useStageGestures } from "../hooks/useStageGestures.js";
import { fitRect, toSourceRect } from "../lib/cropRect.js";
import { NO_ADJUST, canvasToFile, cropRect, loadImageFromUrl, renderTransformed } from "../lib/imageEdit.js";

const MAX_STAGE_HEIGHT = 520;
const MAX_VIEW_ZOOM = 8;
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const NO_TRANSFORM = { quarterTurns: 0, angle: 0, flipX: false, flipY: false };
const RATIOS = [
  { id: "free", label: "Libre", ratio: null },
  { id: "orig", label: "Original", ratio: "original" },
  { id: "1:1", label: "1:1", ratio: 1 },
  { id: "4:3", label: "4:3", ratio: 4 / 3 },
  { id: "3:4", label: "3:4", ratio: 3 / 4 },
  { id: "16:9", label: "16:9", ratio: 16 / 9 },
  { id: "9:16", label: "9:16", ratio: 9 / 16 },
];
const TABS = [
  { id: "crop", label: "Recortar", icon: Crop },
  { id: "turn", label: "Girar", icon: Rotate3d },
  { id: "adjust", label: "Ajustes", icon: SlidersHorizontal },
  { id: "annotate", label: "Anotar", icon: PenLine },
];
const TOOLS = [
  { id: "pan", label: "Mover vista", icon: Hand },
  { id: "pen", label: "Lápiz", icon: PenLine },
  { id: "arrow", label: "Flecha", icon: ArrowUpRight },
  { id: "rect", label: "Recuadro", icon: Square },
  { id: "text", label: "Texto", icon: Type },
];
const STROKES = [2, 4, 6, 10];
const SLIDERS = [
  { key: "brightness", label: "Brillo", min: 40, max: 160 },
  { key: "contrast", label: "Contraste", min: 40, max: 160 },
  { key: "saturation", label: "Saturación", min: 0, max: 200 },
];

function IconButton({ label, onClick, active = false, disabled, children }) {
  return (
    <Button type="button" variant={active ? "secondary" : "ghost"} size="icon" aria-label={label} title={label} aria-pressed={active} disabled={disabled} onClick={onClick}>
      {children}
    </Button>
  );
}

// Image editor (phase 1): crop with proportions, rotate / mirror / straighten
// and brightness / contrast / saturation. Works on the whole picture and
// resolves to a new File via `onSave(file)` — the host decides where it goes
// (copy, replacement...). `src` must be a CORS-readable URL (signed URLs are).
export function ImageEditorDialog({
  open,
  onOpenChange,
  src,
  fileName = "imagen",
  mimeType = "image/jpeg",
  onSave,
  onReplace = null,
  saveLabel = "Guardar copia",
  title = "Editar imagen",
}) {
  const stageWrapRef = useRef(null);
  const panRef = useRef(null);
  const [clipEl, setClipEl] = useState(null);
  const [view, setView] = useState({ s: 1, x: 0, y: 0 });
  const [source, setSource] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("crop");
  const [transform, setTransform] = useState(NO_TRANSFORM);
  const [adjust, setAdjust] = useState(NO_ADJUST);
  const [ratioId, setRatioId] = useState("free");
  const [wrapWidth, setWrapWidth] = useState(0);
  const [rect, setRect] = useState(null);
  const [saving, setSaving] = useState(false);
  const [annotations, setAnnotations] = useState([]);
  const [tool, setTool] = useState("pen");
  const [color, setColor] = useState(ANNOTATION_COLORS[0]);
  const [stroke, setStroke] = useState(4);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const deferredAdjust = useDeferredValue(adjust);

  useEffect(() => {
    setSource(null);
    setError(null);
    setTransform(NO_TRANSFORM);
    setAdjust(NO_ADJUST);
    setRatioId("free");
    setRect(null);
    setAnnotations([]);
    setTab("crop");
    setView({ s: 1, x: 0, y: 0 });
    if (!open || !src) return undefined;
    let cancelled = false;
    loadImageFromUrl(src)
      .then((img) => !cancelled && setSource(img))
      .catch(() => !cancelled && setError("No se pudo cargar la imagen para editarla."));
    return () => {
      cancelled = true;
    };
  }, [open, src]);

  const work = useMemo(() => (source ? renderTransformed(source, { ...transform, adjust: deferredAdjust }) : null), [source, transform, deferredAdjust]);

  useEffect(() => {
    const node = stageWrapRef.current;
    if (!open || !node) return undefined;
    const measure = () => setWrapWidth(node.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [open, work]);

  const display = useMemo(() => {
    if (!work || !wrapWidth) return null;
    const scale = Math.min(wrapWidth / work.width, MAX_STAGE_HEIGHT / work.height, 1);
    return { w: Math.round(work.width * scale), h: Math.round(work.height * scale) };
  }, [work, wrapWidth]);

  const ratio = useMemo(() => {
    const preset = RATIOS.find((r) => r.id === ratioId);
    if (!preset) return null;
    if (preset.ratio === "original") return work ? work.width / work.height : null;
    return preset.ratio;
  }, [ratioId, work]);

  // Geometry changes (new picture size, rotation, preset) reset the crop to the
  // largest rect of the chosen proportion; brightness etc. do not (same size).
  const geometryKey = work ? `${work.width}x${work.height}` : "";
  useEffect(() => {
    setView({ s: 1, x: 0, y: 0 });
  }, [geometryKey]);
  useEffect(() => {
    if (display) setRect(fitRect(display, ratio));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometryKey, display?.w, display?.h, ratioId]);

  // View zoom/pan (wheel, pinch, two-finger drag, "Mover vista", double click).
  // The picture, annotations and crop all live inside one transformed layer.
  const clampView = useCallback(
    (v) => {
      const s = clamp(v.s, 1, MAX_VIEW_ZOOM);
      if (!display) return { s, x: 0, y: 0 };
      return { s, x: clamp(v.x, display.w - display.w * s, 0), y: clamp(v.y, display.h - display.h * s, 0) };
    },
    [display],
  );
  function zoomAt(factor, cx, cy) {
    if (!clipEl) return;
    const box = clipEl.getBoundingClientRect();
    setView((v) => {
      const s = clamp(v.s * factor, 1, MAX_VIEW_ZOOM);
      const k = s / v.s;
      const px = cx - box.left;
      const py = cy - box.top;
      return clampView({ s, x: px - (px - v.x) * k, y: py - (py - v.y) * k });
    });
  }
  function zoomCenter(factor) {
    if (!clipEl) return;
    const box = clipEl.getBoundingClientRect();
    zoomAt(factor, box.left + box.width / 2, box.top + box.height / 2);
  }
  const panBy = (dx, dy) => setView((v) => clampView({ ...v, x: v.x + dx, y: v.y + dy }));
  const { multiRef } = useStageGestures(clipEl, { enabled: Boolean(display), onZoom: zoomAt, onPan: panBy });

  // One-pointer panning: only where no other tool owns the pointer.
  const canPanWithPointer = view.s > 1 && (tab !== "annotate" || tool === "pan");
  function handlePanDown(event) {
    if (!canPanWithPointer || multiRef.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    panRef.current = { x: event.clientX, y: event.clientY };
  }
  function handlePanMove(event) {
    const last = panRef.current;
    if (!last) return;
    if (multiRef.current) {
      panRef.current = null;
      return;
    }
    panBy(event.clientX - last.x, event.clientY - last.y);
    panRef.current = { x: event.clientX, y: event.clientY };
  }
  function handlePanUp(event) {
    panRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function handleDoubleClick(event) {
    if (tab === "annotate" && tool !== "pan") return;
    if (view.s > 1) setView({ s: 1, x: 0, y: 0 });
    else zoomAt(2.5, event.clientX, event.clientY);
  }

  const canvasRef = useCallback(
    (node) => {
      if (!node || !work) return;
      node.width = work.width;
      node.height = work.height;
      node.getContext("2d").drawImage(work, 0, 0);
    },
    [work],
  );

  // Annotations live in the picture's pixel space; a rotation/flip/straighten
  // changes that space, so it starts them over.
  const patchTransform = (patch) => {
    setTransform((t) => ({ ...t, ...patch }));
    setAnnotations([]);
  };
  const isFullCrop = !rect || !display || (Math.round(rect.w) >= display.w && Math.round(rect.h) >= display.h);
  const edited = JSON.stringify(transform) !== JSON.stringify(NO_TRANSFORM) || JSON.stringify(adjust) !== JSON.stringify(NO_ADJUST) || annotations.length > 0 || !isFullCrop;

  function resetAll() {
    setTransform(NO_TRANSFORM);
    setAdjust(NO_ADJUST);
    setRatioId("free");
    setAnnotations([]);
    if (display) setRect(fitRect(display, null));
  }

  async function buildFile() {
    // Flatten the annotations onto a copy so the stage canvas stays untouched.
    let flat = work;
    if (annotations.length > 0) {
      flat = document.createElement("canvas");
      flat.width = work.width;
      flat.height = work.height;
      const ctx = flat.getContext("2d");
      ctx.drawImage(work, 0, 0);
      drawAnnotations(ctx, annotations);
    }
    const out = isFullCrop ? flat : cropRect(flat, toSourceRect(rect, display, flat));
    const keepPng = mimeType === "image/png" || mimeType === "image/gif" || transform.angle !== 0;
    const type = keepPng ? "image/png" : mimeType === "image/webp" ? "image/webp" : "image/jpeg";
    const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
    const base = fileName.replace(/\.[^.]+$/, "");
    return canvasToFile(out, { name: `${base}-editada.${ext}`, type });
  }

  async function handleSave(handler) {
    if (!work || !display || !rect) return;
    setSaving(true);
    try {
      await handler?.(await buildFile());
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange?.(next)}>
      <DialogContent size="2xl" className="md:max-w-6xl">
        <DialogHeader icon={PencilRuler}>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Los cambios se aplican al guardar y el original no se modifica.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="min-w-0 space-y-2">
            <div className="flex items-center justify-end gap-1">
              <span className="mr-1 hidden text-xs text-[hsl(var(--muted-foreground))] sm:inline">Rueda o pellizca para acercar</span>
              <IconButton label="Alejar vista" disabled={!display || view.s <= 1} onClick={() => zoomCenter(1 / 1.4)}><Minus className="h-4 w-4" /></IconButton>
              <span className="w-12 text-center text-xs tabular-nums">{Math.round(view.s * 100)}%</span>
              <IconButton label="Acercar vista" disabled={!display || view.s >= MAX_VIEW_ZOOM} onClick={() => zoomCenter(1.4)}><Plus className="h-4 w-4" /></IconButton>
              <IconButton label="Ajustar a la ventana" disabled={!display || view.s === 1} onClick={() => setView({ s: 1, x: 0, y: 0 })}><Maximize className="h-4 w-4" /></IconButton>
            </div>
          <div ref={stageWrapRef} className="flex min-h-64 items-center justify-center rounded-lg bg-[hsl(var(--muted))]/60 p-2">
            {work ? (
              <div
                ref={setClipEl}
                className={`relative select-none overflow-hidden ${canPanWithPointer ? "cursor-grab active:cursor-grabbing" : ""}`}
                style={display ? { width: display.w, height: display.h, touchAction: "none" } : undefined}
                onPointerDown={handlePanDown}
                onPointerMove={handlePanMove}
                onPointerUp={handlePanUp}
                onPointerCancel={handlePanUp}
                onDoubleClick={handleDoubleClick}
              >
                <div className="absolute inset-0" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})`, transformOrigin: "0 0" }}>
                  <canvas ref={canvasRef} aria-label="Imagen en edición" className="absolute inset-0 h-full w-full" />
                  <ImageAnnotationLayer
                    size={{ w: work.width, h: work.height }}
                    annotations={annotations}
                    tool={tab === "annotate" && tool !== "pan" ? tool : null}
                    color={color}
                    width={stroke}
                    viewScale={view.s}
                    multiRef={multiRef}
                    onAdd={(a) => setAnnotations((list) => [...list, a])}
                  />
                  {display && rect && tab !== "annotate" ? (
                    <ImageCropOverlay rect={rect} bounds={display} ratio={ratio} scale={view.s} multiRef={multiRef} disabled={saving} onChange={setRect} />
                  ) : null}
                </div>
              </div>
            ) : error ? (
              <p className="px-4 text-sm text-[hsl(var(--destructive))]">{error}</p>
            ) : (
              <Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--muted-foreground))]" />
            )}
          </div>
          </div>

          <div className="space-y-4">
            <div role="tablist" aria-label="Herramientas" className="grid grid-cols-4 gap-1 rounded-lg bg-[hsl(var(--muted))]/60 p-1">
              {TABS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                  className={`flex h-9 items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors ${tab === id ? "bg-[hsl(var(--card))] text-[hsl(var(--foreground))] shadow-sm" : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"}`}
                >
                  <Icon className="h-3.5 w-3.5" />{label}
                </button>
              ))}
            </div>

            {tab === "crop" ? (
              <div className="space-y-2">
                <p className="text-xs text-[hsl(var(--muted-foreground))]">Proporción</p>
                <div className="flex flex-wrap gap-1.5">
                  {RATIOS.map((r) => (
                    <Button key={r.id} type="button" size="sm" variant={ratioId === r.id ? "default" : "outline"} disabled={saving || !work} onClick={() => setRatioId(r.id)}>
                      {r.label}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">Arrastra el recuadro para moverlo y las asas para cambiar su tamaño.</p>
              </div>
            ) : null}

            {tab === "turn" ? (
              <div className="space-y-3">
                <div className="flex gap-1">
                  <IconButton label="Girar a la izquierda" disabled={saving || !work} onClick={() => patchTransform({ quarterTurns: transform.quarterTurns - 1 })}><RotateCcw className="h-4 w-4" /></IconButton>
                  <IconButton label="Girar a la derecha" disabled={saving || !work} onClick={() => patchTransform({ quarterTurns: transform.quarterTurns + 1 })}><RotateCw className="h-4 w-4" /></IconButton>
                  <IconButton label="Voltear horizontalmente" active={transform.flipX} disabled={saving || !work} onClick={() => patchTransform({ flipX: !transform.flipX })}><FlipVertical2 className="h-4 w-4" /></IconButton>
                  <IconButton label="Voltear verticalmente" active={transform.flipY} disabled={saving || !work} onClick={() => patchTransform({ flipY: !transform.flipY })}><FlipHorizontal2 className="h-4 w-4" /></IconButton>
                </div>
                <label className="block space-y-1">
                  <span className="flex justify-between text-xs text-[hsl(var(--muted-foreground))]">Enderezar <span className="tabular-nums text-[hsl(var(--foreground))]">{transform.angle}°</span></span>
                  <input type="range" min={-45} max={45} step={1} value={transform.angle} disabled={saving || !work} onChange={(e) => patchTransform({ angle: Number(e.target.value) })} className="h-2 w-full cursor-pointer accent-[hsl(var(--primary))]" />
                </label>
              </div>
            ) : null}

            {tab === "adjust" ? (
              <div className="space-y-3">
                {SLIDERS.map(({ key, label, min, max }) => (
                  <label key={key} className="block space-y-1">
                    <span className="flex justify-between text-xs text-[hsl(var(--muted-foreground))]">{label} <span className="tabular-nums text-[hsl(var(--foreground))]">{adjust[key] - 100 > 0 ? "+" : ""}{adjust[key] - 100}</span></span>
                    <input type="range" min={min} max={max} step={1} value={adjust[key]} disabled={saving || !work} onChange={(e) => setAdjust((a) => ({ ...a, [key]: Number(e.target.value) }))} className="h-2 w-full cursor-pointer accent-[hsl(var(--primary))]" />
                  </label>
                ))}
              </div>
            ) : null}

            {tab === "annotate" ? (
              <div className="space-y-3">
                <div className="flex gap-1">
                  {TOOLS.map(({ id, label, icon: Icon }) => (
                    <IconButton key={id} label={label} active={tool === id} disabled={saving || !work} onClick={() => setTool(id)}><Icon className="h-4 w-4" /></IconButton>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Color">
                  {ANNOTATION_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      role="radio"
                      aria-checked={color === c}
                      aria-label={`Color ${c}`}
                      onClick={() => setColor(c)}
                      className={`h-7 w-7 rounded-full border-2 transition-transform ${color === c ? "scale-110 border-[hsl(var(--primary))]" : "border-[hsl(var(--border))]"}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                <div className="flex gap-1.5" role="radiogroup" aria-label="Grosor">
                  {STROKES.map((w) => (
                    <Button key={w} type="button" size="sm" variant={stroke === w ? "default" : "outline"} onClick={() => setStroke(w)}>{w}px</Button>
                  ))}
                </div>
                <div className="flex gap-1.5">
                  <Button type="button" size="sm" variant="outline" disabled={annotations.length === 0} onClick={() => setAnnotations((l) => l.slice(0, -1))}>
                    <Undo2 className="mr-1.5 h-3.5 w-3.5" />Deshacer
                  </Button>
                  <Button type="button" size="sm" variant="ghost" disabled={annotations.length === 0} onClick={() => setAnnotations([])}>Limpiar</Button>
                </div>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">Dibuja sobre la imagen. Al girar o enderezar se borran las anotaciones.</p>
              </div>
            ) : null}

            <Button type="button" variant="ghost" size="sm" disabled={saving || !edited} onClick={resetAll}>
              Restablecer todo
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange?.(false)}>
            Cancelar
          </Button>
          {onReplace ? (
            <Button type="button" variant="outline" disabled={saving || !work || !edited} onClick={() => setConfirmReplace(true)}>
              Reemplazar original
            </Button>
          ) : null}
          <Button type="button" disabled={saving || !work || !edited} onClick={() => handleSave(onSave)}>
            {saving ? "Guardando..." : saveLabel}
          </Button>
        </DialogFooter>
        <ConfirmDialog
          open={confirmReplace}
          onOpenChange={setConfirmReplace}
          title="Reemplazar la imagen original"
          icon={PencilRuler}
          description="La imagen se sustituirá por la versión editada. La versión anterior se conserva en el historial del archivo."
          tone="warning"
          confirmLabel="Reemplazar"
          loading={saving}
          onConfirm={async () => {
            await handleSave(onReplace);
            setConfirmReplace(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
