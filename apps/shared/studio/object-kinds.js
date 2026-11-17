// How each Studio object can leave Studio as an editable element of another format
// (PowerPoint, Website). Shared so every exporter classifies, places and reports alike.
import { DEFAULT_IMAGE } from './image-properties.js'

const round = (value, digits = 4) => Math.round(value * 10 ** digits) / 10 ** digits
// Text and lines carry their scale in scaleX/scaleY; other objects bake it into width/height.
export const SCALED_TYPES = new Set(['text', 'line'])
export const objectSize = item => (SCALED_TYPES.has(item.type) ? { w: item.width * (item.scaleX ?? 1), h: item.height * (item.scaleY ?? 1) } : { w: item.width, h: item.height })

// Studio rotates around the top-left corner; PowerPoint and CSS around the centre: the
// unrotated box is moved so both centres coincide. frame: { x, y, scale } of the target.
export function placement(item, frame) {
  const { w, h } = objectSize(item)
  const r = (item.rotation * Math.PI) / 180, cx = item.x + (w / 2) * Math.cos(r) - (h / 2) * Math.sin(r), cy = item.y + (w / 2) * Math.sin(r) + (h / 2) * Math.cos(r)
  return { x: round(frame.x + (cx - w / 2) * frame.scale), y: round(frame.y + (cy - h / 2) * frame.scale), w: round(w * frame.scale), h: round(h * frame.scale), rotate: round(((item.rotation % 360) + 360) % 360, 2) }
}

// A photo another format can show as-is: rectangular mask, default framing, no border, shadow or adjustments.
export const plainImage = image => !image || (image.mask === 'rectangle' && !image.offsetX && !image.offsetY && (image.zoom ?? 1) === 1 && !image.rotation && !image.flipX && !image.flipY
  && !image.border?.width && !image.shadow?.blur && !image.shadow?.offsetX && !image.shadow?.offsetY
  && Object.entries(image.adjustments ?? {}).every(([key, value]) => value === DEFAULT_IMAGE.adjustments[key]))

// skip | text | line | image | photo-shape | shape | raster (with the reason shown to the user).
export function classify(item) {
  if (item.hidden) return { kind: 'skip' }
  if (item.type === 'text') return { kind: 'text' }
  if (item.type === 'line') return { kind: 'line' }
  if (item.type === 'vector') return { kind: 'raster', reason: item.code ? 'código QR o de barras' : 'icono o vector' }
  if (item.type === 'image') return plainImage(item.image) ? { kind: 'image' } : { kind: 'raster', reason: 'foto con máscara, encuadre, borde, sombra o ajustes' }
  const paint = item.fillPaint
  if (paint?.type === 'gradient') return { kind: 'raster', reason: 'degradado' }
  if (paint?.type === 'image') {
    const rounded = item.type === 'rectangle' && item.shape?.radius
    return plainImage(paint.image) && !rounded && !(item.shape?.strokeWidth) ? { kind: 'photo-shape' } : { kind: 'raster', reason: 'foto dentro de una forma con borde, esquinas o ajustes' }
  }
  return { kind: 'shape' }
}
