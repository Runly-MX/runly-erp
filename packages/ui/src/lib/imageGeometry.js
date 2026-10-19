// Maps points between the work canvases of two geometry states (rotation,
// mirror, straighten), so annotations and added images follow the picture when
// it is turned instead of being discarded. Mirrors renderTransformed():
// translate(center) * scale(flip) * rotate(quarterTurns*90 + angle).
//
// `src` is the work-scale source size { w, h } (natural size capped like the
// work canvas). All maths is exact for 90° steps and flips, and a plain
// rotation about the picture center for straightening.

function matrix(t) {
  const rad = (((t.quarterTurns ?? 0) * 90 + (t.angle ?? 0)) * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const fx = t.flipX ? -1 : 1;
  const fy = t.flipY ? -1 : 1;
  // diag(fx, fy) * R(rad)
  return [fx * c, -fx * s, fy * s, fy * c];
}

function inverse([a, b, c, d]) {
  const det = a * d - b * c;
  return [d / det, -b / det, -c / det, a / det];
}

function multiply([a, b, c, d], [e, f, g, h]) {
  return [a * e + b * g, a * f + b * h, c * e + d * g, c * f + d * h];
}

export function canvasSize(src, t) {
  const rad = (((t.quarterTurns ?? 0) * 90 + (t.angle ?? 0)) * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  return { w: Math.max(1, Math.round(src.w * cos + src.h * sin)), h: Math.max(1, Math.round(src.w * sin + src.h * cos)) };
}

// Linear part taking old-canvas offsets from the center to new-canvas offsets.
export function deltaMatrix(from, to) {
  return multiply(matrix(to), inverse(matrix(from)));
}

export function remapPoint(p, from, to, src) {
  const a = canvasSize(src, from);
  const b = canvasSize(src, to);
  const m = deltaMatrix(from, to);
  const x = p[0] - a.w / 2;
  const y = p[1] - a.h / 2;
  return [b.w / 2 + m[0] * x + m[1] * y, b.h / 2 + m[2] * x + m[3] * y];
}

export function remapAnnotation(a, from, to, src) {
  const point = (p) => remapPoint(p, from, to, src);
  if (a.type === "pen") return { ...a, points: a.points.map(point) };
  if (a.type === "arrow") return { ...a, from: point(a.from), to: point(a.to) };
  if (a.type === "rect") {
    // A turned rectangle is no longer axis-aligned: keep it as a closed outline.
    const corners = [[a.x, a.y], [a.x + a.w, a.y], [a.x + a.w, a.y + a.h], [a.x, a.y + a.h], [a.x, a.y]].map(point);
    return { type: "pen", color: a.color, width: a.width, points: corners };
  }
  if (a.type === "text") {
    // The text stays upright; its anchor follows the picture (the text box's center).
    const approxW = a.text.length * a.size * 0.55;
    const [cx, cy] = point([a.x + approxW / 2, a.y + a.size / 2]);
    return { ...a, x: cx - approxW / 2, y: cy - a.size / 2 };
  }
  return a;
}

export function remapLayer(l, from, to, src) {
  const [x, y] = remapPoint([l.x, l.y], from, to, src);
  const rad = (l.rot * Math.PI) / 180;
  const own = [Math.cos(rad) * (l.flipX ? -1 : 1), -Math.sin(rad), Math.sin(rad) * (l.flipX ? -1 : 1), Math.cos(rad)];
  const [a, b, c, d] = multiply(deltaMatrix(from, to), own);
  const flipX = a * d - b * c < 0;
  const rot = flipX ? Math.atan2(-b, d) : Math.atan2(c, a);
  return { ...l, x, y, flipX, rot: Math.round(((rot * 180) / Math.PI) * 10) / 10 };
}
