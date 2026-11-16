// Studio v8 time model: declarative slide settings and object motion. Pure and
// deterministic (integer milliseconds, fixed easing curves): no browser, Fabric
// or React, so the editor, the presentation player and every future exporter
// evaluate exactly the same values.
import { documentPages, pageId } from './pages.js'

export const SLIDE_LIMITS = Object.freeze({ minDuration: 500, maxDuration: 600_000, defaultDuration: 5000, maxTransition: 3000, defaultTransition: 600 })
export const MOTION_LIMITS = Object.freeze({ maxEffectDuration: 10_000, maxDelay: 600_000, keyframes: 32, effects: 2000, totalKeyframes: 8000, repeat: 20 })
export const EASINGS = Object.freeze(['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out'])
export const SLIDE_TRANSITIONS = Object.freeze(['none', 'fade', 'slide-left', 'slide-right', 'slide-up', 'slide-down', 'zoom'])
// Every entry except `pop` has an Atlas Web Builder EFFECT_PRESETS equivalent (Website export).
export const ENTER_EXIT_PRESETS = Object.freeze(['fade', 'slide-up', 'slide-down', 'slide-left', 'slide-right', 'slide-fade-up', 'slide-fade-down', 'slide-fade-left', 'slide-fade-right', 'zoom-in', 'zoom-out', 'rotate', 'pop'])
export const EMPHASIS_PRESETS = Object.freeze(['pulse', 'spin', 'shake', 'bounce'])
export const KEYFRAME_PROPERTIES = Object.freeze({ x: [-16384, 16384], y: [-16384, 16384], rotation: [-3600, 3600], opacity: [0, 1], scale: [0.02, 8] })
export const MOTION_KEYS = Object.freeze(['enter', 'exit', 'emphasis', 'keyframes'])

const invalid = () => { throw new Error('Configuración de animación no válida.') }
const isPlain = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const int = (value, min, max) => Number.isInteger(value) && value >= min && value <= max
const finite = (value, [min, max]) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max

// Explicit copies: unknown nested keys never persist.
export function validateSlide(value) {
  if (!isPlain(value)) invalid()
  const clean = {}
  if (value.duration !== undefined) {
    if (!int(value.duration, SLIDE_LIMITS.minDuration, SLIDE_LIMITS.maxDuration)) invalid()
    clean.duration = value.duration
  }
  if (value.transition !== undefined) {
    const t = value.transition
    if (!isPlain(t) || !SLIDE_TRANSITIONS.includes(t.type)) invalid()
    const duration = t.duration ?? SLIDE_LIMITS.defaultTransition, easingName = t.easing ?? 'ease-out'
    if (!int(duration, 0, SLIDE_LIMITS.maxTransition) || !EASINGS.includes(easingName)) invalid()
    clean.transition = { type: t.type, duration, easing: easingName }
  }
  return clean
}

function validateEffect(value, presets, emphasis) {
  if (!isPlain(value) || !presets.includes(value.preset)) invalid()
  const duration = value.duration ?? 600, delay = value.delay ?? 0, easingName = value.easing ?? 'ease-out'
  if (!int(duration, 0, MOTION_LIMITS.maxEffectDuration) || !int(delay, 0, MOTION_LIMITS.maxDelay) || !EASINGS.includes(easingName)) invalid()
  const clean = { preset: value.preset, duration, delay, easing: easingName }
  if (emphasis) {
    const repeat = value.repeat ?? 1
    if (!int(repeat, 1, MOTION_LIMITS.repeat)) invalid()
    clean.repeat = repeat
  } else if (value.repeat !== undefined) invalid()
  return clean
}

function validateKeyframes(value) {
  if (!Array.isArray(value) || value.length < 2 || value.length > MOTION_LIMITS.keyframes) invalid()
  let previous = -1
  return value.map(frame => {
    if (!isPlain(frame) || !int(frame.at, 0, MOTION_LIMITS.maxDelay) || frame.at <= previous) invalid()
    previous = frame.at
    const clean = { at: frame.at }
    for (const [key, range] of Object.entries(KEYFRAME_PROPERTIES)) if (frame[key] !== undefined) {
      if (!finite(frame[key], range)) invalid()
      clean[key] = frame[key]
    }
    if (Object.keys(clean).length === 1) invalid()
    if (frame.easing !== undefined) { if (!EASINGS.includes(frame.easing)) invalid(); clean.easing = frame.easing }
    return clean
  })
}

// Motion fields of one object; {} when it has none.
export function validateMotion(object) {
  const clean = {}
  if (object.enter !== undefined) clean.enter = validateEffect(object.enter, ENTER_EXIT_PRESETS, false)
  if (object.exit !== undefined) clean.exit = validateEffect(object.exit, ENTER_EXIT_PRESETS, false)
  if (object.emphasis !== undefined) clean.emphasis = validateEffect(object.emphasis, EMPHASIS_PRESETS, true)
  if (object.keyframes !== undefined) clean.keyframes = validateKeyframes(object.keyframes)
  return clean
}

export const sceneUsesV8 = scene => scene.page.slide !== undefined || scene.objects.some(object => MOTION_KEYS.some(key => object[key] !== undefined))
export const usesV8 = document => documentPages(document).some(sceneUsesV8)

// Static v7 projection for consumers that cannot read v8 yet (portable package v1).
export function projectV7(document) {
  const lost = usesV8(document)
  const strip = scene => {
    const { slide, ...page } = scene.page
    return { page, objects: scene.objects.map(object => Object.fromEntries(Object.entries(object).filter(([key]) => !MOTION_KEYS.includes(key)))) }
  }
  const [first, ...rest] = documentPages(document).map(strip)
  return { document: { ...document, schemaVersion: 7, page: first.page, objects: first.objects, additionalPages: rest }, lost }
}

// CSS-equivalent cubic Bézier curves solved in JS, identical on every platform.
const CURVES = { linear: null, ease: [0.25, 0.1, 0.25, 1], 'ease-in': [0.42, 0, 1, 1], 'ease-out': [0, 0, 0.58, 1], 'ease-in-out': [0.42, 0, 0.58, 1] }
export function easing(name, x) {
  if (!(x > 0)) return 0
  if (x >= 1) return 1
  const curve = CURVES[name]
  if (curve === undefined) throw new Error('Curva de animación desconocida.')
  if (curve === null) return x
  const [x1, y1, x2, y2] = curve
  const bezier = (t, a, b) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3
  // Bisection: monotonic in x for these curves, 40 steps reach float precision.
  let low = 0, high = 1, t = x
  for (let step = 0; step < 40; step++) {
    t = (low + high) / 2
    if (bezier(t, x1, x2) < x) low = t
    else high = t
  }
  return bezier(t, y1, y2)
}

export const slideDuration = page => page.slide?.duration ?? SLIDE_LIMITS.defaultDuration
export const NO_TRANSITION = Object.freeze({ type: 'none', duration: 0, easing: 'linear' })

// Layer state of a slide change. dx/dy are fractions of the stage size;
// direction -1 plays the transition backwards (navigating to the previous slide).
export function transitionAt(transition = NO_TRANSITION, progress, direction = 1) {
  const p = easing(transition.easing ?? 'linear', Math.min(1, Math.max(0, progress)))
  const layer = (opacity = 1, dx = 0, dy = 0, scale = 1) => ({ opacity, dx, dy, scale })
  const slide = { 'slide-left': [1, 0], 'slide-right': [-1, 0], 'slide-up': [0, 1], 'slide-down': [0, -1] }[transition.type]
  if (slide) {
    const [x, y] = slide.map(value => value * direction)
    return { outgoing: layer(1, -x * p, -y * p), incoming: layer(1, x * (1 - p), y * (1 - p)) }
  }
  if (transition.type === 'fade') return { outgoing: layer(1), incoming: layer(p) }
  if (transition.type === 'zoom') return { outgoing: layer(1), incoming: layer(p, 0, 0, 0.85 + 0.15 * p) }
  return { outgoing: layer(p >= 1 || transition.duration === 0 ? 0 : 1), incoming: layer(1) }
}

export function presentationSequence(document) {
  return documentPages(document).map(scene => ({
    pageId: pageId(scene),
    duration: slideDuration(scene.page),
    transition: scene.page.slide?.transition ?? NO_TRANSITION,
  }))
}

// ---------------------------------------------------------------------------
// Scene evaluation: sceneAt(document, pageId, t) → static {page, objects}.
// Rules (docs/superpowers/plans/2026-11-16-studio-next-phase2-motion-engine.md):
// t is clipped to the slide; base → keyframes → enter → emphasis → exit; offsets
// add, opacity and scale multiply, rotations add; effects pivot on the object's
// visual centre (or its group's box centre); rotation in the contract turns
// around the top-left corner, so results are translated back to x/y.
// Same document and t always give the same JSON. The document is never mutated.

const SLIDE_DISTANCE = 0.2, SHAKE_DISTANCE = 0.02, BOUNCE_HEIGHT = 0.06
const round = value => Math.round(value * 1e4) / 1e4 + 0
const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const SCALED = new Set(['text', 'line'])
export const objectHasMotion = object => MOTION_KEYS.some(key => object[key] !== undefined)
export const sceneHasMotion = scene => scene.objects.some(objectHasMotion)

// Visual size: text and lines keep width/height and scale with scaleX/scaleY.
const visualSize = item => SCALED.has(item.type) ? [item.width * (item.scaleX ?? 1), item.height * (item.scaleY ?? 1)] : [item.width, item.height]
function rotate([x, y], degrees) {
  const r = degrees * Math.PI / 180, c = Math.cos(r), s = Math.sin(r)
  return [x * c - y * s, x * s + y * c]
}
function centerOf(x, y, rotation, [w, h]) {
  const [ox, oy] = rotate([w / 2, h / 2], rotation)
  return [x + ox, y + oy]
}
function boxOf(item) {
  const size = visualSize(item)
  const corners = [[0, 0], [size[0], 0], [0, size[1]], size].map(corner => { const [dx, dy] = rotate(corner, item.rotation); return [item.x + dx, item.y + dy] })
  const xs = corners.map(point => point[0]), ys = corners.map(point => point[1])
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}

// Back-out overshoot for `pop`, applied on top of the chosen curve.
const backOut = x => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2 }

// State of an enter/exit preset at p (0 = fully out, 1 = rest). Exits mirror directions.
function presetState(preset, p, page, exit) {
  const out = 1 - p, dir = exit ? -1 : 1, w = page.width * SLIDE_DISTANCE, h = page.height * SLIDE_DISTANCE
  const state = { dx: 0, dy: 0, opacity: 1, scale: 1, rotation: 0 }
  if (preset === 'fade' || preset.startsWith('slide-fade-') || ['zoom-in', 'zoom-out', 'rotate'].includes(preset)) state.opacity = p
  if (preset.startsWith('slide-')) {
    const direction = preset.replace('slide-fade-', '').replace('slide-', '')
    if (direction === 'up') state.dy = dir * out * h
    if (direction === 'down') state.dy = -dir * out * h
    if (direction === 'left') state.dx = dir * out * w
    if (direction === 'right') state.dx = -dir * out * w
  }
  if (preset === 'zoom-in') state.scale = 0.5 + 0.5 * p
  if (preset === 'zoom-out') state.scale = 1.5 - 0.5 * p
  if (preset === 'rotate') state.rotation = -90 * out * dir
  if (preset === 'pop') { state.scale = Math.max(0, backOut(p)); state.opacity = Math.min(1, p * 4) }
  return state
}

function emphasisState(preset, u, page) {
  const state = { dx: 0, dy: 0, opacity: 1, scale: 1, rotation: 0 }
  if (preset === 'pulse') state.scale = 1 + 0.12 * Math.sin(Math.PI * u)
  if (preset === 'spin') state.rotation = 360 * u
  if (preset === 'shake') state.dx = Math.sin(2 * Math.PI * 3 * u) * page.width * SHAKE_DISTANCE * (1 - u)
  if (preset === 'bounce') state.dy = -Math.abs(Math.sin(Math.PI * u)) * page.height * BOUNCE_HEIGHT
  return state
}

// Raw progress of an effect window at t; null before it starts.
function progress(effect, t) {
  if (t < effect.delay) return null
  return effect.duration === 0 ? 1 : Math.min(1, (t - effect.delay) / effect.duration)
}

// One property track: hold the first value before it, the last after it; the
// destination keyframe's curve between two keyframes (steps with reduced motion).
function track(frames, key, t, reducedMotion) {
  const points = frames.filter(frame => frame[key] !== undefined)
  if (!points.length) return undefined
  if (t <= points[0].at) return points[0][key]
  const last = points.at(-1)
  if (t >= last.at) return last[key]
  const index = points.findIndex(frame => frame.at > t), a = points[index - 1], b = points[index]
  if (reducedMotion) return a[key]
  return a[key] + (b[key] - a[key]) * easing(b.easing ?? 'linear', (t - a.at) / (b.at - a.at))
}

// Keyframe track values at t before effects (what a keyframe edited at t starts from).
export function keyframeValuesAt(item, t) {
  const frames = item.keyframes ?? []
  return {
    x: track(frames, 'x', t, false) ?? item.x, y: track(frames, 'y', t, false) ?? item.y,
    rotation: track(frames, 'rotation', t, false) ?? item.rotation, opacity: track(frames, 'opacity', t, false) ?? item.opacity ?? 1,
    scale: track(frames, 'scale', t, false) ?? 1,
  }
}

function evaluate(item, t, page, pivots, reducedMotion) {
  const { enter, exit, emphasis, keyframes, ...base } = item
  if (base.hidden || !objectHasMotion(item)) return base
  const frames = keyframes ?? []
  const x = track(frames, 'x', t, reducedMotion) ?? base.x, y = track(frames, 'y', t, reducedMotion) ?? base.y
  const rotation = track(frames, 'rotation', t, reducedMotion) ?? base.rotation
  let opacity = track(frames, 'opacity', t, reducedMotion) ?? base.opacity ?? 1
  const scale = track(frames, 'scale', t, reducedMotion) ?? 1
  let dx = 0, dy = 0, turn = 0, effectScale = 1, hidden = false
  const apply = state => { dx += state.dx; dy += state.dy; opacity *= state.opacity; effectScale *= state.scale; turn += state.rotation }
  if (enter) {
    const raw = progress(enter, t)
    if (raw === null) hidden = true
    else if (!reducedMotion) apply(presetState(enter.preset, easing(enter.easing, raw), page, false))
  }
  if (emphasis && !reducedMotion) {
    const raw = progress(emphasis, t)
    if (raw !== null && raw < 1) apply(emphasisState(emphasis.preset, easing(emphasis.easing, (raw * emphasis.repeat) % 1), page))
  }
  if (exit) {
    const raw = progress(exit, t)
    if (raw === 1) hidden = true
    else if (raw !== null && !reducedMotion) apply(presetState(exit.preset, 1 - easing(exit.easing, raw), page, true))
  }
  // Keyframe scale pivots on the object's own centre; effects on the object or group pivot.
  const size = visualSize(base), center = centerOf(x, y, rotation, size)
  const pivot = (base.groupId && pivots.get(base.groupId)) || center
  const [rx, ry] = rotate([(center[0] - pivot[0]) * effectScale, (center[1] - pivot[1]) * effectScale], turn)
  const factor = scale * effectScale
  const result = { ...base, hidden }
  // At rest an object equals its design: opacity is only written when it has a value.
  const finalOpacity = round(clamp(opacity, 0, 1))
  if (base.opacity !== undefined || finalOpacity !== 1) result.opacity = finalOpacity
  if (SCALED.has(base.type)) { result.scaleX = round(clamp((base.scaleX ?? 1) * factor, 0.02, 8)); result.scaleY = round(clamp((base.scaleY ?? 1) * factor, 0.02, 8)) }
  else { result.width = round(clamp(base.width * factor, 1, 16384)); result.height = round(clamp(base.height * factor, 1, 16384)) }
  const finalRotation = (rotation + turn) % 360
  const [ox, oy] = rotate(visualSize(result).map(value => value / 2), finalRotation)
  result.x = round(clamp(pivot[0] + rx + dx - ox, -16384, 16384))
  result.y = round(clamp(pivot[1] + ry + dy - oy, -16384, 16384))
  result.rotation = round(finalRotation)
  return result
}

export function sceneAt(document, id, time, { reducedMotion = false } = {}) {
  const scene = documentPages(document).find(candidate => pageId(candidate) === id)
  if (!scene) throw new Error('La página ya no existe.')
  // Clipped to the slide: effects that end later are cut visually, the data is untouched.
  const t = clamp(Number.isFinite(time) ? time : 0, 0, slideDuration(scene.page))
  // Group pivots come from the base geometry so every member turns around the same point.
  const boxes = new Map()
  for (const item of scene.objects) if (item.groupId) {
    const [a, b, c, d] = boxOf(item), box = boxes.get(item.groupId)
    boxes.set(item.groupId, box ? [Math.min(box[0], a), Math.min(box[1], b), Math.max(box[2], c), Math.max(box[3], d)] : [a, b, c, d])
  }
  const pivots = new Map([...boxes].map(([group, [a, b, c, d]]) => [group, [(a + c) / 2, (b + d) / 2]]))
  return { page: scene.page, objects: scene.objects.map(item => evaluate(item, t, scene.page, pivots, reducedMotion)) }
}

// Slide timing for players and future exporters: duration and whether objects animate.
export function slideTiming(document, id) {
  const scene = documentPages(document).find(candidate => pageId(candidate) === id)
  return scene ? { duration: slideDuration(scene.page), animated: sceneHasMotion(scene) } : null
}
