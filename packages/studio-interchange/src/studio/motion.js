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
