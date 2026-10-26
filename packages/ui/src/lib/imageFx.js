// Retouch brushes: blur, pixelate, lighten, darken, saturate and desaturate
// painted along a stroke straight into the photo. Strokes work on the pixels of
// a canvas (the filtered photo) and are replayed from the document, so they can
// be undone, moved and rotated with the picture like any other element.

import { applyOps, colorOps, softBlur } from "./canvasColor.js";

export const FX_MODES = [
  { id: "blur", label: "Desenfocar" },
  { id: "pixelate", label: "Pixelar" },
  { id: "lighten", label: "Aclarar" },
  { id: "darken", label: "Oscurecer" },
  { id: "saturate", label: "Saturar" },
  { id: "desaturate", label: "Desaturar" },
];

const pixelBlock = (s) => Math.max(3, Math.round(s.size * (0.06 + 0.28 * (s.strength / 100))));
const blurRadius = (s) => Math.max(2 * (s.pixelScale ?? 1), s.size * 0.04 + s.strength * 0.18 * (s.pixelScale ?? 1));

function adjustFor(mode, strength) {
  const k = strength / 100;
  if (mode === "lighten") return { brightness: 100 + 70 * k };
  if (mode === "darken") return { brightness: 100 - 55 * k };
  if (mode === "saturate") return { saturation: 100 + 150 * k };
  return { saturation: 100 - 100 * k };
}

// Bounds of a retouch element on a canvas of the given size.
export function fxStrokeBounds(s, width, height) {
  return strokeBounds(s.points, s.size, width, height, s.mode === "pixelate" ? pixelBlock(s) : 1);
}

// Integer rectangle covered by a stroke, clamped to the canvas. Pixelate snaps
// the origin to its block grid so the blocks do not shift as the stroke grows.
export function strokeBounds(points, size, width, height, grid = 1) {
  if (!points.length) return null;
  const pad = size / 2 + 2;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  let x0 = Math.max(0, Math.floor(Math.min(...xs) - pad));
  let y0 = Math.max(0, Math.floor(Math.min(...ys) - pad));
  if (grid > 1) {
    x0 = Math.floor(x0 / grid) * grid;
    y0 = Math.floor(y0 / grid) * grid;
  }
  const x1 = Math.min(width, Math.ceil(Math.max(...xs) + pad));
  const y1 = Math.min(height, Math.ceil(Math.max(...ys) + pad));
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

const makeCanvas = (w, h) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
};

function pixelate(effect, block) {
  const small = makeCanvas(Math.ceil(effect.width / block), Math.ceil(effect.height / block));
  small.getContext("2d").drawImage(effect, 0, 0, small.width, small.height);
  const ctx = effect.getContext("2d");
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalCompositeOperation = "copy";
  ctx.drawImage(small, 0, 0, small.width * block, small.height * block);
  ctx.restore();
}

export function applyFxStroke(canvas, s) {
  const grid = s.mode === "pixelate" ? pixelBlock(s) : 1;
  const bb = strokeBounds(s.points, s.size, canvas.width, canvas.height, grid);
  if (!bb) return;
  const effect = makeCanvas(bb.w, bb.h);
  const ectx = effect.getContext("2d", { willReadFrequently: true });
  ectx.drawImage(canvas, bb.x, bb.y, bb.w, bb.h, 0, 0, bb.w, bb.h);

  if (s.mode === "blur") softBlur(effect, blurRadius(s));
  else if (s.mode === "pixelate") pixelate(effect, grid);
  else {
    const image = ectx.getImageData(0, 0, bb.w, bb.h);
    applyOps(image.data, colorOps(null, adjustFor(s.mode, s.strength)));
    ectx.putImageData(image, 0, 0);
  }

  // Brush shape: a round-capped path, feathered for the tonal brushes.
  const mask = makeCanvas(bb.w, bb.h);
  const mctx = mask.getContext("2d");
  mctx.strokeStyle = "#fff";
  mctx.fillStyle = "#fff";
  mctx.lineCap = "round";
  mctx.lineJoin = "round";
  mctx.lineWidth = s.size;
  if (s.points.length === 1) {
    mctx.beginPath();
    mctx.arc(s.points[0][0] - bb.x, s.points[0][1] - bb.y, s.size / 2, 0, Math.PI * 2);
    mctx.fill();
  } else {
    mctx.beginPath();
    s.points.forEach(([x, y], i) => (i === 0 ? mctx.moveTo(x - bb.x, y - bb.y) : mctx.lineTo(x - bb.x, y - bb.y)));
    mctx.stroke();
  }
  if (s.mode !== "blur" && s.mode !== "pixelate") softBlur(mask, Math.max(1, s.size * 0.06));

  ectx.globalCompositeOperation = "destination-in";
  ectx.drawImage(mask, 0, 0);
  canvas.getContext("2d").drawImage(effect, bb.x, bb.y);
}

// Copy of `base` with every "fx" element of `annotations` applied in order.
export function applyFx(base, annotations) {
  const fx = annotations.filter((a) => a.type === "fx");
  if (!fx.length) return base;
  const out = makeCanvas(base.width, base.height);
  out.getContext("2d").drawImage(base, 0, 0);
  for (const stroke of fx) applyFxStroke(out, stroke);
  return out;
}
