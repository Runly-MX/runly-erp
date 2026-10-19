// Canvas helpers shared by image tools (avatar framing today; a future image
// editor for the file viewer / files module). Pure functions, no React.

import { applyColorFallback, supportsCanvasFilter } from "./canvasColor.js";
import { presetFilter } from "./imageFilters.js";

const MAX_WORK_SIDE = 1800;

export function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer la imagen"));
    };
    img.src = url;
  });
}

// brightness/contrast/saturation are 100-centered; warmth is 0-centered
// (-100 cool .. +100 warm); vignette 0-100; blur 0-10 px.
export const NO_ADJUST = Object.freeze({ brightness: 100, contrast: 100, saturation: 100, warmth: 0, vignette: 0, blur: 0 });

export function adjustFilter(adjust) {
  if (!adjust) return "";
  const { brightness = 100, contrast = 100, saturation = 100, blur = 0 } = adjust;
  const parts = [];
  if (brightness !== 100 || contrast !== 100 || saturation !== 100) {
    parts.push(`brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`);
  }
  if (blur > 0) parts.push(`blur(${blur}px)`);
  return parts.join(" ");
}

export function loadImageFromUrl(url) {
  return fetch(url)
    .then((res) => {
      if (!res.ok) throw new Error("No se pudo cargar la imagen");
      return res.blob();
    })
    .then((blob) => loadImageFromFile(blob));
}

// Copies a rectangle (source pixels) of `source` into a new canvas.
export function cropRect(source, { x, y, w, h }) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  canvas.getContext("2d").drawImage(source, x, y, w, h, 0, 0, canvas.width, canvas.height);
  return canvas;
}

// Renders `img` into a new canvas after applying, in screen space:
// rotation (`quarterTurns` * 90 + `angle` degrees) and then optional mirroring.
// The canvas is the bounding box of the rotated picture (corners transparent
// when `angle` is not a multiple of 90) and is capped to MAX_WORK_SIDE.
// `adjust` ({ brightness, contrast, saturation }, 100 = unchanged) is baked in
// through ctx.filter (Chromium/WebView2, Firefox, Safari 18+).
// Size of the picture at work scale (natural size capped like the work canvas).
export function workSourceSize(img) {
  const k = Math.min(1, MAX_WORK_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  return { w: img.naturalWidth * k, h: img.naturalHeight * k };
}

export function renderTransformed(img, { quarterTurns = 0, angle = 0, flipX = false, flipY = false, adjust = null, filter = null } = {}) {
  const scale = Math.min(1, MAX_WORK_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  const rad = ((quarterTurns * 90 + angle) * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * cos + h * sin));
  canvas.height = Math.max(1, Math.round(w * sin + h * cos));
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  // Browsers that ignore ctx.filter (Safari before 18, i.e. most iPhones) get a
  // per-pixel fallback after drawing, so filters and adjustments still show.
  const native = supportsCanvasFilter();
  const css = native ? [presetFilter(filter), adjustFilter(adjust)].filter(Boolean).join(" ") : "";
  if (css) ctx.filter = css;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
  ctx.rotate(rad);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  if (!native) applyColorFallback(canvas, filter, adjust);
  applyOverlays(ctx, canvas, adjust);
  return canvas;
}

// Warmth tint and vignette, drawn only over existing pixels (source-atop), so
// the transparent corners of a straightened picture stay transparent.
function applyOverlays(ctx, canvas, adjust) {
  if (!adjust) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.filter = "none";
  ctx.globalCompositeOperation = "source-atop";
  if (adjust.warmth) {
    const a = Math.min(0.3, (Math.abs(adjust.warmth) / 100) * 0.3);
    ctx.fillStyle = adjust.warmth > 0 ? `rgba(255,150,40,${a})` : `rgba(60,130,255,${a})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  if (adjust.vignette > 0) {
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const radius = Math.hypot(cx, cy);
    const g = ctx.createRadialGradient(cx, cy, radius * 0.35, cx, cy, radius);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, `rgba(0,0,0,${(adjust.vignette / 100) * 0.85})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.globalCompositeOperation = "source-over";
}

// Small cover-cropped square copy of `img` for the filter thumbnails.
export function makeThumbnail(img, side = 96) {
  const canvas = document.createElement("canvas");
  canvas.width = side;
  canvas.height = side;
  const k = Math.max(side / img.naturalWidth, side / img.naturalHeight);
  const w = img.naturalWidth * k;
  const h = img.naturalHeight * k;
  canvas.getContext("2d").drawImage(img, (side - w) / 2, (side - h) / 2, w, h);
  return canvas;
}

// Copies a square region of `source` into a new `size` x `size` canvas.
export function cropSquare(source, { x, y, side }, size) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  canvas.getContext("2d").drawImage(source, x, y, side, side, 0, 0, size, size);
  return canvas;
}

export function canvasToFile(canvas, { name, type, quality = 0.92 }) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(new File([blob], name, { type })) : reject(new Error("No se pudo generar la imagen"))),
      type,
      quality,
    );
  });
}
