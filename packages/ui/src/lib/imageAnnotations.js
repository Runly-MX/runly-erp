// Annotation model for the image editor. All coordinates are in the pixel
// space of the picture being edited, so what the stage previews (SVG) and what
// is exported (canvas) cannot drift apart.
//
//   { type: "pen",   color, width, points: [[x, y], ...] }
//   { type: "arrow", color, width, from: [x, y], to: [x, y] }
//   { type: "rect",  color, width, x, y, w, h }
//   { type: "text",  color, size, x, y, text }

export const ANNOTATION_COLORS = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#8b5cf6", "#111827", "#ffffff"];

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

export function isMeaningful(annotation) {
  switch (annotation.type) {
    case "pen":
      return annotation.points.length > 1;
    case "arrow":
      return Math.hypot(annotation.to[0] - annotation.from[0], annotation.to[1] - annotation.from[1]) > 4;
    case "rect":
      return annotation.w > 4 && annotation.h > 4;
    case "text":
      return Boolean(annotation.text?.trim());
    default:
      return false;
  }
}

export function drawAnnotations(ctx, annotations) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const a of annotations) {
    ctx.strokeStyle = a.color;
    ctx.fillStyle = a.color;
    ctx.lineWidth = a.width ?? 1;
    if (a.type === "pen") {
      ctx.beginPath();
      a.points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.stroke();
    } else if (a.type === "rect") {
      ctx.strokeRect(a.x, a.y, a.w, a.h);
    } else if (a.type === "arrow") {
      ctx.beginPath();
      ctx.moveTo(...a.from);
      ctx.lineTo(...a.to);
      ctx.stroke();
      const [tip, left, right] = arrowHead(a.from, a.to, a.width);
      ctx.beginPath();
      ctx.moveTo(...tip);
      ctx.lineTo(...left);
      ctx.lineTo(...right);
      ctx.closePath();
      ctx.fill();
    } else if (a.type === "text") {
      ctx.font = `600 ${a.size}px sans-serif`;
      ctx.textBaseline = "top";
      ctx.fillText(a.text, a.x, a.y);
    }
  }
  ctx.restore();
}
