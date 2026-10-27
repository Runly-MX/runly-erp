// Reusable decorative motifs for starting points. Every motif returns plain v5
// primitives (shapes, polylines, Lucide vectors), so each piece stays editable
// and recolorable. Compose them instead of drawing each template from scratch.
import { icon } from './templates-premium.js'

const round = value => Math.round(value * 10000) / 10000
const opt = opacity => (opacity === undefined ? {} : { opacity })
const styled = ({ radius = 0, stroke, strokeWidth = 0, dash = 'solid', noFill = false }, fill) =>
  radius || strokeWidth || noFill ? { shape: { fillEnabled: !noFill, strokeWidth, strokeColor: stroke ?? fill, dash, radius } } : {}

export const box = (x, y, width, height, fill, { rotation = 0, opacity, ...style } = {}) =>
  ({ type: 'rectangle', x, y, width, height, fill, rotation, ...styled(style, fill), ...opt(opacity) })
export const oval = (x, y, width, height, fill, { rotation = 0, opacity, ...style } = {}) =>
  ({ type: 'ellipse', x, y, width, height, fill, rotation, ...styled({ ...style, radius: 0 }, fill), ...opt(opacity) })
export const circle = (x, y, size, fill, options) => oval(x, y, size, size, fill, options)
export const text = (x, y, width, fontSize, fill, value, { font = 'Poppins', variant = 'regular', align = 'left', lineHeight = 1.16, spacing = 0, opacity } = {}) =>
  ({ type: 'text', x, y, width, fontSize, fill, text: value, fontFamily: font, fontVariant: variant, textAlign: align, lineHeight, charSpacing: spacing,
    height: Math.ceil(value.split('\n').length * fontSize * lineHeight * 1.13), ...opt(opacity) })
export const line = (x, y, width, height, points, fill, { weight = 4, dash = 'solid', start = 'none', end = 'none', rotation = 0, opacity } = {}) =>
  ({ type: 'line', x, y, width, height, points, fill, rotation, strokeWidth: weight, dash, startCap: start, endCap: end, ...opt(opacity) })
export const samples = (count, map) => Array.from({ length: count }, (_, index) => map(index / (count - 1)).map(round))

// Grid of dots.
export const dotGrid = (x, y, columns, rows, gap, size, fill, opacity) =>
  Array.from({ length: columns * rows }, (_, index) => circle(x + (index % columns) * gap, y + Math.floor(index / columns) * gap, size, fill, { opacity }))

// Horizontal bars separated by equal gaps.
export const stripes = (x, y, width, height, count, fill, opacity) => {
  const bar = height / (count * 2 - 1)
  return Array.from({ length: count }, (_, index) => box(x, y + index * bar * 2, width, bar, fill, { opacity }))
}

// Stacked sine waves; each row is one polyline of height/rows.
export const waves = (x, y, width, height, rows, fill, { weight = 4, cycles = 3, opacity } = {}) =>
  Array.from({ length: rows }, (_, index) => line(x, y + (height / rows) * index, width, height / rows,
    samples(48, t => [t, 0.5 + 0.35 * Math.sin(t * Math.PI * 2 * cycles + index * 0.6)]), fill, { weight, opacity }))

// Rays around a center (each ray is a thin bar turned around its top end).
export const sunburst = (cx, cy, length, count, fill, { weight = 6, opacity, start = 0 } = {}) =>
  Array.from({ length: count }, (_, index) => box(cx - weight / 2, cy, weight, length, fill, { rotation: start + (360 / count) * index, opacity }))

// Deterministic confetti scattered inside an area; colors cycle.
export const confetti = ({ x, y, width, height }, count, colors, seed = 7) => {
  let state = seed
  const next = () => (state = (state * 16807) % 2147483647) / 2147483647
  return Array.from({ length: count }, (_, index) => {
    const px = Math.round(x + next() * width), py = Math.round(y + next() * height), fill = colors[index % colors.length]
    return index % 3 === 0 ? circle(px, py, 16 + Math.round(next() * 14), fill) : box(px, py, 30 + Math.round(next() * 24), 12 + Math.round(next() * 6), fill, { rotation: Math.round(next() * 180) - 90 })
  })
}

// Soft organic shape: two overlapping ovals.
export const blob = (x, y, size, fill, opacity) =>
  [oval(x, y + size * 0.1, size, size * 0.8, fill, { rotation: -12, opacity }), oval(x + size * 0.18, y, size * 0.7, size * 0.9, fill, { rotation: 20, opacity })]

// Puffy cloud.
export const cloud = (x, y, scale, fill, opacity) => [
  box(x, y + 20 * scale, 200 * scale, 60 * scale, fill, { radius: 30 * scale, opacity }),
  box(x + 36 * scale, y, 100 * scale, 70 * scale, fill, { radius: 35 * scale, opacity }),
  box(x + 90 * scale, y + 10 * scale, 90 * scale, 60 * scale, fill, { radius: 30 * scale, opacity })]

// Two nested outline frames.
export const doubleFrame = (x, y, width, height, stroke, { gap = 14, weight = 3, radius = 0 } = {}) => [
  box(x, y, width, height, stroke, { noFill: true, strokeWidth: weight, stroke, radius }),
  box(x + gap, y + gap, width - gap * 2, height - gap * 2, stroke, { noFill: true, strokeWidth: weight, stroke, radius: Math.max(0, radius - gap) })]

// Divider: line with a diamond in the middle.
export const rule = (x, y, width, fill) => [
  box(x, y, width / 2 - 16, 3, fill, { radius: 2 }), box(x + width / 2 + 16, y, width / 2 - 16, 3, fill, { radius: 2 }),
  box(x + width / 2 - 7, y - 5.5, 14, 14, fill, { rotation: 45 })]

// Row of sparkle stars.
export const stars = (x, y, size, gap, fill, count = 5) =>
  Array.from({ length: count }, (_, index) => icon('sparkle', x + index * (size + gap), y, size, fill))

// Round sticker with a big label and a small caption.
export const badge = (x, y, size, fill, label, caption, ink, ring = ink) => [
  circle(x, y, size, fill),
  circle(x + size * 0.07, y + size * 0.07, size * 0.86, fill, { noFill: true, strokeWidth: 3, stroke: ring, dash: 'dashed' }),
  text(x, y + size * 0.27, size, Math.round(size * 0.4), ink, label, { font: 'Bebas Neue', align: 'center', lineHeight: 1 }),
  text(x, y + size * 0.7, size, Math.max(11, Math.round(size * 0.075)), ring, caption, { font: 'Space Mono', align: 'center', spacing: 60 })]

// Pill with centered label.
export const chip = (x, y, width, height, fill, label, ink, { font = 'Space Mono', variant = 'regular', spacing = 40 } = {}) => {
  const size = Math.round(height * 0.34)
  return [box(x, y, width, height, fill, { radius: height / 2 }),
    text(x, y + (height - size * 1.16) / 2, width, size, ink, label, { font, variant, align: 'center', lineHeight: 1, spacing })]
}

export { icon }
