// Annotation model for the image editor. All coordinates are in the pixel
// space of the picture being edited, so what the stage previews (SVG) and what
// is exported (canvas) cannot drift apart. Every element has a stable `id` so
// it can be selected, moved, recoloured and deleted.
//
//   { id, type: "pen",     brush: "pen"|"marker"|"soft", color, width, points: [[x, y], ...] }
//   { id, type: "line",    color, width, from: [x, y], to: [x, y] }
//   { id, type: "arrow",   color, width, from: [x, y], to: [x, y] }
//   { id, type: "rect",    color, width, x, y, w, h }
//   { id, type: "ellipse", color, width, x, y, w, h }
//   { id, type: "text",    color, size, x, y, text, bold, bg }
//   { id, type: "fx",      mode, size, strength, points }   retouch brush, painted into the photo (lib/imageFx.js)

export const ANNOTATION_COLORS = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#8b5cf6", "#111827", "#ffffff"];

let counter = 0;
export const newAnnotationId = () => `an-${Date.now().toString(36)}-${counter++}`;

// Stroke passes per brush. `w` multiplies the width, `o` is the opacity of the
// pass: the marker is a wide translucent stroke, the soft brush stacks three
// passes to fake a feathered edge (same result in SVG and canvas, in any browser).
export const BRUSHES = {
  pen: [{ w: 1, o: 1, cap: "round" }],
  marker: [{ w: 2.6, o: 0.38, cap: "butt" }],
  soft: [{ w: 1.7, o: 0.1, cap: "round" }, { w: 1.2, o: 0.18, cap: "round" }, { w: 0.7, o: 0.42, cap: "round" }],
};
export const brushPasses = (a) => BRUSHES[a.brush] ?? BRUSHES.pen;

// Triangle at the tip of an arrow from `from` to `to`.
export function arrowHead(from, to, width) {
  const angle = Math.atan2(to[1] - from[1], to[0] - from[0]);
  const len = Math.max(12, width * 4);
  const spread = Math.PI / 7;
  return [
    to,
    [to[0] - len * Math.cos(angle - spread), to[1] - len * Math.sin(angle - spread)],
    [to[0] - len * Math.cos(angle + spread), to[1] - len * Math.sin(angle + spread)],
  ];
}

export function normalizeRect(a, b) {
  return { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(a[0] - b[0]), h: Math.abs(a[1] - b[1]) };
}

export function isMeaningful(a) {
  switch (a.type) {
    case "pen":
    case "fx":
      return a.points.length > 1;
    case "line":
    case "arrow":
      return Math.hypot(a.to[0] - a.from[0], a.to[1] - a.from[1]) > 4;
    case "rect":
    case "ellipse":
      return a.w > 4 && a.h > 4;
    case "text":
      return Boolean(a.text?.trim());
    default:
      return false;
  }
}

// ---- text ------------------------------------------------------------------
let measureCtx = null;
export function textMetrics(a) {
  if (!measureCtx && typeof document !== "undefined") measureCtx = document.createElement("canvas").getContext("2d");
  let w = a.text.length * a.size * 0.58;
  if (measureCtx) {
    measureCtx.font = `${a.bold ? 700 : 600} ${a.size}px sans-serif`;
    w = measureCtx.measureText(a.text).width;
  }
  return { w, h: a.size * 1.2 };
}

export function textBox(a) {
  const { w, h } = textMetrics(a);
  const pad = a.size * 0.25;
  return { x: a.x - pad, y: a.y - pad * 0.5, w: w + pad * 2, h: h + pad };
}

function isLight(hex) {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 > 0.6;
}
export const textBackground = (a) => (isLight(a.color) ? "rgba(0,0,0,0.62)" : "rgba(255,255,255,0.88)");

// ---- drawing ---------------------------------------------------------------
function strokePath(ctx, points) {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.stroke();
}

// Vector elements only: "fx" retouch strokes are painted into the photo itself.
export function drawAnnotations(ctx, annotations) {
  ctx.save();
  ctx.lineJoin = "round";
  for (const a of annotations) {
    if (a.type === "fx") continue;
    ctx.strokeStyle = a.color;
    ctx.fillStyle = a.color;
    ctx.lineCap = "round";
    ctx.lineWidth = a.width ?? 1;
    if (a.type === "pen") {
      for (const pass of brushPasses(a)) {
        ctx.globalAlpha = pass.o;
        ctx.lineWidth = a.width * pass.w;
        ctx.lineCap = pass.cap;
        strokePath(ctx, a.points);
      }
      ctx.globalAlpha = 1;
    } else if (a.type === "rect") {
      ctx.strokeRect(a.x, a.y, a.w, a.h);
    } else if (a.type === "ellipse") {
      ctx.beginPath();
      ctx.ellipse(a.x + a.w / 2, a.y + a.h / 2, a.w / 2, a.h / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (a.type === "line" || a.type === "arrow") {
      ctx.beginPath();
      ctx.moveTo(...a.from);
      ctx.lineTo(...a.to);
      ctx.stroke();
      if (a.type === "arrow") {
        const [tip, left, right] = arrowHead(a.from, a.to, a.width);
        ctx.beginPath();
        ctx.moveTo(...tip);
        ctx.lineTo(...left);
        ctx.lineTo(...right);
        ctx.closePath();
        ctx.fill();
      }
    } else if (a.type === "text") {
      if (a.bg) {
        const box = textBox(a);
        ctx.fillStyle = textBackground(a);
        ctx.fillRect(box.x, box.y, box.w, box.h);
        ctx.fillStyle = a.color;
      }
      ctx.font = `${a.bold ? 700 : 600} ${a.size}px sans-serif`;
      ctx.textBaseline = "top";
      ctx.fillText(a.text, a.x, a.y);
    }
  }
  ctx.restore();
}

// ---- selection -------------------------------------------------------------
export function bounds(a) {
  const pad = (a.width ?? 0) / 2;
  let box;
  if (a.type === "pen" || a.type === "fx") {
    const xs = a.points.map((p) => p[0]);
    const ys = a.points.map((p) => p[1]);
    const half = a.type === "fx" ? a.size / 2 : pad * Math.max(1, ...brushPasses(a).map((p) => p.w));
    box = { x: Math.min(...xs) - half, y: Math.min(...ys) - half, w: Math.max(...xs) - Math.min(...xs) + half * 2, h: Math.max(...ys) - Math.min(...ys) + half * 2 };
  } else if (a.type === "line" || a.type === "arrow") {
    const r = normalizeRect(a.from, a.to);
    box = { x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 };
  } else if (a.type === "text") {
    box = textBox(a);
  } else {
    box = { x: a.x - pad, y: a.y - pad, w: a.w + pad * 2, h: a.h + pad * 2 };
  }
  return box;
}

export function translateAnnotation(a, dx, dy) {
  const move = (p) => [p[0] + dx, p[1] + dy];
  if (a.type === "pen" || a.type === "fx") return { ...a, points: a.points.map(move) };
  if (a.type === "line" || a.type === "arrow") return { ...a, from: move(a.from), to: move(a.to) };
  return { ...a, x: a.x + dx, y: a.y + dy };
}

function segmentDistance(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function polylineDistance(p, points) {
  if (points.length === 1) return Math.hypot(p[0] - points[0][0], p[1] - points[0][1]);
  let min = Infinity;
  for (let i = 1; i < points.length; i++) min = Math.min(min, segmentDistance(p, points[i - 1], points[i]));
  return min;
}

// Topmost element under `p`; `tol` is the touch slop in picture pixels.
export function hitTest(annotations, p, tol) {
  for (let i = annotations.length - 1; i >= 0; i--) {
    const a = annotations[i];
    let hit = false;
    if (a.type === "pen") hit = polylineDistance(p, a.points) <= (a.width * Math.max(...brushPasses(a).map((x) => x.w))) / 2 + tol;
    else if (a.type === "fx") hit = polylineDistance(p, a.points) <= a.size / 2;
    else if (a.type === "line" || a.type === "arrow") hit = segmentDistance(p, a.from, a.to) <= a.width / 2 + tol;
    else if (a.type === "rect") {
      const inner = Math.min(a.x + a.w - p[0], p[0] - a.x, a.y + a.h - p[1], p[1] - a.y);
      hit = inner >= -(a.width / 2 + tol) && inner <= a.width / 2 + tol;
    } else if (a.type === "ellipse") {
      const rx = a.w / 2;
      const ry = a.h / 2;
      const d = Math.hypot((p[0] - a.x - rx) / rx, (p[1] - a.y - ry) / ry);
      hit = Math.abs(d - 1) * Math.min(rx, ry) <= a.width / 2 + tol;
    } else if (a.type === "text") {
      const box = textBox(a);
      hit = p[0] >= box.x - tol && p[0] <= box.x + box.w + tol && p[1] >= box.y - tol && p[1] <= box.y + box.h + tol;
    }
    if (hit) return a.id;
  }
  return null;
}
