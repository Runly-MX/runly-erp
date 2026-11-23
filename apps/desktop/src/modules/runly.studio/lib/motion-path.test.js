import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sceneAt, validateMotion } from '../../../../../shared/studio/motion.js'
import { buildPath, centerAt, copyPath, duplicatePathPoint, insertPathPoint, movePathPoint, pastePath, pathBudget, positionPath, removePathPoint, reversePath, retimePath, scalePath, simplifyPath, timePath, withPositionPath } from './motion-path.js'

const box = (extra = {}) => ({ id: 'a', type: 'rectangle', x: 100, y: 100, width: 40, height: 20, rotation: 0, fill: '#000000', ...extra })
const valid = keyframes => assert.doesNotThrow(() => validateMotion({ keyframes }))
const doc = object => ({ schemaVersion: 8, unit: 'px', page: { width: 800, height: 600, background: '#ffffff', slide: { duration: 5000 } }, objects: [object] })

test('path points are centres and round-trip through keyframes', () => {
  const object = box({ keyframes: withPositionPath(box(), [{ at: 0, x: 120, y: 110 }, { at: 1000, x: 320, y: 210 }]) })
  valid(object.keyframes)
  assert.deepEqual(object.keyframes, [{ at: 0, x: 100, y: 100 }, { at: 1000, x: 300, y: 200 }])
  assert.deepEqual(positionPath(object), [{ at: 0, x: 120, y: 110 }, { at: 1000, x: 320, y: 210 }])
})

test('replacing the path keeps rotation and opacity keyframes', () => {
  const object = box({ keyframes: [{ at: 0, x: 0, rotation: 0 }, { at: 500, opacity: 0.5 }, { at: 2000, x: 50, rotation: 90 }] })
  const frames = withPositionPath(object, [{ at: 1000, x: 10, y: 10 }, { at: 3000, x: 90, y: 10 }])
  valid(frames)
  assert.deepEqual(frames.map(frame => frame.at), [0, 500, 1000, 2000, 3000])
  assert.equal(frames.find(frame => frame.at === 2000).rotation, 90)
  assert.equal(frames.find(frame => frame.at === 2000).x, undefined)
  assert.equal(pathBudget(object), 29)
})

test('simplification keeps corners and respects the budget', () => {
  const samples = []
  for (let i = 0; i <= 100; i++) samples.push({ x: i, y: 0, t: i })
  for (let i = 1; i <= 100; i++) samples.push({ x: 100, y: i, t: 100 + i })
  assert.deepEqual(simplifyPath(samples, 32).map(p => [p.x, p.y]), [[0, 0], [100, 0], [100, 100]])
  const wiggle = Array.from({ length: 2000 }, (_, i) => ({ x: i, y: Math.sin(i / 7) * 40, t: i }))
  assert.ok(simplifyPath(wiggle, 32).length <= 32)
})

test('timing: distance, uniform, recorded and route curve', () => {
  const points = [{ x: 0, y: 0, t: 0 }, { x: 100, y: 0, t: 900 }, { x: 400, y: 0, t: 1000 }]
  assert.deepEqual(timePath(points, { start: 1000, duration: 2000 }).map(p => p.at), [1000, 1500, 3000])
  assert.deepEqual(timePath(points, { start: 0, duration: 2000, pacing: 'uniform' }).map(p => p.at), [0, 1000, 2000])
  assert.deepEqual(timePath(points, { start: 0, duration: 2000, pacing: 'recorded' }).map(p => p.at), [0, 1800, 2000])
  const eased = timePath(points, { start: 0, duration: 2000, curve: 'ease-in' }).map(p => p.at)
  assert.ok(eased[1] > 500 && eased[2] === 2000)
  assert.deepEqual(timePath([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }], { start: 0, duration: 0 }).map(p => p.at), [0, 1, 2])
})

test('a drawn stroke becomes valid keyframes that play the route', () => {
  const samples = Array.from({ length: 600 }, (_, i) => ({ x: 120 + i, y: 110 + Math.sin(i / 30) * 80, t: i * 4 }))
  const object = box()
  const frames = withPositionPath(object, buildPath(samples, { budget: pathBudget(object), smooth: true, start: 0, duration: 3000 }))
  valid(frames)
  assert.ok(frames.length <= 32)
  const end = sceneAt(doc({ ...object, keyframes: frames }), 'page-1', 3000).objects[0]
  assert.ok(Math.abs(end.x + 20 - samples.at(-1).x) < 1 && Math.abs(end.y + 10 - samples.at(-1).y) < 1)
})

test('point edits keep the route valid and consistent', () => {
  const object = box({ keyframes: withPositionPath(box(), [{ at: 0, x: 0, y: 0 }, { at: 1000, x: 100, y: 0 }, { at: 2000, x: 100, y: 100 }]) })
  const at = path => positionPath({ ...object, keyframes: path })
  assert.deepEqual(at(movePathPoint(object, 1000, { x: 50, y: 50 }))[1], { at: 1000, x: 50, y: 50 })
  assert.equal(at(removePathPoint(object, 1000)).length, 2)
  const inserted = { ...object, keyframes: insertPathPoint(object, 0) }
  assert.deepEqual(positionPath(inserted)[1], { at: 500, x: 50, y: 0 })
  assert.deepEqual(centerAt(inserted, 250), centerAt(object, 250))
  assert.deepEqual(at(reversePath(object)).map(p => [p.at, p.x, p.y]), [[0, 100, 100], [1000, 100, 0], [2000, 0, 0]])
  assert.deepEqual(at(duplicatePathPoint(object, 2000, 5000)).at(-1), { at: 2500, x: 100, y: 100 })
  assert.deepEqual(at(retimePath(object, { pacing: 'uniform', duration: 4000 })).map(p => p.at), [0, 2000, 4000])
  assert.deepEqual(at(scalePath(object, 1000)).map(p => p.at), [0, 500, 1000])
  assert.deepEqual(at(scalePath(object, 1)).map(p => p.at), [0, 1, 2])
  const pasted = at(pastePath(box({ id: 'b', x: 400, y: 400 }), copyPath(object), 1000))
  assert.deepEqual(pasted.map(p => [p.at, p.x, p.y]), [[1000, 420, 410], [2000, 520, 410], [3000, 520, 510]])
  assert.equal(removePathPoint({ ...object, keyframes: removePathPoint(object, 1000) }, 0), undefined)
})

test('rotated objects store the top-left that renders the drawn centre', () => {
  const object = box({ rotation: 30 })
  const frames = withPositionPath(object, [{ at: 0, x: 200, y: 200 }, { at: 1000, x: 300, y: 200 }])
  const shown = sceneAt(doc({ ...object, keyframes: frames }), 'page-1', 1000).objects[0]
  assert.ok(Math.abs(centerAt({ ...object, keyframes: frames }, 1000).x - 300) < 0.1)
  assert.ok(Math.abs(shown.x - frames[1].x) < 0.1)
})
