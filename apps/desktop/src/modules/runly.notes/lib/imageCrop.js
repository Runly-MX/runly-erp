// Rendering helpers for the legacy `crop` / `rotation` / `annotations` node
// attributes of images in older notes. All rects are { x, y, w, h } as
// fractions 0..1 of the ORIGINAL image. New edits are baked into the image by
// the full ImageEditorDialog, so only the read side lives here.

/** SVG viewBox string that windows annotation space into the crop rect. */
export function cropToViewBox(crop) {
  if (!crop) return '0 0 1000 1000'
  const { x, y, w, h } = crop
  return `${x * 1000} ${y * 1000} ${w * 1000} ${h * 1000}`
}

/** Normalize any rotation delta to one of 0/90/180/270. */
export function normalizeRotation(deg) {
  return (((Math.round((deg ?? 0) / 90) * 90) % 360) + 360) % 360
}

/** { w, h } of the image as displayed, accounting for a 90°/270° swap. */
export function effectiveNaturalSize(nat, rotation) {
  if (!nat) return nat
  const swapped = normalizeRotation(rotation) % 180 !== 0
  return swapped ? { w: nat.h, h: nat.w } : { w: nat.w, h: nat.h }
}
