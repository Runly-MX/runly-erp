import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateDocument } from './document.js'
import { sceneAt, slideTiming } from './motion.js'

const page = { id: 'page-1', width: 1000, height: 500, background: '#ffffff', slide: { duration: 5000 } }
const rect = (extra = {}) => ({ id: 'r', type: 'rectangle', x: 100, y: 100, width: 200, height: 100, rotation: 0, fill: '#ff0000', ...extra })
const doc = (...objects) => validateDocument({ schemaVersion: 8, unit: 'px', page, objects, additionalPages: [] })
const at = (document, t, options) => sceneAt(document, 'page-1', t, options).objects
const center = o => { const w = o.type === 'text' ? o.width * o.scaleX : o.width, h = o.type === 'text' ? o.height * o.scaleY : o.height, r = o.rotation * Math.PI / 180
  return [o.x + (w / 2) * Math.cos(r) - (h / 2) * Math.sin(r), o.y + (w / 2) * Math.sin(r) + (h / 2) * Math.cos(r)] }
const close = (a, b, label, eps = 1e-3) => assert.ok(Math.abs(a - b) <= eps, `${label}: ${a} vs ${b}`)
// Pinned frame at 1234 ms (checked by hand: b = 500 + 0.766 × 200; c rotates 123.4° and scales 1.617 around its centre).
const GOLDEN_1234 = '[{"id":"a","type":"rectangle","x":109.0003,"y":100,"width":200,"height":100,"rotation":15,"fill":"#ff0000","locked":false,"hidden":false},{"id":"b","type":"rectangle","x":653.2,"y":100,"width":200,"height":100,"rotation":0,"fill":"#ff0000","groupId":"g","locked":false,"hidden":false,"opacity":0.234},{"id":"c","type":"rectangle","x":759.7197,"y":65.4722,"width":323.4,"height":161.7,"rotation":123.4,"fill":"#ff0000","groupId":"g","locked":false,"hidden":false}]'
const linear = (preset, extra = {}) => ({ preset, duration: 1000, delay: 1000, easing: 'linear', ...extra })

test('objects without motion are returned as they are, at any time', () => {
  const document = doc(rect(), { ...rect({ id: 't' }), type: 'text', text: 'Hola', fontSize: 40 })
  for (const t of [0, 2500, 5000, 99_999]) assert.deepEqual(at(document, t), document.objects)
  assert.deepEqual(slideTiming(document, 'page-1'), { duration: 5000, animated: false })
})

test('enter windows: hidden before the delay, interpolated during, at rest after', () => {
  const document = doc(rect({ enter: linear('fade') }))
  assert.equal(at(document, 999)[0].hidden, true)
  assert.equal(at(document, 1500)[0].opacity, 0.5)
  const rest = at(document, 2000)[0], { enter, ...base } = document.objects[0]
  assert.deepEqual(rest, base, 'after the window the object equals its design')
  assert.equal(slideTiming(document, 'page-1').animated, true)
})

test('exit mirrors the enter and hides the object at the end', () => {
  const document = doc(rect({ exit: linear('slide-up') }))
  assert.equal(at(document, 500)[0].y, 100, 'rest before the exit')
  assert.ok(at(document, 1500)[0].y < 100, 'slide-up exit moves up')
  close(at(document, 1500)[0].y, 100 - 0.5 * 500 * 0.2, 'half way')
  assert.equal(at(document, 2000)[0].hidden, true)
  assert.ok(at(doc(rect({ enter: linear('slide-up') })), 1000)[0].y > 100, 'slide-up enter comes from below')
})

test('scale and rotation pivot on the visual centre, also for rotated and text objects', () => {
  const rotated = rect({ rotation: 30, enter: linear('zoom-in') })
  const [start] = at(doc(rotated), 1000), base = rect({ rotation: 30 })
  close(start.width, 100, 'zoom-in starts at half width'); close(start.height, 50, 'half height')
  center(start).forEach((value, i) => close(value, center(base)[i], `zoom keeps centre ${i}`))
  const [turned] = at(doc(rect({ enter: linear('rotate') })), 1000)
  close(turned.rotation, -90, 'rotate starts at -90°')
  center(turned).forEach((value, i) => close(value, center(rect())[i], `rotate keeps centre ${i}`))
  const text = { id: 't', type: 'text', x: 50, y: 60, width: 300, height: 80, rotation: 0, fill: '#000000', text: 'Hola', fontSize: 40, scaleX: 2, scaleY: 2, enter: linear('zoom-in') }
  const [scaledText] = at(doc(text), 1000), baseText = validateDocument({ schemaVersion: 8, unit: 'px', page, objects: [{ ...text, enter: undefined }], additionalPages: [] }).objects[0]
  assert.deepEqual([scaledText.width, scaledText.scaleX, scaledText.fontSize], [300, 1, 40], 'text scales through scaleX, never width or font size')
  center(scaledText).forEach((value, i) => close(value, center(baseText)[i], `text centre ${i}`))
})

test('group members share the group pivot', () => {
  const a = rect({ id: 'a', x: 0, y: 0, width: 100, height: 100, groupId: 'g', enter: linear('rotate') })
  const b = rect({ id: 'b', x: 300, y: 0, width: 100, height: 100, groupId: 'g', enter: linear('rotate') })
  const [ra, rb] = at(doc(a, b), 1000), pivot = [200, 50]
  const distance = o => Math.hypot(center(o)[0] - pivot[0], center(o)[1] - pivot[1])
  close(distance(ra), 150, 'a orbits the group centre'); close(distance(rb), 150, 'b orbits the group centre')
  close(center(ra)[1], 200, 'rotated -90° around the group centre'); close(center(rb)[1], -100, 'b on the other side')
})

test('composition: keyframes then effects; opacity and scale multiply, offsets add', () => {
  const keyframes = [{ at: 0, x: 100, opacity: 1 }, { at: 2000, x: 300, opacity: 0.5 }]
  const [mid] = at(doc(rect({ keyframes, enter: linear('fade') })), 1500)
  close(mid.x, 250, 'keyframe x at 1.5 s'); close(mid.opacity, 0.625 * 0.5, 'keyframe opacity × fade')
  const [held] = at(doc(rect({ keyframes })), 4000)
  assert.deepEqual([held.x, held.opacity], [300, 0.5], 'after the last keyframe the last value holds')
  const [eased] = at(doc(rect({ keyframes: [{ at: 0, x: 0 }, { at: 1000, x: 1000, easing: 'ease-in' }] })), 500)
  assert.ok(eased.x < 500, 'destination keyframe curve applies')
  const [pulse] = at(doc(rect({ emphasis: { preset: 'pulse', duration: 1000, delay: 0, easing: 'linear', repeat: 1 } })), 500)
  close(pulse.width, 224, 'pulse at its peak')
  const [spin] = at(doc(rect({ emphasis: { preset: 'spin', duration: 1000, delay: 0, easing: 'linear', repeat: 2 } })), 250)
  close(spin.rotation, 180, 'two spins in one second: half a turn at 250 ms')
})

test('time is clipped to the slide without touching the data; reduced motion removes movement', () => {
  const document = doc(rect({ enter: { preset: 'fade', duration: 8000, delay: 1000, easing: 'linear' } }))
  const copy = structuredClone(document)
  assert.deepEqual(at(document, 99_000), at(document, 5000), 'after the slide the last visible frame holds')
  close(at(document, 5000)[0].opacity, 0.5, 'effect cut at 5 s of 9 s')
  assert.deepEqual(document, copy, 'document never mutated')
  const calm = doc(rect({ enter: linear('slide-up'), emphasis: { preset: 'spin', duration: 1000, delay: 2500, easing: 'linear', repeat: 1 }, keyframes: [{ at: 0, x: 0 }, { at: 4000, x: 400 }] }))
  const [visible] = at(calm, 1000, { reducedMotion: true }), [spinning] = at(calm, 3000, { reducedMotion: true })
  assert.deepEqual([visible.hidden, visible.y, visible.opacity ?? 1], [false, 100, 1], 'appears without moving')
  assert.equal(spinning.rotation, 0, 'no emphasis'); assert.equal(spinning.x, 0, 'keyframes step')
})

test('frames are deterministic, independent of evaluation order, and valid static scenes', () => {
  const document = doc(
    rect({ id: 'a', rotation: 15, enter: { preset: 'pop', duration: 800, delay: 200, easing: 'ease-out' }, emphasis: { preset: 'shake', duration: 900, delay: 1200, easing: 'ease-in-out', repeat: 3 } }),
    rect({ id: 'b', x: 500, groupId: 'g', enter: linear('slide-fade-left'), exit: { preset: 'zoom-out', duration: 600, delay: 4000, easing: 'ease' } }),
    rect({ id: 'c', x: 700, groupId: 'g', keyframes: [{ at: 0, rotation: 0, scale: 1 }, { at: 3000, rotation: 300, scale: 2.5 }] }))
  const times = Array.from({ length: 51 }, (_, i) => i * 100)
  const forward = times.map(t => JSON.stringify(at(document, t)))
  const backward = [...times].reverse().map(t => JSON.stringify(at(document, t))).reverse()
  assert.deepEqual(forward, backward)
  for (const t of times) validateDocument({ ...document, objects: at(document, t) })
  assert.equal(JSON.stringify(at(document, 1234)), GOLDEN_1234)
})
