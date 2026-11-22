import { sceneAt } from '../../../../../shared/studio/motion.js'

// What an effect thumbnail draws, derived from the motion engine (pure, cached per preset):
// ghost outlines of key instants, the object at rest, and accents that name the motion —
// direction arrow, rotation arc, scale corners, revealing edges, or the intensity curve of
// an oscillation (what tells Rebotar from Elástica, Pulso from Pulso suave).
const W = 160, H = 100, DURATION = 900, LEAD = 150, SAMPLES = 64
const BOX = { id: 'o', type: 'rectangle', x: 58, y: 27, width: 44, height: 30, rotation: 0, fill: '#000000' }
const PAGE = { id: 'thumb', width: W, height: H, background: '#ffffff', slide: { duration: DURATION + 2 * LEAD } }
const NORM = { move: 8, turn: 15, scale: 0.25 }

export function effectDocument(kind, choice) {
  const effect = choice === 'appear' ? { preset: 'fade', duration: 0 } : { preset: choice, duration: DURATION }
  const easing = kind === 'exit' ? 'ease-in' : kind === 'emphasis' ? 'ease-in-out' : 'ease-out'
  return { schemaVersion: 8, unit: 'px', additionalPages: [], page: PAGE,
    objects: [{ ...BOX, [kind]: { ...effect, delay: LEAD, easing, ...(kind === 'emphasis' ? { repeat: 1 } : {}) } }] }
}

const centerOf = s => {
  const a = (s.rotation * Math.PI) / 180, hw = s.width / 2, hh = s.height / 2
  return [s.x + hw * Math.cos(a) - hh * Math.sin(a), s.y + hw * Math.sin(a) + hh * Math.cos(a)]
}
const inside = ([x, y]) => [Math.min(W - 6, Math.max(6, x)), Math.min(H - 6, Math.max(6, y))]
const unit = ([ax, ay], [bx, by]) => { const length = Math.hypot(bx - ax, by - ay) || 1; return [(bx - ax) / length, (by - ay) / length] }
// Distance from the box centre to its border along u (+3 px of air).
const edge = ([ux, uy]) => Math.min(Math.abs(ux) > 1e-6 ? BOX.width / 2 / Math.abs(ux) : Infinity, Math.abs(uy) > 1e-6 ? BOX.height / 2 / Math.abs(uy) : Infinity) + 3
// Direction changes of a series, ignoring rounding noise (0.2 % of its range).
export function turnsOf(series) {
  const range = Math.max(...series) - Math.min(...series)
  let count = 0, last = 0
  for (let i = 1; i < series.length; i++) {
    const delta = series[i] - series[i - 1]
    if (Math.abs(delta) <= range * 0.002) continue
    const sign = Math.sign(delta)
    if (last && sign !== last) count++
    last = sign
  }
  return count
}

const cache = new Map()
export function describeEffect(kind, choice) {
  const key = `${kind}:${choice}`
  if (!cache.has(key)) cache.set(key, build(kind, choice))
  return cache.get(key)
}

function build(kind, choice) {
  const document = effectDocument(kind, choice), exit = kind === 'exit', enter = kind === 'enter'
  const restItem = { ...BOX }, restCenter = centerOf(restItem)
  const base = { document, restItem, rest: { center: restCenter, width: BOX.width, height: BOX.height }, ghosts: [], accents: [], curve: null, layout: null, solid: restItem, outline: null }
  const at = fraction => sceneAt(document, 'thumb', LEAD + DURATION * fraction).objects[0]
  const row = (items, accents) => ({ ...base, layout: items.map((item, index) => ({ ...BOX, y: 32, width: 30, height: 20, x: 25 + index * 40, ...item })), accents })
  if (choice === 'appear') return row(exit ? [{ x: 45 }, { x: 85, ghost: true }] : [{ x: 45, ghost: true }, { x: 85 }], [{ type: 'time' }])

  const last = exit ? 0.98 : 1
  const samples = Array.from({ length: SAMPLES + 1 }, (_, i) => at((i / SAMPLES) * last))
  let unwrap = 0
  const rotations = samples.map((s, i) => {
    if (i) { const jump = s.rotation - samples[i - 1].rotation; if (jump > 180) unwrap -= 360; else if (jump < -180) unwrap += 360 }
    return s.rotation + unwrap
  })
  const centers = samples.map(centerOf)
  const scales = samples.map(s => s.width / BOX.width - 1)
  const dx = centers.map(c => c[0] - restCenter[0]), dy = centers.map(c => restCenter[1] - c[1])
  const clip = Math.max(0, ...samples.map(s => Math.max(0, ...Object.values(s.clip ?? {}))))
  const peak = series => Math.max(...series.map(Math.abs))

  if (clip > 0.05) {
    const mid = at(exit ? 0.45 : 0.55), c = mid.clip
    const left = mid.x + c.left * mid.width, right = mid.x + mid.width * (1 - c.right), top = mid.y + c.top * mid.height, bottom = mid.y + mid.height * (1 - c.bottom)
    const sides = { left: [[left, (top + bottom) / 2], [-1, 0]], right: [[right, (top + bottom) / 2], [1, 0]], top: [[(left + right) / 2, top], [0, -1]], bottom: [[(left + right) / 2, bottom], [0, 1]] }
    // Entry: the edge travels toward the hidden side; exit: away from it.
    const arrows = Object.entries(c).filter(([, value]) => value > 0.02).map(([side]) => {
      const [[x, y], [ux, uy]] = sides[side], k = exit ? -1 : 1
      return { from: [x - 4 * ux * k, y - 4 * uy * k], to: [x + 7 * ux * k, y + 7 * uy * k] }
    })
    return { ...base, solid: mid, outline: restItem, accents: [{ type: 'edge', arrows }] }
  }

  const channels = { move: Math.max(peak(dx), peak(dy)) / NORM.move, turn: peak(rotations) / NORM.turn, scale: peak(scales) / NORM.scale }
  const moving = Object.values(channels).some(value => value > 0.02)
  if (!moving) return row(exit ? [{ x: 25 }, { x: 65, opacity: 0.4 }, { x: 105, ghost: true }] : [{ x: 25, ghost: true }, { x: 65, opacity: 0.4 }, { x: 105 }], [{ type: 'time' }])

  const dominant = Object.entries(channels).sort((a, b) => b[1] - a[1])[0][0]
  const moveSeries = peak(dx) >= peak(dy) ? dx : dy
  const series = { move: moveSeries, turn: rotations, scale: scales }[dominant]
  const oscillates = turnsOf(series) >= 1
  const far = exit ? samples.length - 1 : 0
  // Emphasis: the largest excursion; entry/exit: the overshoot past rest (not the empty start).
  const extreme = kind === 'emphasis' ? series.reduce((best, value, i) => (Math.abs(value) > Math.abs(series[best]) ? i : best), 0)
    : series.reduce((best, value, i) => (value > series[best] ? i : best), 0)
  const accents = []

  // Translation: from the starting point into place (entry) or from the box outwards (exit).
  const farCenter = centers[far], travel = Math.hypot(farCenter[0] - restCenter[0], farCenter[1] - restCenter[1])
  if (!oscillates && travel > 3) {
    const u = exit ? unit(restCenter, farCenter) : unit(farCenter, restCenter), gap = edge(u)
    const near = exit ? [restCenter[0] + u[0] * gap, restCenter[1] + u[1] * gap] : [restCenter[0] - u[0] * gap, restCenter[1] - u[1] * gap]
    // Arrow length follows the distance travelled (float < slide < fly), within the stage.
    const length = Math.min(32, Math.max(18, travel)), outer = inside([near[0] + u[0] * length * (exit ? 1 : -1), near[1] + u[1] * length * (exit ? 1 : -1)])
    accents.push({ type: 'move', from: exit ? near : outer, to: exit ? outer : near })
  } else if (oscillates && dominant === 'move') {
    const u = unit(restCenter, centers[extreme]), gap = edge(u)
    accents.push({ type: 'move', from: [restCenter[0] + u[0] * gap, restCenter[1] + u[1] * gap], to: [restCenter[0] + u[0] * (gap + 9), restCenter[1] + u[1] * (gap + 9)] })
  }
  // Rotation: an arc over the object in the direction it turns.
  const radius = Math.hypot(BOX.width, BOX.height) / 2 + 5
  const turn = enter ? -rotations[0] : kind === 'emphasis' ? rotations[extreme] : rotations.at(-1)
  if (!oscillates && Math.abs(turn) > 20) {
    const span = Math.sign(turn) * Math.min(300, Math.max(80, Math.abs(turn)))
    accents.push({ type: 'turn', radius, a0: -90 - span / 2, a1: -90 + span / 2 })
  } else if (oscillates && dominant === 'turn') {
    const span = Math.sign(rotations[extreme]) * 60
    accents.push({ type: 'turn', radius, a0: -90 - span / 2, a1: -90 + span / 2 })
  }
  // Scale: corners pointing out when it grows, in when it shrinks.
  const grows = enter ? -scales[0] : kind === 'emphasis' ? scales[extreme] : scales.at(-1)
  if ((!oscillates && Math.abs(grows) > 0.15) || (oscillates && dominant === 'scale') || (oscillates && enter && Math.abs(scales[0]) > 0.15)) accents.push({ type: 'scale', outward: grows > 0 })

  // Ghosts: two instants on the way (fainter = farther), or the extremes of an oscillation.
  const ghosts = oscillates
    ? [samples[extreme], ...(() => { const opposite = series.reduce((best, value, i) => (Math.sign(value) !== Math.sign(series[extreme]) && Math.abs(value) > Math.abs(series[best] ?? 0) ? i : best), -1); return opposite >= 0 && Math.abs(series[opposite]) > Math.abs(series[extreme]) * 0.3 ? [samples[opposite]] : [] })()]
    : (exit ? [0.45, 0.8] : [0.55, 0.2]).map(at)
  const curve = oscillates ? series.map(value => { const v = Math.max(-1, Math.min(1, value / NORM[dominant])); return Math.sign(v) * Math.sqrt(Math.abs(v)) }) : null
  return { ...base, ghosts: ghosts.map((item, index) => ({ ...item, faint: Math.round((index ? 0.3 : 0.55) * (0.35 + 0.65 * (item.opacity ?? 1)) * 100) / 100 })), accents, curve }
}
