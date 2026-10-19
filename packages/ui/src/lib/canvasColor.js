// Colour filters for canvases. Chromium, Firefox and desktop Safari 18+ apply
// CSS filters natively (`ctx.filter`); iPhone browsers before that ignore the
// property, so filters and adjustments silently did nothing there. This module
// detects support and provides a per-pixel fallback that mirrors the CSS filter
// functions, so the preview and the exported file look the same everywhere.

import { presetValues } from "./imageFilters.js";

let nativeSupport;

export function supportsCanvasFilter() {
  if (nativeSupport !== undefined) return nativeSupport;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.filter = "grayscale(1)";
    ctx.fillStyle = "#ff0000";
    ctx.fillRect(0, 0, 1, 1);
    // Pure red turns grey (green > 0) only when the filter was applied.
    nativeSupport = ctx.getImageData(0, 0, 1, 1).data[1] > 0;
  } catch {
    nativeSupport = false;
  }
  return nativeSupport;
}

const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

function saturateMatrix(s) {
  return [0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s, 0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s, 0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s];
}
function sepiaMatrix(a) {
  const k = 1 - Math.min(1, Math.max(0, a));
  return [0.393 + 0.607 * k, 0.769 - 0.769 * k, 0.189 - 0.189 * k, 0.349 - 0.349 * k, 0.686 + 0.314 * k, 0.168 - 0.168 * k, 0.272 - 0.272 * k, 0.534 - 0.534 * k, 0.131 + 0.869 * k];
}
function grayscaleMatrix(a) {
  const k = 1 - Math.min(1, Math.max(0, a));
  return [0.2126 + 0.7874 * k, 0.7152 - 0.7152 * k, 0.0722 - 0.0722 * k, 0.2126 - 0.2126 * k, 0.7152 + 0.2848 * k, 0.0722 - 0.0722 * k, 0.2126 - 0.2126 * k, 0.7152 - 0.7152 * k, 0.0722 + 0.9278 * k];
}
function hueMatrix(deg) {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [
    0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
    0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.140, 0.072 - c * 0.072 - s * 0.283,
    0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072,
  ];
}

// Ordered operations equal to the CSS filter chain used by the native path:
// preset (brightness contrast saturate sepia grayscale hue-rotate), then the
// adjustments (brightness contrast saturate). Identity steps are skipped.
export function colorOps(filter, adjust) {
  const ops = [];
  const p = presetValues(filter);
  const a = adjust ?? {};
  const bright = (v) => v !== 1 && ops.push({ type: "b", v });
  const contrast = (v) => v !== 1 && ops.push({ type: "c", v });
  const matrix = (m, identity) => identity || ops.push({ type: "m", m });
  if (p) {
    bright(p.brightness);
    contrast(p.contrast);
    matrix(saturateMatrix(p.saturate), p.saturate === 1);
    matrix(sepiaMatrix(p.sepia), p.sepia === 0);
    matrix(grayscaleMatrix(p.grayscale), p.grayscale === 0);
    matrix(hueMatrix(p.hue), p.hue === 0);
  }
  bright((a.brightness ?? 100) / 100);
  contrast((a.contrast ?? 100) / 100);
  const sat = (a.saturation ?? 100) / 100;
  matrix(saturateMatrix(sat), sat === 1);
  return ops;
}

export function applyOps(data, ops) {
  if (!ops.length) return;
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];
    for (const op of ops) {
      if (op.type === "b") {
        r = clamp255(r * op.v);
        g = clamp255(g * op.v);
        b = clamp255(b * op.v);
      } else if (op.type === "c") {
        r = clamp255((r - 127.5) * op.v + 127.5);
        g = clamp255((g - 127.5) * op.v + 127.5);
        b = clamp255((b - 127.5) * op.v + 127.5);
      } else {
        const m = op.m;
        const nr = clamp255(m[0] * r + m[1] * g + m[2] * b);
        const ng = clamp255(m[3] * r + m[4] * g + m[5] * b);
        b = clamp255(m[6] * r + m[7] * g + m[8] * b);
        r = nr;
        g = ng;
      }
    }
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
}

// Lays a preset's colour cast over the canvas with its blend mode, keeping the
// transparency of the picture (straightened corners stay transparent).
export function applyTint(canvas, tint) {
  if (!tint || tint.alpha <= 0) return;
  const ctx = canvas.getContext("2d");
  const copy = document.createElement("canvas");
  copy.width = canvas.width;
  copy.height = canvas.height;
  copy.getContext("2d").drawImage(canvas, 0, 0);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.filter = "none";
  ctx.globalCompositeOperation = tint.mode;
  ctx.fillStyle = `rgba(${tint.rgb},${tint.alpha})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(copy, 0, 0);
  ctx.restore();
}

// Soft blur by shrinking and enlarging (smoothing both ways); `radius` is in
// canvas pixels, like the CSS blur() radius.
export function softBlur(canvas, radius) {
  const factor = 1 / (1 + radius * 0.9);
  const small = document.createElement("canvas");
  small.width = Math.max(1, Math.round(canvas.width * factor));
  small.height = Math.max(1, Math.round(canvas.height * factor));
  const sctx = small.getContext("2d");
  sctx.imageSmoothingQuality = "high";
  sctx.drawImage(canvas, 0, 0, small.width, small.height);
  const ctx = canvas.getContext("2d");
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "copy";
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(small, 0, 0, canvas.width, canvas.height);
  ctx.restore();
}

// Fallback used when the browser ignores `ctx.filter`: applies the preset and
// the adjustments (and blur) straight to the canvas pixels.
export function applyColorFallback(canvas, filter, adjust) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const ops = colorOps(filter, adjust);
  if (ops.length) {
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    applyOps(image.data, ops);
    ctx.putImageData(image, 0, 0);
  }
  if (adjust?.blur > 0) softBlur(canvas, adjust.blur);
}
