import { DEFAULT_GRADIENT, gradientColor } from '../../../../../shared/studio/gradient.js'

// UI-side helpers for v6 paints. Previews only: the document never stores CSS.

// Canonical angle: 0 = left→right, 90 = top→bottom (clockwise). CSS: 90deg = to right.
export function paintCss(paint, { radialAspect = 1 } = {}) {
  if (!paint || paint.type !== 'gradient') return paint?.type === 'solid' ? paint.color : null
  const stops = paint.stops.map(stop => `${gradientColor(stop)} ${Math.round(stop.offset * 1000) / 10}%`).join(', ')
  if (paint.gradientType === 'linear') return `linear-gradient(${paint.angle + 90}deg, ${stops})`
  // Radius is relative to the shorter side; previews are roughly square.
  const radius = Math.round(paint.radius * 100 * Math.min(1, radialAspect))
  return `radial-gradient(circle ${radius}% at ${paint.centerX * 100}% ${paint.centerY * 100}%, ${stops})`
}

// The bar preview always reads left→right regardless of the angle.
export const stopsCss = paint => `linear-gradient(90deg, ${paint.stops.map(stop => `${gradientColor(stop)} ${stop.offset * 100}%`).join(', ')})`

const channels = hex => hex.slice(1).match(/../g).map(value => parseInt(value, 16))
const hex = values => `#${values.map(value => Math.round(value).toString(16).padStart(2, '0')).join('')}`

// Color and opacity at an offset, interpolated between the surrounding stops.
export function stopAt(paint, offset) {
  const stops = paint.stops
  if (offset <= stops[0].offset) return { offset, color: stops[0].color, opacity: stops[0].opacity }
  if (offset >= stops.at(-1).offset) return { offset, color: stops.at(-1).color, opacity: stops.at(-1).opacity }
  const right = stops.findIndex(stop => stop.offset >= offset), a = stops[right - 1], b = stops[right]
  const t = (offset - a.offset) / (b.offset - a.offset), ca = channels(a.color), cb = channels(b.color)
  return { offset, color: hex(ca.map((value, index) => value + (cb[index] - value) * t)), opacity: Math.round((a.opacity + (b.opacity - a.opacity) * t) * 100) / 100 }
}

// Offsets must stay unique: nudge a requested offset away from other stops.
export function freeOffset(paint, offset, skip = -1) {
  let value = Math.round(Math.min(1, Math.max(0, offset)) * 1000) / 1000
  const taken = paint.stops.filter((_, index) => index !== skip).map(stop => stop.offset)
  for (let step = 0; taken.includes(value) && step < 20; step++) value = Math.round(Math.min(1, Math.max(0, value + (step % 2 ? -1 : 1) * 0.001 * (step + 1))) * 1000) / 1000
  return taken.includes(value) ? null : value
}

// Index a stop ends up at once the paint is re-sorted by offset.
export const indexOfOffset = (paint, offset) => paint.stops.findIndex(stop => Math.abs(stop.offset - offset) < 1e-9)

const linear = (angle, ...colors) => ({ type: 'gradient', gradientType: 'linear', angle,
  stops: colors.map((color, index) => ({ offset: index / (colors.length - 1), color, opacity: 1 })) })
const radial = (...colors) => ({ type: 'gradient', gradientType: 'radial', centerX: 0.5, centerY: 0.5, radius: 0.75,
  stops: colors.map((color, index) => ({ offset: index / (colors.length - 1), color, opacity: 1 })) })

export const GRADIENT_PRESETS = [
  { key: 'studio', label: 'Studio', paint: DEFAULT_GRADIENT },
  { key: 'sunset', label: 'Atardecer', paint: linear(90, '#ffcf5c', '#f97316', '#db2777') },
  { key: 'ocean', label: 'Océano', paint: linear(135, '#22d3ee', '#2563eb', '#1e1b4b') },
  { key: 'mint', label: 'Menta', paint: linear(45, '#a7f3d0', '#14b8a6') },
  { key: 'peach', label: 'Durazno', paint: linear(90, '#fde68a', '#fda4af') },
  { key: 'night', label: 'Noche', paint: linear(160, '#312e81', '#0f172a') },
  { key: 'glow', label: 'Resplandor', paint: radial('#fef3c7', '#f59e0b', '#7c2d12') },
  { key: 'aurora', label: 'Aurora', paint: radial('#d9f99d', '#22c55e', '#0f766e') },
]
export const samePaint = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// What a shape is filled with, for the fill picker.
export function fillKind(item) {
  if (item?.shape?.fillEnabled === false) return 'none'
  const type = item?.fillPaint?.type
  return type === 'image' ? 'image' : type === 'gradient' ? 'gradient' : 'solid'
}
