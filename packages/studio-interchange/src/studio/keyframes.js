// Keyframe editing on the v8 contract (pure). Keyframes hold absolute x/y (top-left),
// rotation and opacity, and a scale multiplier; the validator requires 2–32 entries with
// strictly increasing `at`. These helpers keep every result valid and never touch the
// object's base geometry.
import { KEYFRAME_PROPERTIES, MOTION_LIMITS, keyframeValuesAt } from './motion.js'

export const KEYFRAME_KEYS = Object.freeze(Object.keys(KEYFRAME_PROPERTIES))
const clamp = (value, [min, max]) => Math.min(max, Math.max(min, value))
const instant = at => Math.round(Math.min(MOTION_LIMITS.maxDelay, Math.max(0, at)))
const fail = message => { throw new Error(message) }
const sorted = frames => [...frames].sort((a, b) => a.at - b.at)
const clean = values => Object.fromEntries(Object.entries(values).filter(([key, value]) => KEYFRAME_KEYS.includes(key) && Number.isFinite(value)).map(([key, value]) => [key, clamp(value, KEYFRAME_PROPERTIES[key])]))

// Base (design) value of each property: the anchor a first keyframe animates from.
export const baseValues = item => ({ x: item.x, y: item.y, rotation: item.rotation, opacity: item.opacity ?? 1, scale: 1 })
export const keyframeAt = (item, at) => (item.keyframes ?? []).find(frame => frame.at === at) ?? null

// Insert or update the keyframe at `at` with `values` (any subset of x, y, rotation, opacity, scale).
// The first keyframe also adds an anchor with the design values: at 0, or at the slide end when at = 0.
export function setKeyframe(item, at, values, { slideDuration }) {
  const time = instant(at), patch = clean(values)
  if (!Object.keys(patch).length) fail('El keyframe necesita al menos un valor.')
  let frames = (item.keyframes ?? []).map(frame => ({ ...frame }))
  if (!frames.length) {
    const anchorAt = time > 0 ? 0 : instant(Math.max(1, slideDuration)), base = baseValues(item)
    frames = [{ at: anchorAt, ...Object.fromEntries(Object.keys(patch).map(key => [key, base[key]])) }]
  }
  const existing = frames.find(frame => frame.at === time)
  if (existing) Object.assign(existing, patch)
  else {
    if (frames.length >= MOTION_LIMITS.keyframes) fail(`Un elemento admite como máximo ${MOTION_LIMITS.keyframes} keyframes.`)
    frames.push({ at: time, ...patch })
  }
  return sorted(frames)
}

// Keyframe with every property at its current track value (the "add keyframe" button).
export function captureKeyframe(item, at, { slideDuration }) {
  return setKeyframe(item, at, keyframeValuesAt(item, instant(at)), { slideDuration })
}

// Values and curve of one keyframe; `easing: null` returns to linear.
export function updateKeyframe(item, at, patch) {
  const frames = (item.keyframes ?? []).map(frame => ({ ...frame })), frame = frames.find(entry => entry.at === at)
  if (!frame) fail('El keyframe ya no existe.')
  Object.assign(frame, clean(patch))
  if (patch.easing === null) delete frame.easing
  else if (patch.easing !== undefined) frame.easing = patch.easing
  return frames
}

export function moveKeyframe(item, from, to) {
  const time = instant(to), frames = (item.keyframes ?? []).map(frame => ({ ...frame }))
  const frame = frames.find(entry => entry.at === from)
  if (!frame) fail('El keyframe ya no existe.')
  if (time !== from && frames.some(entry => entry.at === time)) fail('Ya hay un keyframe en ese instante.')
  frame.at = time
  return sorted(frames)
}

// Removing down to a single keyframe removes the animation track (the contract needs two).
export function removeKeyframe(item, at) {
  const frames = (item.keyframes ?? []).filter(frame => frame.at !== at)
  return frames.length >= 2 ? frames : undefined
}

// Pasted values keep their semantics: absolute positions stay absolute.
export function pasteKeyframe(item, at, copied, options) {
  const { at: _, easing, ...values } = copied
  const frames = setKeyframe(item, at, values, options), frame = frames.find(entry => entry.at === instant(at))
  if (easing) frame.easing = easing
  return frames
}

export function neighborKeyframe(item, t, direction) {
  const times = (item.keyframes ?? []).map(frame => frame.at)
  return direction > 0 ? times.find(at => at > t) ?? null : [...times].reverse().find(at => at < t) ?? null
}

// Page resize with "escalar contenido": the same similarity transform as the objects
// (uniform factor anchored at the page origin). Only positions are lengths; rotation,
// opacity and the scale multiplier keep their meaning.
export function scaleKeyframes(keyframes, factor) {
  return keyframes?.map(frame => ({ ...frame, ...(frame.x !== undefined ? { x: frame.x * factor } : {}), ...(frame.y !== undefined ? { y: frame.y * factor } : {}) }))
}
