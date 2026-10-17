import test from 'node:test'
import assert from 'node:assert/strict'
import { chooseFrameTime, formatVideoTime, frameSize, resolveStartAt } from '../videoTime.js'

test('formatVideoTime', () => {
  assert.equal(formatVideoTime(0), '0:00')
  assert.equal(formatVideoTime(NaN), '0:00')
  assert.equal(formatVideoTime(-5), '0:00')
  assert.equal(formatVideoTime(65.9), '1:05')
  assert.equal(formatVideoTime(3600 + 62), '1:01:02')
})

test('chooseFrameTime picks min(10% of the duration, 5 s)', () => {
  assert.equal(chooseFrameTime(20), 2)
  assert.equal(chooseFrameTime(600), 5)
  assert.equal(chooseFrameTime(undefined), 1)
  assert.equal(chooseFrameTime(Infinity), 1)
  assert.ok(Math.abs(chooseFrameTime(0.5) - 0.05) < 1e-9)
})

test('resolveStartAt restarts near the end', () => {
  assert.equal(resolveStartAt(30, 100), 30)
  assert.equal(resolveStartAt(98, 100), 0)
  assert.equal(resolveStartAt(30, NaN), 30)
  assert.equal(resolveStartAt(null, 100), 0)
})

test('frameSize caps the width at 1280', () => {
  assert.deepEqual(frameSize(1920, 1080), { width: 1280, height: 720 })
  assert.deepEqual(frameSize(640, 360), { width: 640, height: 360 })
})
