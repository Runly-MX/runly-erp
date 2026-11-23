// Motion paths over the v8 keyframe contract (pure). A path is the object's position
// track drawn through its visual centre; keyframes keep storing the top-left x/y the
// renderer reads, so every path here plays, saves and exports exactly like hand-made
// keyframes. Segments are straight (the contract interpolates x and y independently);
// "Suavizar" and the route curve are baked into point placement and timing.
import { MOTION_LIMITS, easing, keyframeValuesAt } from '../../../../../shared/studio/motion.js'

const SCALED = new Set(['text', 'line'])
const fail = message => { throw new Error(message) }
const round1 = value => Math.round(value * 10) / 10
const clampPos = value => Math.min(16384, Math.max(-16384, value))
const hasPosition = frame => frame.x !== undefined || frame.y !== undefined
const isEmpty = frame => !Object.keys(frame).some(key => key !== 'at' && key !== 'easing')

// Offset from the top-left corner to the visual centre (rotation turns around the top-left).
export function centerOffset(object, rotation) {
  const w = SCALED.has(object.type) ? object.width * (object.scaleX ?? 1) : object.width
  const h = SCALED.has(object.type) ? object.height * (object.scaleY ?? 1) : object.height
  const r = rotation * Math.PI / 180, c = Math.cos(r), s = Math.sin(r)
  return [(w / 2) * c - (h / 2) * s, (w / 2) * s + (h / 2) * c]
}

// Centre of the keyframe track at t (before entrance/emphasis/exit effects).
export function centerAt(object, t) {
  const values = keyframeValuesAt(object, t), [ox, oy] = centerOffset(object, values.rotation)
  return { x: values.x + ox, y: values.y + oy }
}

// Points of the path in time order: one per keyframe that sets x or y.
export const positionPath = object => (object.keyframes ?? []).filter(hasPosition).map(frame => ({ at: frame.at, ...centerAt(object, frame.at) }))

// Keyframes that do not belong to the path (rotation, opacity, scale), without x/y.
function otherFrames(object) {
  return (object.keyframes ?? []).map(({ x: _x, y: _y, ...rest }) => rest).filter(frame => !isEmpty(frame))
}
// Path points the object can still take within the 32-keyframe limit (worst case: no shared instants).
export const pathBudget = object => Math.max(2, MOTION_LIMITS.keyframes - otherFrames(object).length)

// Replace the whole position track with `points` ({ at, x, y } in centre space); the
// other properties keep their keyframes. Returns the keyframes field (undefined = none).
export function withPositionPath(object, points) {
  const others = otherFrames(object), rest = { ...object, keyframes: others }
  const byTime = new Map(others.map(frame => [frame.at, { ...frame }]))
  for (const point of points) {
    if (!Number.isInteger(point.at) || point.at < 0 || point.at > MOTION_LIMITS.maxDelay) fail('Instante fuera de rango.')
    const [ox, oy] = centerOffset(object, keyframeValuesAt(rest, point.at).rotation)
    byTime.set(point.at, { ...(byTime.get(point.at) ?? { at: point.at }), x: round1(clampPos(point.x - ox)), y: round1(clampPos(point.y - oy)) })
  }
  const frames = [...byTime.values()].sort((a, b) => a.at - b.at)
  if (frames.length > MOTION_LIMITS.keyframes) fail(`Un elemento admite como máximo ${MOTION_LIMITS.keyframes} keyframes.`)
  return frames.length >= 2 ? frames : undefined
}

// Ramer–Douglas–Peucker: keeps the corners, drops points within `epsilon` of the chord.
function rdp(points, epsilon) {
  const keep = new Uint8Array(points.length), stack = [[0, points.length - 1]]
  keep[0] = keep[points.length - 1] = 1
  while (stack.length) {
    const [first, last] = stack.pop(), a = points[first], b = points[last]
    const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy)
    let far = -1, distance = epsilon
    for (let i = first + 1; i < last; i++) {
      const p = points[i]
      const d = length ? Math.abs(dy * (p.x - a.x) - dx * (p.y - a.y)) / length : Math.hypot(p.x - a.x, p.y - a.y)
      if (d > distance) { distance = d; far = i }
    }
    if (far > 0) { keep[far] = 1; stack.push([first, far], [far, last]) }
  }
  return points.filter((_, index) => keep[index])
}

// Fewest points that follow the stroke within `tolerance` page px, at most `maxPoints`.
export function simplifyPath(points, maxPoints, tolerance = 1.5) {
  const unique = points.filter((p, i) => i === 0 || Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y) >= 0.5)
  if (unique.length <= 2) return unique
  let epsilon = tolerance, kept = rdp(unique, epsilon)
  while (kept.length > maxPoints) { epsilon *= 1.4; kept = rdp(unique, epsilon) }
  return kept
}

// Chaikin corner cutting (ends fixed); `t` (capture time) is interpolated with the position.
export function smoothPath(points, iterations = 2) {
  let current = points
  for (let n = 0; n < iterations && current.length > 2; n++) {
    const next = [current[0]]
    for (let i = 0; i < current.length - 1; i++) {
      const a = current[i], b = current[i + 1], mix = f => ({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, t: a.t === undefined ? undefined : a.t + (b.t - a.t) * f })
      next.push(mix(0.25), mix(0.75))
    }
    next.push(current.at(-1))
    current = next
  }
  return current
}

// Time fraction u at which the curve reaches progress f (curves are monotonic).
function invertEasing(name, f) {
  if (name === 'linear' || f <= 0 || f >= 1) return Math.min(1, Math.max(0, f))
  let low = 0, high = 1
  for (let i = 0; i < 30; i++) { const mid = (low + high) / 2; if (easing(name, mid) < f) low = mid; else high = mid }
  return (low + high) / 2
}

// Times for the points: `recorded` keeps the drawing rhythm, `distance` a constant speed,
// `uniform` equal intervals. `curve` (an easing name) shapes the whole route, not each segment.
export function timePath(points, { start, duration, pacing = 'distance', curve = 'linear' }) {
  if (points.length < 2) return points.map(point => ({ ...point, at: Math.round(start) }))
  const lengths = [0]
  for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y))
  const total = lengths.at(-1), first = points[0].t, span = points.at(-1).t - first
  const fraction = i => (pacing === 'recorded' && span > 0 ? (points[i].t - first) / span : pacing !== 'uniform' && total > 0 ? lengths[i] / total : i / (points.length - 1))
  let previous = -1
  return points.map((point, i) => {
    const at = Math.max(previous + 1, Math.round(start + duration * invertEasing(curve, fraction(i))))
    if (at > MOTION_LIMITS.maxDelay) fail('La trayectoria no cabe en la diapositiva.')
    previous = at
    return { at, x: point.x, y: point.y }
  })
}

// One drawn stroke or clicked route → timed path points, within the object's budget.
// `tolerance` in page px; callers pass a screen-relative value (2.5 px / zoom) so pointer
// quantisation at low zoom does not survive as extra points, while the visible shape does.
export function buildPath(samples, { budget, smooth = false, tolerance = 3, ...timing }) {
  let points = simplifyPath(samples, budget, tolerance)
  if (smooth && points.length > 2) points = simplifyPath(smoothPath(points), budget, tolerance * 0.66)
  return timePath(points, timing)
}

// Path edits (each returns the keyframes field for one patch = one undo step).
export function movePathPoint(object, at, center) {
  const points = positionPath(object)
  if (!points.some(point => point.at === at)) fail('El punto ya no existe.')
  return withPositionPath(object, points.map(point => (point.at === at ? { at, ...center } : point)))
}
export function removePathPoint(object, at) {
  return withPositionPath(object, positionPath(object).filter(point => point.at !== at))
}
export function translatePath(object, dx, dy) {
  return withPositionPath(object, positionPath(object).map(point => ({ ...point, x: point.x + dx, y: point.y + dy })))
}
export function reversePath(object) {
  const points = positionPath(object)
  return withPositionPath(object, points.map((point, i) => ({ at: point.at, x: points[points.length - 1 - i].x, y: points[points.length - 1 - i].y })))
}
// Free instant halfway between two points, or null when they are 1 ms apart or taken.
function freeMiddle(object, a, b) {
  const at = Math.round((a + b) / 2)
  return at > a && at < b && !(object.keyframes ?? []).some(frame => frame.at === at) ? at : null
}
// New point on the segment after point `index`, where the object already is at that instant (no visual change).
export function insertPathPoint(object, index) {
  const points = positionPath(object), a = points[index], b = points[index + 1]
  const at = a && b ? freeMiddle(object, a.at, b.at) : null
  if (at === null) fail('No hay sitio para otro punto en este tramo.')
  return withPositionPath(object, [...points, { at, ...centerAt(object, at) }])
}
export const segmentMiddle = (object, a, b) => { const at = freeMiddle(object, a.at, b.at); return at === null ? null : { at, ...centerAt(object, at) } }
// Same position a little later: the object waits there (half the next segment, or 500 ms at the end).
export function duplicatePathPoint(object, at, slideDuration) {
  const points = positionPath(object), index = points.findIndex(point => point.at === at)
  if (index < 0) fail('El punto ya no existe.')
  const next = points[index + 1]
  const copyAt = next ? freeMiddle(object, at, next.at) : Math.min(slideDuration, at + 500)
  if (copyAt === null || copyAt <= at || (object.keyframes ?? []).some(frame => frame.at === copyAt)) fail('No hay sitio para duplicar este punto.')
  return withPositionPath(object, [...points, { ...points[index], at: copyAt }])
}
// New timing for the whole route between `start` and `start + duration`.
export function retimePath(object, { start, duration, pacing }) {
  const points = positionPath(object)
  if (points.length < 2) fail('El elemento no tiene trayectoria.')
  return withPositionPath(object, timePath(points, { start: start ?? points[0].at, duration: duration ?? points.at(-1).at - points[0].at, pacing }))
}
// Same rhythm in a new total time: every point keeps its fraction of the route.
export function scalePath(object, duration) {
  const points = positionPath(object)
  if (points.length < 2) fail('El elemento no tiene trayectoria.')
  const first = points[0].at, span = points.at(-1).at - first || 1
  let previous = first - 1
  return withPositionPath(object, points.map(point => {
    const at = Math.max(previous + 1, Math.round(first + (point.at - first) * duration / span))
    previous = at
    return { ...point, at }
  }))
}
// Copy/paste of a whole route: relative to its first point, pasted from the target's position at `at`.
export function copyPath(object) {
  const points = positionPath(object)
  return points.length >= 2 ? points.map(point => ({ at: point.at - points[0].at, dx: point.x - points[0].x, dy: point.y - points[0].y })) : null
}
export function pastePath(object, copied, at) {
  const origin = centerAt(object, at)
  return withPositionPath(object, copied.map(point => ({ at: Math.round(at + point.at), x: origin.x + point.dx, y: origin.y + point.dy })))
}
