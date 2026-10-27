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

// Hex color interpolation (documents have no gradient paint, so gradients are bands).
export const mix = (from, to, t) => {
  const a = [1, 3, 5].map(i => parseInt(from.slice(i, i + 2), 16)), b = [1, 3, 5].map(i => parseInt(to.slice(i, i + 2), 16))
  return `#${a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('')}`
}

// Linear gradient as stacked bands (vertical by default; `across` for left to right).
export const gradientBands = (x, y, width, height, from, to, steps = 32, { across = false } = {}) =>
  Array.from({ length: steps }, (_, index) => {
    const t = steps === 1 ? 0 : index / (steps - 1), fill = mix(from, to, t)
    // 1px overlap hides seams from rounding.
    return across ? box(x + Math.floor((width / steps) * index), y, Math.ceil(width / steps) + 1, height, fill)
      : box(x, y + Math.floor((height / steps) * index), width, Math.ceil(height / steps) + 1, fill)
  })

// Dots that grow along one direction (halftone print effect).
export const halftone = (x, y, columns, rows, gap, maxSize, fill, { toward = 'down', opacity } = {}) =>
  Array.from({ length: columns * rows }, (_, index) => {
    const column = index % columns, row = Math.floor(index / columns)
    const t = { down: row / (rows - 1), up: 1 - row / (rows - 1), right: column / (columns - 1), left: 1 - column / (columns - 1) }[toward]
    const size = Math.max(2, Math.round(maxSize * t))
    return circle(x + column * gap + (maxSize - size) / 2, y + row * gap + (maxSize - size) / 2, size, fill, { opacity })
  })

// Graph-paper grid made of thin bars.
export const gridLines = (x, y, width, height, step, fill, { weight = 1, opacity } = {}) => [
  ...Array.from({ length: Math.floor(width / step) + 1 }, (_, index) => box(x + index * step, y, weight, height, fill, { opacity })),
  ...Array.from({ length: Math.floor(height / step) + 1 }, (_, index) => box(x, y + index * step, width, weight, fill, { opacity }))]

// Position for a w×h box whose center is (cx, cy) once turned `rotation` degrees
// (rotation happens around the top-left corner).
export const centered = (cx, cy, width, height, rotation = 0) => {
  const angle = rotation * Math.PI / 180, dx = width / 2, dy = height / 2
  return [Math.round(cx - (dx * Math.cos(angle) - dy * Math.sin(angle))), Math.round(cy - (dx * Math.sin(angle) + dy * Math.cos(angle)))]
}

// Pointed burst (comic sticker): squares turned around a shared center.
export const starburst = (cx, cy, size, fill, { layers = 4, ...style } = {}) =>
  Array.from({ length: layers }, (_, index) => {
    const rotation = (90 / layers) * index, [x, y] = centered(cx, cy, size, size, rotation)
    return box(x, y, size, size, fill, { rotation, ...style })
  })

// Concentric outline rings.
export const rings = (cx, cy, sizes, stroke, { weight = 3, opacity, dash = 'solid' } = {}) =>
  sizes.map(size => circle(cx - size / 2, cy - size / 2, size, stroke, { noFill: true, strokeWidth: weight, stroke, opacity, dash }))

// Zigzag as one polyline.
export const zigzag = (x, y, width, height, teeth, fill, { weight = 8, opacity } = {}) =>
  line(x, y, width, height, Array.from({ length: teeth * 2 + 1 }, (_, index) => [round(index / (teeth * 2)), index % 2]), fill, { weight, opacity })

// Block with a hard offset shadow (neo-brutalist card).
export const shadowBox = (x, y, width, height, fill, { offset = 12, shadow = '#000000', stroke = '#000000', strokeWidth = 4, radius = 0 } = {}) => [
  box(x + offset, y + offset, width, height, shadow, { radius }),
  box(x, y, width, height, fill, { radius, stroke, strokeWidth })]

// Translucent strip of tape.
export const tape = (x, y, width, height, fill, rotation = 0, opacity = 0.75) => box(x, y, width, height, fill, { rotation, opacity })

// Checkerboard of squares.
export const checker = (x, y, columns, rows, size, fill, opacity) =>
  Array.from({ length: columns * rows }, (_, index) => ({ column: index % columns, row: Math.floor(index / columns) }))
    .filter(({ column, row }) => (column + row) % 2 === 0).map(({ column, row }) => box(x + column * size, y + row * size, size, size, fill, { opacity }))

// Flower seen from above (marigold, dahlia): ring of petals around a center.
export const flower = (cx, cy, size, petal, center, { petals = 10, accent } = {}) => [
  ...Array.from({ length: petals }, (_, index) => {
    const angle = (360 / petals) * index, radians = angle * Math.PI / 180, distance = size * 0.27
    const [x, y] = centered(cx + distance * Math.cos(radians), cy + distance * Math.sin(radians), size * 0.42, size * 0.22, angle)
    return oval(x, y, size * 0.42, size * 0.22, index % 2 && accent ? accent : petal, { rotation: angle })
  }),
  circle(cx - size * 0.14, cy - size * 0.14, size * 0.28, center)]

export { icon }
