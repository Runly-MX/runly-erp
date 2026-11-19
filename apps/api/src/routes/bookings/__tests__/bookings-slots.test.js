import test from 'node:test'
import assert from 'node:assert/strict'
import { cutSlots, intersect, resourceWindows, subtract, union, fitsWindow } from '../bookings-slots.js'

const H = 3600000, M = 60000
const r = (start, end) => ({ start: start * H, end: end * H })

test('interval algebra is half-open: adjacent ranges merge, touching ranges do not overlap', () => {
  assert.deepEqual(union([r(9, 10)], [r(10, 11)]), [r(9, 11)])
  assert.deepEqual(intersect([r(9, 12)], [r(11, 14)]), [r(11, 12)])
  assert.deepEqual(intersect([r(9, 10)], [r(10, 11)]), [])
  assert.deepEqual(subtract([r(9, 17)], [r(12, 13)]), [r(9, 12), r(13, 17)])
})

test('resource windows: space and resource hours intersect, exceptions open and close', () => {
  const space = { rules: [r(9, 17)], closed: [r(12, 13)] }
  assert.deepEqual(resourceWindows({ space, resource: {} }), [r(9, 12), r(13, 17)])
  assert.deepEqual(resourceWindows({ space, resource: { rules: [r(15, 20)] } }), [r(15, 17)])
  assert.deepEqual(resourceWindows({ space, resource: { closed: [r(9, 10)] } }), [r(10, 12), r(13, 17)])
  assert.deepEqual(resourceWindows({ space: { rules: [r(9, 17)], open: [r(17, 19)] }, resource: {} }), [r(9, 19)])
  assert.deepEqual(resourceWindows({ space: {}, resource: {} }), [])
})

test('slots: consecutive services fit back to back, buffers and busy ranges remove candidates', () => {
  const windows = [r(9, 12)]
  const plain = cutSlots({ windows, durationMs: H, stepMs: H })
  assert.deepEqual(plain.map((s) => s.start / H), [9, 10, 11])
  const busy = cutSlots({ windows, busy: [r(10, 11)], durationMs: H, stepMs: H })
  assert.deepEqual(busy.map((s) => s.start / H), [9, 11])
  const buffered = cutSlots({ windows, busy: [r(10, 11)], durationMs: H, stepMs: H, bufferAfterMs: 15 * M })
  assert.deepEqual(buffered.map((s) => s.start / H), [11])
  const lead = cutSlots({ windows, durationMs: H, stepMs: 30 * M, notBefore: 10 * H, notAfter: 10.5 * H })
  assert.deepEqual(lead.map((s) => s.start / H), [10, 10.5])
})

test('a window crossing midnight is one continuous range', () => {
  const night = [r(20, 26)]
  assert.equal(fitsWindow(night, 23 * H, 25 * H), true)
  assert.deepEqual(cutSlots({ windows: night, durationMs: 2 * H, stepMs: 2 * H }).map((s) => s.start / H), [20, 22, 24])
})
