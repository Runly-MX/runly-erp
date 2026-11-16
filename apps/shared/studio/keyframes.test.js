import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateDocument } from './document.js'
import { easing, sceneAt } from './motion.js'
import { captureKeyframe, moveKeyframe, neighborKeyframe, pasteKeyframe, removeKeyframe, setKeyframe, updateKeyframe } from './keyframes.js'
import { resizeDocument } from './page.js'

const item = { id: 'r', type: 'rectangle', x: 100, y: 200, width: 100, height: 50, rotation: 0, fill: '#ff0000', locked: false, hidden: false }
const options = { slideDuration: 5000 }
const valid = keyframes => validateDocument({ schemaVersion: 8, unit: 'px', page: { id: 'page-1', width: 1000, height: 500, background: '#ffffff' }, objects: [{ ...item, keyframes }], additionalPages: [] })

test('the first keyframe adds an anchor with the design values so the track is valid', () => {
  const frames = setKeyframe(item, 1500, { x: 400, y: 300 }, options)
  assert.deepEqual(frames, [{ at: 0, x: 100, y: 200 }, { at: 1500, x: 400, y: 300 }])
  assert.doesNotThrow(() => valid(frames))
  assert.deepEqual(setKeyframe(item, 0, { opacity: 0 }, options), [{ at: 0, opacity: 0 }, { at: 5000, opacity: 1 }], 'at 0 the anchor goes to the slide end')
  const again = setKeyframe({ ...item, keyframes: frames }, 1500, { x: 500 }, options)
  assert.deepEqual(again[1], { at: 1500, x: 500, y: 300 }, 'same instant updates, other values kept')
  assert.equal(item.keyframes, undefined, 'the item is never mutated')
})

test('move, update, remove, navigate and paste keep the contract valid', () => {
  let frames = setKeyframe(item, 1000, { x: 300 }, options)
  frames = setKeyframe({ ...item, keyframes: frames }, 2000, { x: 600 }, options)
  frames = moveKeyframe({ ...item, keyframes: frames }, 2000, 2500.4)
  assert.deepEqual(frames.map(f => f.at), [0, 1000, 2500])
  assert.throws(() => moveKeyframe({ ...item, keyframes: frames }, 2500, 1000), /Ya hay un keyframe/)
  frames = updateKeyframe({ ...item, keyframes: frames }, 2500, { x: 900, easing: 'ease-in', bogus: 1 })
  assert.deepEqual(frames[2], { at: 2500, x: 900, easing: 'ease-in' })
  assert.equal(updateKeyframe({ ...item, keyframes: frames }, 2500, { easing: null })[2].easing, undefined)
  assert.deepEqual([neighborKeyframe({ ...item, keyframes: frames }, 1000, 1), neighborKeyframe({ ...item, keyframes: frames }, 1000, -1), neighborKeyframe({ ...item, keyframes: frames }, 2500, 1)], [2500, 0, null])
  const pasted = pasteKeyframe({ ...item, keyframes: frames }, 4000, frames[2], options)
  assert.deepEqual(pasted.at(-1), { at: 4000, x: 900, easing: 'ease-in' })
  assert.doesNotThrow(() => valid(pasted))
  assert.equal(removeKeyframe({ ...item, keyframes: [frames[0], frames[1]] }, 1000), undefined, 'one keyframe left removes the track')
  const captured = captureKeyframe({ ...item, keyframes: frames }, 1750, options)
  assert.deepEqual(Object.keys(captured.find(f => f.at === 1750)).sort(), ['at', 'opacity', 'rotation', 'scale', 'x', 'y'])
  assert.equal(captured.find(f => f.at === 1750).x, 300 + (900 - 300) * easing('ease-in', 0.5), 'captures the current track value (destination curve)')
  assert.equal(setKeyframe(item, 1000, { opacity: 7 }, options)[1].opacity, 1, 'values are clamped to the contract')
  let many = []
  for (let i = 1; i <= 31; i++) many = setKeyframe({ ...item, keyframes: many.length ? many : undefined }, i * 100, { x: i }, options)
  assert.equal(many.length, 32)
  assert.throws(() => setKeyframe({ ...item, keyframes: many }, 9000, { x: 1 }, options), /como máximo 32/)
})

test('page resize with scaled content keeps the keyframe trajectory proportional', () => {
  const keyframes = [{ at: 0, x: 100, y: 200, rotation: 0, scale: 1 }, { at: 2000, x: 700, y: 50, rotation: 90, scale: 2, opacity: 0.5 }]
  const document = valid(keyframes), resized = resizeDocument(document, { width: 500, height: 400 }, true)
  const factor = 0.5
  assert.deepEqual(resized.objects[0].keyframes[1], { at: 2000, x: 350, y: 25, rotation: 90, scale: 2, opacity: 0.5 }, 'only positions scale')
  for (const t of [0, 500, 1000, 1500, 2000, 3000]) {
    const before = sceneAt(document, 'page-1', t).objects[0], after = sceneAt(resized, 'page-1', t).objects[0]
    for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(after[key] - before[key] * factor) < 1e-3, `${key} at ${t} ms`)
    assert.equal(after.rotation, before.rotation); assert.equal(after.opacity ?? 1, before.opacity ?? 1)
  }
  assert.equal(resizeDocument(document, { width: 500, height: 400 }).objects[0].keyframes[1].x, 700, 'without scaling content nothing moves')
})
