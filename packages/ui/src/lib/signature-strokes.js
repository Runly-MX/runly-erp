// Pure geometry for SignaturePad. Strokes are arrays of points normalized to
// the drawing surface (x, y in 0..1). The surface keeps a fixed aspect ratio,
// so a drawing re-renders identically at any size, and the export crops it to
// the strokes' bounding box and fits it into a fixed-size image.

export const SIGNATURE_ASPECT = 5 / 2;
export const SIGNATURE_EXPORT_SIZE = { width: 600, height: 240 };
export const SIGNATURE_EXPORT_STROKE = 4;
export const SIGNATURE_EXPORT_PADDING = 12;
// A tiny scribble is never magnified beyond this many export heights per
// surface height, so a dot does not become a blob.
const MAX_MAGNIFICATION = 3;

const clamp01 = (value) => Math.min(1, Math.max(0, value));

// Surface pixels -> normalized point.
export function normalizePoint(x, y, width, height) {
  return { x: clamp01(width ? x / width : 0), y: clamp01(height ? y / height : 0) };
}

// Normalized strokes -> surface pixel strokes.
export function denormalizeStrokes(strokes, width, height) {
  return strokes.map((stroke) => stroke.map((p) => ({ x: p.x * width, y: p.y * height })));
}

// Bounding box in "surface height" units (x scaled by the aspect ratio, so
// both axes share the same unit). null when there are no points.
export function strokesBounds(strokes, aspect = SIGNATURE_ASPECT) {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const stroke of strokes) {
    for (const p of stroke) {
      const x = p.x * aspect;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

// Normalized strokes -> strokes in export pixels: cropped to their bounding
// box, scaled uniformly to fit inside the padded export area and centered.
export function fitStrokesForExport(strokes, {
  width = SIGNATURE_EXPORT_SIZE.width,
  height = SIGNATURE_EXPORT_SIZE.height,
  padding = SIGNATURE_EXPORT_PADDING,
  aspect = SIGNATURE_ASPECT,
} = {}) {
  const bounds = strokesBounds(strokes, aspect);
  if (!bounds) return [];
  const innerW = Math.max(width - padding * 2, 1);
  const innerH = Math.max(height - padding * 2, 1);
  const boxW = bounds.maxX - bounds.minX;
  const boxH = bounds.maxY - bounds.minY;
  const scale = Math.min(
    boxW > 0 ? innerW / boxW : Infinity,
    boxH > 0 ? innerH / boxH : Infinity,
    height * MAX_MAGNIFICATION,
  );
  const offsetX = (width - boxW * scale) / 2;
  const offsetY = (height - boxH * scale) / 2;
  return strokes.map((stroke) => stroke.map((p) => ({
    x: offsetX + (p.x * aspect - bounds.minX) * scale,
    y: offsetY + (p.y - bounds.minY) * scale,
  })));
}

// Paints pixel strokes on a 2D context: round caps/joins, single points as dots.
export function paintStrokes(ctx, strokes, color, lineWidth) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lineWidth;
  for (const stroke of strokes) {
    if (!stroke.length) continue;
    if (stroke.length === 1) {
      ctx.beginPath();
      ctx.arc(stroke[0].x, stroke[0].y, lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.beginPath();
    ctx.moveTo(stroke[0].x, stroke[0].y);
    for (let i = 1; i < stroke.length; i += 1) ctx.lineTo(stroke[i].x, stroke[i].y);
    ctx.stroke();
  }
}
