import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Check, ChevronDown, Eye, Loader2, Maximize, Minus, PencilRuler, Plus, Redo2, Undo2, X } from "lucide-react";
import { Button } from "./Button.jsx";
import { ConfirmDialog } from "./ConfirmDialog.jsx";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./DropdownMenu.jsx";
import { ImageAnnotationLayer } from "./ImageAnnotationLayer.jsx";
import { ImageCropOverlay } from "./ImageCropOverlay.jsx";
import { ImageLayerOverlay } from "./ImageLayerOverlay.jsx";
import {
  AdjustPanel, AnnotatePanel, CropPanel, EDITOR_TOOLS, FiltersPanel, LayersPanel, RATIOS, RetouchPanel, TurnPanel,
} from "./ImageEditorPanels.jsx";
import { ANNOTATION_COLORS, drawAnnotations, newAnnotationId } from "../lib/imageAnnotations.js";
import { applyFx, applyFxStroke, fxStrokeBounds } from "../lib/imageFx.js";
import { fitRect } from "../lib/cropRect.js";
import { NO_FILTER } from "../lib/imageFilters.js";
import { NO_ADJUST, canvasToFile, cropRect, loadImageFromFile, loadImageFromUrl, makeThumbnail, renderTransformed, workSourceSize } from "../lib/imageEdit.js";
import { remapAnnotation, remapLayer } from "../lib/imageGeometry.js";
import { drawLayers, newLayer, scaleLayer } from "../lib/imageLayers.js";
import { useImageEditorHistory } from "../hooks/useImageEditorHistory.js";
import { useStageGestures } from "../hooks/useStageGestures.js";

const MAX_VIEW_ZOOM = 8;
const MAX_LAYER_BYTES = 10 * 1024 * 1024;
const FULL_CROP = Object.freeze({ x: 0, y: 0, w: 1, h: 1 });
const NO_TRANSFORM = Object.freeze({ quarterTurns: 0, angle: 0, flipX: false, flipY: false });
const INITIAL_DOC = Object.freeze({
  transform: NO_TRANSFORM,
  adjust: NO_ADJUST,
  filter: NO_FILTER,
  annotations: [],
  layers: [],
  ratioId: "free",
  cropN: FULL_CROP,
});
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

// Keeps the same array while every retouch element is unchanged, so the photo
// is not re-processed when only vector annotations change.
function useStableList(list) {
  const ref = useRef(list);
  const same = ref.current.length === list.length && list.every((a, i) => a === ref.current[i]);
  if (!same) ref.current = list;
  return ref.current;
}

const toHex = (r, g, b) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;

// Fraction-space crop rect of the largest `ratio` rect in a picture.
function fitFraction(size, ratio) {
  const r = fitRect(size, ratio);
  return { x: r.x / size.w, y: r.y / size.h, w: r.w / size.w, h: r.h / size.h };
}

function IconBtn({ label, onClick, disabled, children, ...rest }) {
  return (
    <Button type="button" variant="ghost" size="icon" aria-label={label} title={label} disabled={disabled} onClick={onClick} {...rest}>
      {children}
    </Button>
  );
}

// Image editor: crop with proportions, rotate / mirror / straighten, preset
// filters, adjustments, annotations and added images (layers), with undo/redo,
// before/after comparison and wheel / pinch / twist gestures. Non-destructive
// until a save callback runs: `onSave(file)` (copy) and/or `onReplace(file)`
// (replace original, asks for confirmation). `src` must be a CORS-readable URL.
export function ImageEditorDialog({
  open,
  onOpenChange,
  src,
  fileName = "imagen",
  mimeType = "image/jpeg",
  onSave = null,
  onReplace = null,
  saveLabel = "Guardar copia",
  title = "Editar imagen",
}) {
  const areaRef = useRef(null);
  const pictureRef = useRef(null);
  const panRef = useRef(null);
  const layerUrlsRef = useRef([]);
  const [contentEl, setContentEl] = useState(null);
  const [clipEl, setClipEl] = useState(null);
  const [source, setSource] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [tab, setTab] = useState("crop");
  const [tool, setTool] = useState("pen");
  const [color, setColor] = useState(ANNOTATION_COLORS[0]);
  const [stroke, setStroke] = useState(4);
  const [brush, setBrush] = useState("pen");
  const [textOpts, setTextOpts] = useState({ bold: true, bg: false });
  const [fxOpts, setFxOpts] = useState({ mode: "blur", size: 40, strength: 60 });
  const [selectedAnnoId, setSelectedAnnoId] = useState(null);
  const canvasNodeRef = useRef(null);
  const liveRef = useRef({ stroke: null, raf: 0 });
  const [selectedId, setSelectedId] = useState(null);
  const [comparing, setComparing] = useState(false);
  const [view, setView] = useState({ s: 1, x: 0, y: 0 });
  const [areaSize, setAreaSize] = useState({ w: 0, h: 0 });
  const [saving, setSaving] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const hist = useImageEditorHistory(INITIAL_DOC);
  const { doc } = hist;
  const deferredAdjust = useDeferredValue(doc.adjust);
  const deferredFilter = useDeferredValue(doc.filter);

  useEffect(() => {
    setSource(null);
    setError(null);
    setNotice(null);
    setTab("crop");
    setSelectedId(null);
    setComparing(false);
    setView({ s: 1, x: 0, y: 0 });
    hist.reset(INITIAL_DOC);
    if (!open || !src) return undefined;
    let cancelled = false;
    loadImageFromUrl(src)
      .then((img) => !cancelled && setSource(img))
      .catch(() => !cancelled && setError("No se pudo cargar la imagen para editarla."));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, src]);

  // Added-image URLs are kept while the editor is open (undo can bring a layer back).
  useEffect(() => {
    if (open) return undefined;
    return () => {
      layerUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      layerUrlsRef.current = [];
    };
  }, [open]);

  const work = useMemo(
    () => (source ? renderTransformed(source, { ...doc.transform, adjust: deferredAdjust, filter: deferredFilter }) : null),
    [source, doc.transform, deferredAdjust, deferredFilter],
  );
  // The photo with its retouch strokes painted in (what the stage canvas shows).
  const fxList = useStableList(doc.annotations.filter((a) => a.type === "fx"));
  const preview = useMemo(() => (work ? applyFx(work, fxList) : null), [work, fxList]);
  const original = useMemo(() => (source ? renderTransformed(source) : null), [source]);
  const thumb = useMemo(() => (source ? makeThumbnail(source) : null), [source]);

  useEffect(() => {
    const node = areaRef.current;
    if (!open || !node) return undefined;
    const measure = () => setAreaSize({ w: Math.max(0, node.clientWidth - 24), h: Math.max(0, node.clientHeight - 12) });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [open, work]);

  const display = useMemo(() => {
    if (!work || !areaSize.w || !areaSize.h) return null;
    const scale = Math.min(areaSize.w / work.width, areaSize.h / work.height, 2);
    return { w: Math.round(work.width * scale), h: Math.round(work.height * scale), k: scale };
  }, [work, areaSize]);

  const ratio = useMemo(() => {
    const preset = RATIOS.find((r) => r.id === doc.ratioId);
    if (!preset) return null;
    if (preset.ratio === "original") return work ? work.width / work.height : null;
    return preset.ratio;
  }, [doc.ratioId, work]);

  const canvasRef = useCallback(
    (node) => {
      canvasNodeRef.current = node;
      if (!node || !preview) return;
      node.width = preview.width;
      node.height = preview.height;
      node.getContext("2d").drawImage(preview, 0, 0);
    },
    [preview],
  );

  // Live preview of a retouch stroke being drawn: restore the photo under the
  // stroke and repaint it with the stroke applied (at most once per frame).
  function liveFx(stroke) {
    const live = liveRef.current;
    live.stroke = stroke;
    if (live.raf) return;
    live.raf = requestAnimationFrame(() => {
      live.raf = 0;
      const node = canvasNodeRef.current;
      if (!node || !preview) return;
      const ctx = node.getContext("2d");
      const s = live.stroke;
      if (!s) {
        ctx.clearRect(0, 0, node.width, node.height);
        ctx.drawImage(preview, 0, 0);
        return;
      }
      const bb = fxStrokeBounds(s, node.width, node.height);
      if (!bb) return;
      ctx.clearRect(bb.x, bb.y, bb.w, bb.h);
      ctx.drawImage(preview, bb.x, bb.y, bb.w, bb.h, bb.x, bb.y, bb.w, bb.h);
      applyFxStroke(node, s);
    });
  }
  const originalRef = useCallback(
    (node) => {
      if (!node || !original) return;
      node.width = original.width;
      node.height = original.height;
      node.getContext("2d").drawImage(original, 0, 0);
    },
    [original],
  );

  const geometryKey = work ? `${work.width}x${work.height}` : "";
  useEffect(() => {
    setView({ s: 1, x: 0, y: 0 });
  }, [geometryKey]);

  const selectedLayer = doc.layers.find((l) => l.id === selectedId) ?? null;
  const isFullCrop = doc.cropN.w > 0.995 && doc.cropN.h > 0.995;
  const edited =
    JSON.stringify(doc.transform) !== JSON.stringify(NO_TRANSFORM) ||
    JSON.stringify(doc.adjust) !== JSON.stringify(NO_ADJUST) ||
    doc.filter.id !== "none" ||
    doc.annotations.length > 0 ||
    doc.layers.length > 0 ||
    !isFullCrop;

  // ---- document edits -------------------------------------------------
  // A rotation / flip / straighten changes the picture's coordinate space:
  // annotations and added images are carried along with the picture, while the
  // crop restarts (its proportions no longer fit).
  const applyTransform = (d, next) => {
    const src = workSourceSize(source);
    return {
      transform: next,
      annotations: d.annotations.map((a) => remapAnnotation(a, d.transform, next, src)),
      layers: d.layers.map((l) => remapLayer(l, d.transform, next, src)),
      cropN: FULL_CROP,
      ratioId: "free",
    };
  };
  const patchGeometry = (patch, mergeKey = null) => {
    if (!source) return;
    hist.update((d) => applyTransform(d, { ...d.transform, ...patch }), mergeKey);
  };
  const setRatio = (id) => {
    if (!work) return;
    const preset = RATIOS.find((r) => r.id === id);
    const r = preset?.ratio === "original" ? work.width / work.height : preset?.ratio ?? null;
    hist.update({ ratioId: id, cropN: fitFraction({ w: work.width, h: work.height }, r) });
  };
  const selectedAnno = doc.annotations.find((a) => a.id === selectedAnnoId) ?? null;
  const vectorCount = doc.annotations.filter((a) => a.type !== "fx").length;
  const fxCount = doc.annotations.length - vectorCount;
  const patchAnno = (id, patch, mergeKey = null) =>
    hist.update((d) => ({ annotations: d.annotations.map((a) => (a.id === id ? { ...a, ...patch } : a)) }), mergeKey);
  const removeAnnotations = (keep) => hist.update((d) => ({ annotations: d.annotations.filter(keep) }));
  const removeLast = (match) =>
    hist.update((d) => {
      const i = d.annotations.map(match).lastIndexOf(true);
      return i < 0 ? {} : { annotations: d.annotations.filter((_, j) => j !== i) };
    });
  const pickColor = ([x, y]) => {
    if (!preview) return;
    const [r, g, b] = preview.getContext("2d", { willReadFrequently: true }).getImageData(clamp(Math.round(x), 0, preview.width - 1), clamp(Math.round(y), 0, preview.height - 1), 1, 1).data;
    setColor(toHex(r, g, b));
    setTool("pen");
  };
  // Panel values for the selected element are shown in screen px, like the sliders.
  const widthUi = selectedAnno && display
    ? selectedAnno.type === "text"
      ? Math.round((selectedAnno.size * display.k - 12) / 2.5)
      : Math.round((selectedAnno.width ?? stroke) * display.k)
    : stroke;
  const patchLayer = (id, patch, mergeKey = null) =>
    hist.update((d) => ({ layers: d.layers.map((l) => (l.id === id ? { ...l, ...(typeof patch === "function" ? patch(l) : patch) } : l)) }), mergeKey);

  async function addLayers(files) {
    if (!work) return;
    setNotice(null);
    const added = [];
    for (const file of files) {
      if (!file.type.startsWith("image/") || file.size > MAX_LAYER_BYTES) {
        setNotice("Solo se pueden agregar imágenes de hasta 10 MB.");
        continue;
      }
      try {
        const img = await loadImageFromFile(file);
        const url = URL.createObjectURL(file);
        layerUrlsRef.current.push(url);
        added.push(newLayer(img, url, { w: work.width, h: work.height }));
      } catch {
        setNotice("No se pudo leer una de las imágenes.");
      }
    }
    if (!added.length) return;
    hist.update((d) => ({ layers: [...d.layers, ...added] }));
    setSelectedId(added[added.length - 1].id);
  }
  const duplicateLayer = (id) => {
    const l = doc.layers.find((x) => x.id === id);
    if (!l) return;
    const copy = { ...l, id: `${l.id}-c${Date.now()}`, x: l.x + 30, y: l.y + 30 };
    hist.update((d) => ({ layers: [...d.layers, copy] }));
    setSelectedId(copy.id);
  };
  const moveLayerOrder = (id, dir) =>
    hist.update((d) => {
      const i = d.layers.findIndex((l) => l.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= d.layers.length) return {};
      const next = d.layers.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return { layers: next };
    });
  const deleteLayer = (id) => {
    hist.update((d) => ({ layers: d.layers.filter((l) => l.id !== id) }));
    setSelectedId(null);
  };

  // ---- view zoom / pan / gestures --------------------------------------
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
  const layersActive = tab === "layers" && Boolean(selectedLayer);
  const { multiRef } = useStageGestures(clipEl, {
    enabled: Boolean(display) && !comparing,
    // Pinch on a selected image scales it; the wheel and every other case zoom the view.
    onZoom: (factor, cx, cy, kind) => {
      if (layersActive && kind === "pinch") patchLayer(selectedLayer.id, (l) => scaleLayer(l, factor), `pinch-${selectedLayer.id}`);
      else zoomAt(factor, cx, cy);
    },
    onPan: panBy,
    onRotate: (deg) => {
      if (layersActive) patchLayer(selectedLayer.id, (l) => ({ rot: Math.round((l.rot + deg) * 10) / 10 }), `twist-${selectedLayer.id}`);
      else if (tab === "turn") {
        hist.update((d) => {
          let angle = d.transform.angle + deg;
          let turns = d.transform.quarterTurns;
          if (angle > 45) { angle -= 90; turns += 1; }
          if (angle < -45) { angle += 90; turns -= 1; }
          return applyTransform(d, { ...d.transform, angle, quarterTurns: turns });
        }, "angle");
      }
    },
  });

  const canPanWithPointer = view.s > 1 && (tab === "annotate" ? tool === "pan" : tab !== "retouch");
  function handlePanDown(event) {
    if (tab === "layers") setSelectedId(null);
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
    if ((tab === "annotate" && tool !== "pan") || tab === "retouch") return;
    if (view.s > 1) setView({ s: 1, x: 0, y: 0 });
    else zoomAt(2.5, event.clientX, event.clientY);
  }

  // ---- keyboard ---------------------------------------------------------
  function handleKeyDown(event) {
    // The viewer underneath has its own shortcuts; keep the editor keys to the editor.
    event.stopPropagation();
    const typing = event.target instanceof HTMLInputElement && event.target.type === "text";
    if (typing) return;
    const mod = event.ctrlKey || event.metaKey;
    if (mod && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) hist.redo();
      else hist.undo();
    } else if (mod && event.key.toLowerCase() === "y") {
      event.preventDefault();
      hist.redo();
    } else if (event.key === "\\") {
      setComparing(true);
    } else if ((event.key === "Delete" || event.key === "Backspace") && selectedLayer && tab === "layers") {
      event.preventDefault();
      deleteLayer(selectedLayer.id);
    } else if ((event.key === "Delete" || event.key === "Backspace") && selectedAnno && tab === "annotate") {
      event.preventDefault();
      removeAnnotations((a) => a.id !== selectedAnno.id);
      setSelectedAnnoId(null);
    }
  }
  function handleKeyUp(event) {
    if (event.key === "\\") setComparing(false);
  }

  // ---- saving / closing -------------------------------------------------
  async function buildFile() {
    const flat = document.createElement("canvas");
    flat.width = work.width;
    flat.height = work.height;
    const ctx = flat.getContext("2d");
    ctx.drawImage(preview, 0, 0);
    drawLayers(ctx, doc.layers);
    drawAnnotations(ctx, doc.annotations);
    const c = doc.cropN;
    const out = isFullCrop ? flat : cropRect(flat, { x: c.x * flat.width, y: c.y * flat.height, w: c.w * flat.width, h: c.h * flat.height });
    const keepPng = mimeType === "image/png" || mimeType === "image/gif" || doc.transform.angle !== 0;
    const type = keepPng ? "image/png" : mimeType === "image/webp" ? "image/webp" : "image/jpeg";
    const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
    const base = fileName.replace(/\.[^.]+$/, "");
    return canvasToFile(out, { name: `${base}-editada.${ext}`, type });
  }
  async function handleSave(handler) {
    if (!work || !handler) return;
    setSaving(true);
    try {
      await handler(await buildFile());
    } finally {
      setSaving(false);
    }
  }
  function requestClose(next) {
    if (next) return onOpenChange?.(true);
    if (saving) return undefined;
    if (edited) return setConfirmDiscard(true);
    return onOpenChange?.(false);
  }

  const busy = saving || !work;
  const scale = (display?.k ?? 1) * view.s;
  const cropPx = display ? { x: doc.cropN.x * display.w, y: doc.cropN.y * display.h, w: doc.cropN.w * display.w, h: doc.cropN.h * display.h } : null;
  const picture = work ? { w: work.width, h: work.height } : { w: 1, h: 1 };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={requestClose}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <DialogPrimitive.Content
          ref={setContentEl}
          aria-describedby={undefined}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          className="glass-viewer fixed inset-0 z-50 flex flex-col outline-none"
        >
          {/* Top bar */}
          <div className="safe-top flex h-14 shrink-0 items-center gap-1 border-b border-[hsl(var(--border))] bg-[hsl(var(--surface-2))]/60 px-2 sm:px-3">
            <IconBtn label="Cerrar editor" onClick={() => requestClose(false)}><X className="h-5 w-5" /></IconBtn>
            <PencilRuler className="ml-1 hidden h-4 w-4 text-[hsl(var(--primary))] sm:block" aria-hidden="true" />
            <DialogPrimitive.Title className="mr-auto hidden truncate text-sm font-medium sm:block">{title}</DialogPrimitive.Title>
            <span className="mr-auto sm:hidden" />
            <IconBtn label="Deshacer (Ctrl+Z)" disabled={!hist.canUndo || saving} onClick={hist.undo}><Undo2 className="h-5 w-5" /></IconBtn>
            <IconBtn label="Rehacer (Ctrl+Shift+Z)" disabled={!hist.canRedo || saving} onClick={hist.redo}><Redo2 className="h-5 w-5" /></IconBtn>
            <Button
              type="button"
              variant={comparing ? "secondary" : "ghost"}
              aria-label="Mantén pulsado para ver el original"
              title="Mantén pulsado para ver el original (tecla \)"
              disabled={busy}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                setComparing(true);
              }}
              onPointerUp={() => setComparing(false)}
              onPointerCancel={() => setComparing(false)}
              onContextMenu={(e) => e.preventDefault()}
              className="touch-none select-none px-2 sm:px-3"
            >
              <Eye className="h-5 w-5 sm:mr-1.5 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Original</span>
            </Button>
            {onSave || onReplace ? (
              <>
                <div className="ml-1 hidden items-center gap-2 sm:flex">
                  {onReplace ? (
                    <Button type="button" variant="outline" disabled={busy || !edited} onClick={() => setConfirmReplace(true)}>Reemplazar original</Button>
                  ) : null}
                  {onSave ? (
                    <Button type="button" disabled={busy || !edited} onClick={() => handleSave(onSave)}>
                      {saving ? "Guardando..." : saveLabel}
                    </Button>
                  ) : null}
                </div>
                <div className="ml-1 sm:hidden">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" disabled={busy || !edited}>
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}Guardar<ChevronDown className="ml-1 h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {onSave ? <DropdownMenuItem onSelect={() => handleSave(onSave)}>{saveLabel}</DropdownMenuItem> : null}
                      {onReplace ? <DropdownMenuItem onSelect={() => setConfirmReplace(true)}>Reemplazar original</DropdownMenuItem> : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </>
            ) : null}
          </div>

          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            {/* Tool rail: bottom bar on touch layouts, left rail on desktop */}
            <div role="tablist" aria-label="Herramientas" className="safe-bottom order-3 flex shrink-0 overflow-x-auto border-t border-[hsl(var(--border))] bg-[hsl(var(--surface-2))]/60 lg:order-1 lg:w-20 lg:flex-col lg:overflow-y-auto lg:overflow-x-visible lg:border-r lg:border-t-0">
              {EDITOR_TOOLS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                  className={`flex min-h-14 min-w-18 flex-1 flex-col items-center justify-center gap-1 px-2 py-2 text-xs font-medium transition-colors lg:min-h-18 lg:flex-none ${tab === id ? "bg-[hsl(var(--primary))]/12 text-[hsl(var(--primary))]" : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]"}`}
                >
                  <Icon className="h-5 w-5" />
                  {label}
                </button>
              ))}
            </div>

            {/* Stage: a slim zoom bar above the picture (never over it, so it cannot
                cover the crop handles) and the picture area below */}
            <div className="order-1 flex min-h-0 min-w-0 flex-1 flex-col lg:order-2">
              <div className="flex h-10 shrink-0 items-center justify-end gap-0.5 px-3">
                <span className="mr-auto hidden text-xs text-[hsl(var(--muted-foreground))] sm:inline">Rueda o pellizco para acercar</span>
                <IconBtn label="Alejar vista" disabled={!work || !display || view.s <= 1} onClick={() => zoomCenter(1 / 1.4)} className="h-9 w-9"><Minus className="h-4 w-4" /></IconBtn>
                <span className="w-11 text-center text-xs tabular-nums">{Math.round(view.s * 100)}%</span>
                <IconBtn label="Acercar vista" disabled={!work || !display || view.s >= MAX_VIEW_ZOOM} onClick={() => zoomCenter(1.4)} className="h-9 w-9"><Plus className="h-4 w-4" /></IconBtn>
                <IconBtn label="Ajustar a la ventana" disabled={!work || !display || view.s === 1} onClick={() => setView({ s: 1, x: 0, y: 0 })} className="h-9 w-9"><Maximize className="h-4 w-4" /></IconBtn>
              </div>
            <div ref={areaRef} className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center p-3 pt-0">
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
                    {display ? (
                      <div ref={pictureRef} className="absolute left-0 top-0" style={{ width: picture.w, height: picture.h, transform: `scale(${display.k})`, transformOrigin: "0 0" }}>
                        <ImageLayerOverlay
                          layers={doc.layers}
                          selectedId={selectedId}
                          interactive={tab === "layers"}
                          scale={scale}
                          picture={picture}
                          wrapRef={pictureRef}
                          multiRef={multiRef}
                          onSelect={setSelectedId}
                          onChange={(id, next) => patchLayer(id, { x: next.x, y: next.y, w: next.w, h: next.h, rot: next.rot }, `drag-${id}`)}
                        />
                        <ImageAnnotationLayer
                          size={{ w: picture.w, h: picture.h }}
                          annotations={doc.annotations}
                          tool={tab === "annotate" ? (tool === "pan" ? null : tool) : tab === "retouch" ? "fx" : null}
                          brush={brush}
                          color={color}
                          width={stroke}
                          text={textOpts}
                          fx={fxOpts}
                          selectedId={selectedAnnoId}
                          showSelection={tab === "annotate"}
                          unit={1 / scale}
                          viewScale={view.s}
                          multiRef={multiRef}
                          textPortal={contentEl}
                          onSelect={setSelectedAnnoId}
                          onAdd={(a) => hist.update((d) => ({ annotations: [...d.annotations, a] }))}
                          onChange={(id, next, merge) => hist.update((d) => ({ annotations: d.annotations.map((a) => (a.id === id ? next : a)) }), merge ?? null)}
                          onLiveFx={liveFx}
                          onPick={pickColor}
                        />
                      </div>
                    ) : null}
                    {display && cropPx && tab === "crop" ? (
                      <ImageCropOverlay
                        rect={cropPx}
                        bounds={display}
                        ratio={ratio}
                        scale={view.s}
                        multiRef={multiRef}
                        disabled={saving}
                        onChange={(r) => hist.update({ cropN: { x: r.x / display.w, y: r.y / display.h, w: r.w / display.w, h: r.h / display.h } }, "crop")}
                      />
                    ) : null}
                    {cropPx && tab !== "crop" && !isFullCrop ? (
                      <div className="pointer-events-none absolute border border-white/70" style={{ left: cropPx.x, top: cropPx.y, width: cropPx.w, height: cropPx.h, boxShadow: "0 0 0 9999px rgba(0,0,0,0.5)" }} />
                    ) : null}
                  </div>
                  {comparing && original ? (
                    <div className="absolute inset-0 bg-[hsl(var(--background))]">
                      <canvas ref={originalRef} aria-label="Imagen original" className="h-full w-full object-contain" />
                      <span className="absolute left-2 top-2 rounded-full bg-black/70 px-3 py-1 text-xs font-medium text-white">Original</span>
                    </div>
                  ) : null}
                </div>
              ) : error ? (
                <p className="px-4 text-sm text-[hsl(var(--destructive))]">{error}</p>
              ) : (
                <Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--muted-foreground))]" />
              )}
            </div>
            </div>

            {/* Contextual panel: under the stage on touch layouts, right column on desktop */}
            <div role="tabpanel" className="order-2 max-h-[38dvh] shrink-0 space-y-5 overflow-y-auto overscroll-contain border-t border-[hsl(var(--border))] bg-[hsl(var(--surface-2))]/40 p-4 lg:order-3 lg:max-h-none lg:w-80 lg:border-l lg:border-t-0">
              {tab === "crop" ? <CropPanel ratioId={doc.ratioId} disabled={busy} onRatio={setRatio} /> : null}
              {tab === "turn" ? <TurnPanel transform={doc.transform} disabled={busy} onPatch={(patch, merge) => patchGeometry(patch, merge)} /> : null}
              {tab === "filters" ? (
                <FiltersPanel
                  thumb={thumb}
                  filter={doc.filter}
                  disabled={busy}
                  onSelect={(id) => hist.update({ filter: { id, amount: 100 } })}
                  onAmount={(amount) => hist.update({ filter: { ...doc.filter, amount } }, "filter-amount")}
                />
              ) : null}
              {tab === "adjust" ? <AdjustPanel adjust={doc.adjust} disabled={busy} onChange={(adjust, merge) => hist.update({ adjust }, merge ?? null)} /> : null}
              {tab === "annotate" ? (
                <AnnotatePanel
                  tool={tool}
                  brush={selectedAnno?.type === "pen" ? selectedAnno.brush ?? "pen" : brush}
                  color={selectedAnno && selectedAnno.type !== "fx" ? selectedAnno.color : color}
                  width={widthUi}
                  text={selectedAnno?.type === "text" ? { bold: Boolean(selectedAnno.bold), bg: Boolean(selectedAnno.bg) } : textOpts}
                  selected={selectedAnno}
                  count={vectorCount}
                  zoomed={view.s > 1}
                  disabled={busy}
                  onTool={(id) => {
                    setTool(id);
                    if (id !== "select") setSelectedAnnoId(null);
                  }}
                  onBrush={(id) => {
                    setBrush(id);
                    if (selectedAnno?.type === "pen") patchAnno(selectedAnno.id, { brush: id });
                  }}
                  onColor={(c) => {
                    setColor(c);
                    if (selectedAnno && selectedAnno.type !== "fx") patchAnno(selectedAnno.id, { color: c }, `color-${selectedAnno.id}`);
                  }}
                  onWidth={(v) => {
                    if (selectedAnno && display) {
                      if (selectedAnno.type === "text") patchAnno(selectedAnno.id, { size: (12 + v * 2.5) / display.k }, `size-${selectedAnno.id}`);
                      else patchAnno(selectedAnno.id, { width: v / display.k }, `size-${selectedAnno.id}`);
                    } else setStroke(v);
                  }}
                  onText={(patch) => {
                    setTextOpts((o) => ({ ...o, ...patch }));
                    if (selectedAnno?.type === "text") patchAnno(selectedAnno.id, patch);
                  }}
                  onDelete={() => {
                    removeAnnotations((a) => a.id !== selectedAnno.id);
                    setSelectedAnnoId(null);
                  }}
                  onDuplicate={() => {
                    const copy = { ...selectedAnno, id: newAnnotationId() };
                    const moved = copy.points ? { ...copy, points: copy.points.map(([x, y]) => [x + 30, y + 30]) } : copy.from ? { ...copy, from: [copy.from[0] + 30, copy.from[1] + 30], to: [copy.to[0] + 30, copy.to[1] + 30] } : { ...copy, x: copy.x + 30, y: copy.y + 30 };
                    hist.update((d) => ({ annotations: [...d.annotations, moved] }));
                    setSelectedAnnoId(moved.id);
                  }}
                  onUndo={() => removeLast((a) => a.type !== "fx")}
                  onClear={() => {
                    removeAnnotations((a) => a.type === "fx");
                    setSelectedAnnoId(null);
                  }}
                />
              ) : null}
              {tab === "retouch" ? (
                <RetouchPanel
                  fx={fxOpts}
                  count={fxCount}
                  disabled={busy}
                  onChange={(patch) => setFxOpts((o) => ({ ...o, ...patch }))}
                  onUndo={() => removeLast((a) => a.type === "fx")}
                  onClear={() => removeAnnotations((a) => a.type !== "fx")}
                />
              ) : null}
              {tab === "layers" ? (
                <LayersPanel
                  layers={doc.layers}
                  selectedId={selectedId}
                  disabled={busy}
                  onAdd={addLayers}
                  onSelect={setSelectedId}
                  onPatch={patchLayer}
                  onDuplicate={duplicateLayer}
                  onMove={moveLayerOrder}
                  onDelete={deleteLayer}
                />
              ) : null}
              {notice ? <p role="status" className="text-xs text-[hsl(var(--destructive))]">{notice}</p> : null}
              <Button type="button" variant="ghost" disabled={busy || !edited} onClick={() => { hist.update(INITIAL_DOC); setSelectedId(null); }} className="h-11 w-full">
                Restablecer todo
              </Button>
            </div>
          </div>

          <ConfirmDialog
            open={confirmReplace}
            onOpenChange={setConfirmReplace}
            title="Reemplazar la imagen original"
            icon={PencilRuler}
            tone="warning"
            description="La imagen se sustituirá por la versión editada. La versión anterior se conserva en el historial del archivo."
            confirmLabel="Reemplazar"
            loading={saving}
            onConfirm={async () => {
              await handleSave(onReplace);
              setConfirmReplace(false);
            }}
          />
          <ConfirmDialog
            open={confirmDiscard}
            onOpenChange={setConfirmDiscard}
            title="Descartar los cambios"
            icon={PencilRuler}
            tone="warning"
            description="Tienes cambios sin guardar. Si sales ahora se perderán."
            confirmLabel="Descartar"
            onConfirm={() => {
              setConfirmDiscard(false);
              onOpenChange?.(false);
            }}
          />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
