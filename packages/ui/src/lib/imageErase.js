// Eraser for the image editor: makes pixels transparent. Like the retouch
// brushes, an erase is an "fx" element (mode "erase") replayed from the
// document, so it can be undone and survives rotation of the picture.
//
//   shape  brush | rect | ellipse | lasso | color
//   brush  `points` is the stroke, `size` its width, `strength` the softness (0-100)
//   rect / ellipse  first and last point are the corners
//   lasso  `points` is the closed outline
//   color  first point is the seed; pixels close to its color are erased
//          (`tolerance` 0-100, `contiguous` limits it to the connected area)

import { softBlur } from "./canvasColor.js";

export const ERASE_SHAPES = ["brush", "rect", "ellipse", "lasso", "color"];
export const AREA_SHAPES = ["rect", "ellipse", "lasso"];

const makeCanvas = (w, h) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
};

const featherOf = (s) => (s.shape === "brush" ? (s.size * 0.2 * (s.strength ?? 0)) / 100 : 0);

// Integer rectangle an erase element can touch on a canvas of the given size.
export function eraseBounds(s, width, height) {
  if (s.shape === "color") return { x: 0, y: 0, w: width, h: height };
  if (!s.points.length) return null;
  const pad = (s.shape === "brush" ? s.size / 2 : 0) + featherOf(s) * 2 + 2;
  const xs = s.points.map((p) => p[0]);
  const ys = s.points.map((p) => p[1]);
  const x0 = Math.max(0, Math.floor(Math.min(...xs) - pad));
  const y0 = Math.max(0, Math.floor(Math.min(...ys) - pad));
  const x1 = Math.min(width, Math.ceil(Math.max(...xs) + pad));
  const y1 = Math.min(height, Math.ceil(Math.max(...ys) + pad));
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

function paintShape(ctx, s, bb) {
  const pts = s.points.map(([x, y]) => [x - bb.x, y - bb.y]);
  const first = pts[0];
  const last = pts[pts.length - 1];
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#fff";
  if (s.shape === "rect" || s.shape === "ellipse") {
    const x = Math.min(first[0], last[0]);
    const y = Math.min(first[1], last[1]);
    const w = Math.abs(first[0] - last[0]);
    const h = Math.abs(first[1] - last[1]);
    ctx.beginPath();
    if (s.shape === "rect") ctx.rect(x, y, w, h);
    else ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  if (s.shape === "lasso") {
    ctx.closePath();
    ctx.fill();
    return;
  }
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = s.size;
  if (pts.length === 1) {
    ctx.beginPath();
    ctx.arc(first[0], first[1], s.size / 2, 0, Math.PI * 2);
    ctx.fill();
  } else ctx.stroke();
}

// Flood (or global) erase of a color. Pixels within the inner 60% of the
// tolerance go fully transparent; the outer band fades out so edges stay soft.
function eraseColor(canvas, s) {
  const { width: w, height: h } = canvas;
  const sx = Math.min(w - 1, Math.max(0, Math.round(s.points[0][0])));
  const sy = Math.min(h - 1, Math.max(0, Math.round(s.points[0][1])));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const image = ctx.getImageData(0, 0, w, h);
  const d = image.data;
  const seed = (sy * w + sx) * 4;
  if (d[seed + 3] === 0) return;
  const r0 = d[seed];
  const g0 = d[seed + 1];
  const b0 = d[seed + 2];
  const limit = 8 + (s.tolerance ?? 30) * 1.6;
  const inner = limit * 0.6;
  const limit2 = limit * limit;

  // True when the pixel belongs to the erased color (erasing it as a side effect).
  const take = (p) => {
    const i = p * 4;
    if (d[i + 3] === 0) return true;
    const dr = d[i] - r0;
    const dg = d[i + 1] - g0;
    const db = d[i + 2] - b0;
    const dist2 = dr * dr + dg * dg + db * db;
    if (dist2 > limit2) return false;
    const dist = Math.sqrt(dist2);
    d[i + 3] = dist <= inner ? 0 : Math.round((d[i + 3] * (dist - inner)) / (limit - inner));
    return true;
  };

  if (s.contiguous === false) {
    for (let p = 0; p < w * h; p++) take(p);
  } else {
    const seen = new Uint8Array(w * h);
    const stack = new Int32Array(w * h);
    let top = 0;
    const push = (p) => {
      if (seen[p]) return;
      seen[p] = 1;
      if (take(p)) stack[top++] = p;
    };
    push(sy * w + sx);
    while (top) {
      const p = stack[--top];
      const x = p % w;
      if (x > 0) push(p - 1);
      if (x < w - 1) push(p + 1);
      if (p >= w) push(p - w);
      if (p < w * (h - 1)) push(p + w);
    }
  }
  ctx.putImageData(image, 0, 0);
}

export function eraseStroke(canvas, s) {
  if (s.shape === "color") return eraseColor(canvas, s);
  const bb = eraseBounds(s, canvas.width, canvas.height);
  if (!bb) return;
  const mask = makeCanvas(bb.w, bb.h);
  paintShape(mask.getContext("2d"), s, bb);
  const feather = featherOf(s);
  if (feather > 0.5) softBlur(mask, feather);
  const ctx = canvas.getContext("2d");
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.drawImage(mask, bb.x, bb.y);
  ctx.restore();
}

export const isErase = (a) => a.type === "fx" && a.mode === "erase";
