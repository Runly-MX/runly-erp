// Rectangle-crop geometry for the image editor. All values are in the stage's
// display pixels; `bounds` is { w, h } of the displayed picture.

export const MIN_CROP = 24;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// Largest rect of `ratio` (w/h) centered in bounds. ratio null = full picture.
export function fitRect(bounds, ratio) {
  if (!ratio) return { x: 0, y: 0, w: bounds.w, h: bounds.h };
  let w = bounds.w;
  let h = w / ratio;
  if (h > bounds.h) {
    h = bounds.h;
    w = h * ratio;
  }
  return { x: (bounds.w - w) / 2, y: (bounds.h - h) / 2, w, h };
}

export function moveRect(rect, dx, dy, bounds) {
  return {
    ...rect,
    x: clamp(rect.x + dx, 0, bounds.w - rect.w),
    y: clamp(rect.y + dy, 0, bounds.h - rect.h),
  };
}

// Drag a handle. `hx`/`hy` are -1 | 0 | 1 (which edge(s) move). When `ratio` is
// set only corner handles are meaningful and the opposite corner stays fixed.
export function resizeRect(start, hx, hy, dx, dy, bounds, ratio = null) {
  if (ratio && hx !== 0 && hy !== 0) {
    const ax = hx > 0 ? start.x : start.x + start.w;
    const ay = hy > 0 ? start.y : start.y + start.h;
    const fromX = hx > 0 ? start.w + dx : start.w - dx;
    const fromY = (hy > 0 ? start.h + dy : start.h - dy) * ratio;
    const maxW = Math.min(hx > 0 ? bounds.w - ax : ax, (hy > 0 ? bounds.h - ay : ay) * ratio);
    const w = clamp(Math.max(fromX, fromY), Math.min(MIN_CROP, maxW), maxW);
    const h = w / ratio;
    return { x: hx > 0 ? ax : ax - w, y: hy > 0 ? ay : ay - h, w, h };
  }
  let left = start.x;
  let right = start.x + start.w;
  let top = start.y;
  let bottom = start.y + start.h;
  if (hx < 0) left = clamp(left + dx, 0, right - MIN_CROP);
  if (hx > 0) right = clamp(right + dx, left + MIN_CROP, bounds.w);
  if (hy < 0) top = clamp(top + dy, 0, bottom - MIN_CROP);
  if (hy > 0) bottom = clamp(bottom + dy, top + MIN_CROP, bounds.h);
  return { x: left, y: top, w: right - left, h: bottom - top };
}

// Display-space rect -> source-pixel rect.
export function toSourceRect(rect, bounds, source) {
  const kx = source.width / bounds.w;
  const ky = source.height / bounds.h;
  return { x: rect.x * kx, y: rect.y * ky, w: rect.w * kx, h: rect.h * ky };
}
