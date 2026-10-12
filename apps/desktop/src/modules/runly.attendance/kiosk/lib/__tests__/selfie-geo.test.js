import test from 'node:test'
import assert from 'node:assert/strict'
import { encodeUnderCap, scaleToFit } from '../selfie.js'
import { overflowIds, pickUploadable, resolveAttempt } from '../selfie-queue.js'
import { uploadPendingSelfies } from '../selfie-sync.js'
import { pickCoords, waitForPosition } from '../geo.js'

const blobOf = (size) => ({ size })

test('encodeUnderCap lowers quality until the target size fits', async () => {
  const sizes = { 0.85: 300_000, 0.75: 260_000, 0.65: 200_000 }
  const tried = []
  const result = await encodeUnderCap(async (q) => { tried.push(q); return blobOf(sizes[q] ?? 50_000) })
  assert.deepEqual(tried, [0.85, 0.75, 0.65])
  assert.equal(result.quality, 0.65)
})

test('encodeUnderCap returns the smallest blob under the hard cap, or null above it', async () => {
  const under = await encodeUnderCap(async (q) => blobOf(300_000 + q * 1000))
  assert.equal(under.quality, 0.45)
  assert.equal(await encodeUnderCap(async () => blobOf(500_000)), null)
  assert.equal(await encodeUnderCap(async () => null), null)
})

test('scaleToFit caps the longest side at 720 and never upscales', () => {
  assert.deepEqual(scaleToFit(1920, 1080), { width: 720, height: 405 })
  assert.deepEqual(scaleToFit(320, 240), { width: 320, height: 240 })
})

test('waitForPosition resolves with the fix, null on timeout and null on error', async () => {
  assert.deepEqual(await waitForPosition(async () => ({ latitude: 1, longitude: 2 }), 100), { latitude: 1, longitude: 2 })
  const started = Date.now()
  assert.equal(await waitForPosition(() => new Promise(() => {}), 40), null)
  assert.ok(Date.now() - started < 500)
  assert.equal(await waitForPosition(async () => { throw new Error('denied') }, 100), null)
  assert.equal(await waitForPosition(() => { throw new Error('sync') }, 100), null)
})

test('pickCoords prefers a fresh fix and only reuses a recent last-known one', () => {
  const last = { latitude: 5, longitude: 6, at: 1_000_000 }
  assert.deepEqual(pickCoords({ latitude: 1, longitude: 2 }, last, 1_000_100), { latitude: 1, longitude: 2 })
  assert.deepEqual(pickCoords(null, last, 1_000_100), { latitude: 5, longitude: 6 })
  assert.equal(pickCoords(null, last, 1_000_000 + 31 * 60_000), null)
  assert.equal(pickCoords(null, null), null)
})

test('selfie queue: ordering, cap and attempt rules', () => {
  const items = [{ punchId: 'c', createdAt: 3 }, { punchId: 'a', createdAt: 1 }, { punchId: 'b', createdAt: 2 }]
  assert.deepEqual(pickUploadable(items, ['b']).map((s) => s.punchId), ['a', 'c'])
  assert.deepEqual(pickUploadable(items, [], ['a']).map((s) => s.punchId), ['b', 'c'])
  assert.deepEqual(overflowIds(items, 2), ['a'])
  assert.deepEqual(overflowIds(items, 5), [])
  assert.equal(resolveAttempt(0, 201).action, 'delete')
  assert.deepEqual(resolveAttempt(0, 404), { action: 'keep', attempts: 1 })
  assert.deepEqual(resolveAttempt(4, 404), { action: 'drop', attempts: 5 })
  assert.deepEqual(resolveAttempt(2, 0), { action: 'keep', attempts: 3 })
  assert.deepEqual(resolveAttempt(2, 401), { action: 'keep', attempts: 2 })
  assert.equal(resolveAttempt(0, 413).action, 'drop')
})

test('uploadPendingSelfies uploads accepted punches, retries 404 and stops when offline', async () => {
  const rows = new Map([
    ['a', { punchId: 'a', createdAt: 1, attempts: 0, blob: 1 }],
    ['b', { punchId: 'b', createdAt: 2, attempts: 4, blob: 2 }],
    ['c', { punchId: 'c', createdAt: 3, attempts: 0, blob: 3 }],
    ['d', { punchId: 'd', createdAt: 4, attempts: 0, blob: 4 }],
  ])
  const store = {
    list: async () => [...rows.values()],
    put: async (r) => { rows.set(r.punchId, r) },
    remove: async (ids) => { for (const id of ids) rows.delete(id) },
  }
  const statuses = { a: 201, b: 404, c: 0 }
  const called = []
  const upload = async (id) => { called.push(id); const status = statuses[id]; if (status !== 201) throw Object.assign(new Error('x'), { status }) }
  const result = await uploadPendingSelfies({ store, upload, outboxIds: ['d'] })
  assert.deepEqual(called, ['a', 'b', 'c'])
  assert.deepEqual(result, { uploaded: 1, dropped: 1, stopped: true })
  assert.deepEqual([...rows.keys()], ['c', 'd'])
  assert.equal(rows.get('c').attempts, 1)
})
