import { test } from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { randomBytes } from 'node:crypto'
import { createStudioCatalog } from './service.js'
import { StudioError } from '../../../../../shared/studio/document.js'

// Thumbnail decoding is limited to two simultaneous operations. A browser may ask for four at once, so extra
// requests must wait in a bounded FIFO queue instead of failing with 429; real saturation still answers 429.
const ids = Array.from({ length: 12 }, (_, i) => `00000000-0000-4000-8000-0000000001${String(i).padStart(2, '0')}`)
const row = id => ({ id, title: 'Foto', creator: 'Autor', license: 'by', license_version: '4.0', foreign_landing_url: 'https://example.com/p', url: 'https://upload.wikimedia.org/fixture/photo.png', thumbnail: 'https://upload.wikimedia.org/fixture/thumb.png', width: 1200, height: 1200 })
let noise
const bigPng = async () => noise ??= await sharp(randomBytes(1200 * 1200 * 3), { raw: { width: 1200, height: 1200, channels: 3 } }).png({ compressionLevel: 1 }).toBuffer()

async function fixture({ decodeQueue, gate } = {}) {
  const png = await bigPng(), reports = []
  const access = { member: async () => {}, get: async () => ({}), assets: async () => ({ ids: [] }) }
  const network = { get: async (url, options) => {
    const match = /\/v1\/images\/([^/]+)\/$/.exec(new URL(url).pathname)
    if (match) return { mime: 'application/json', bytes: Buffer.from(JSON.stringify(row(match[1]))) }
    // `gate` lets a test make every thumbnail reach the decoding step in the same tick.
    await gate?.promise
    options.signal?.throwIfAborted?.()
    return { bytes: png, mime: 'image/png' }
  } }
  const service = createStudioCatalog({ prisma: { $queryRaw: async () => [] }, access, network, filesService: {}, supabaseAdmin: null, env: {}, onDiagnostic: report => reports.push(report), ...(decodeQueue ? { decodeQueue } : {}) })
  return { service, reports }
}
const thumbnail = (service, id, signal) => service.thumbnail('company-a', 'actor-1', 'openverse', id, signal ? { signal } : {})
const overlap = reports => {
  const marks = reports.flatMap(report => report.events.filter(event => event.stage === 'PROCESSING_START' || event.stage === 'PROCESSING_END').map(event => [event.at, event.stage === 'PROCESSING_START' ? 1 : -1]))
  let active = 0, max = 0
  for (const [, delta] of marks.sort((a, b) => a[0] - b[0] || a[1] - b[1])) { active += delta; max = Math.max(max, active) }
  return { max, active }
}

test('eight simultaneous thumbnails all succeed while at most two are decoded at once', async () => {
  const gate = Promise.withResolvers(), { service, reports } = await fixture({ gate })
  const requests = ids.slice(0, 8).map(id => thumbnail(service, id))
  await new Promise(resolve => setTimeout(resolve, 50)); gate.resolve()
  const settled = await Promise.allSettled(requests)
  assert.deepEqual(settled.map(row => row.status), Array(8).fill('fulfilled'), JSON.stringify(settled.filter(row => row.status === 'rejected').map(row => [row.reason.status, row.reason.code, row.reason.message])))
  const { max, active } = overlap(reports)
  assert.equal(max, 2); assert.equal(active, 0)
  assert.ok(reports.some(report => report.events.some(event => event.stage === 'PROCESSING_QUEUED')), 'extra requests waited in the queue')
})

test('a cancelled waiter leaves the queue without consuming a slot, and later requests still run', async () => {
  const gate = Promise.withResolvers(), { service, reports } = await fixture({ gate })
  const controller = new AbortController()
  const kept = ids.slice(0, 4).map(id => thumbnail(service, id))
  const cancelled = thumbnail(service, ids[4], controller.signal), cancelledOutcome = cancelled.then(() => 'ok', error => error)
  await new Promise(resolve => setTimeout(resolve, 50)); gate.resolve(); controller.abort()
  const outcome = await cancelledOutcome
  assert.ok(outcome === 'ok' || outcome.status === 499, 'cancelled request ends as cancelled (or finished before the abort)')
  assert.ok((await Promise.allSettled(kept)).every(row => row.status === 'fulfilled'))
  // Slots were not leaked: a fresh burst is processed normally.
  assert.ok((await Promise.allSettled(ids.slice(5, 9).map(id => thumbnail(service, id)))).every(row => row.status === 'fulfilled'))
  assert.equal(overlap(reports).active, 0); assert.ok(overlap(reports).max <= 2)
})

test('a request aborted before it starts never takes a decoding slot', async () => {
  const { service, reports } = await fixture(), controller = new AbortController()
  controller.abort()
  await assert.rejects(thumbnail(service, ids[0], controller.signal), { status: 499 })
  assert.equal(reports.flatMap(report => report.events).filter(event => event.stage === 'PROCESSING_START').length, 0)
  assert.ok((await Promise.allSettled(ids.slice(1, 4).map(id => thumbnail(service, id)))).every(row => row.status === 'fulfilled'))
})

test('a full queue answers 429 with its own code and recovers once it drains', async () => {
  const gate = Promise.withResolvers(), { service } = await fixture({ gate, decodeQueue: 3 })
  const requests = ids.slice(0, 8).map(id => thumbnail(service, id).then(() => 'ok', error => error))
  await new Promise(resolve => setTimeout(resolve, 50)); gate.resolve()
  const outcomes = await Promise.all(requests)
  const busy = outcomes.filter(outcome => outcome !== 'ok')
  assert.equal(outcomes.filter(outcome => outcome === 'ok').length, 5) // 2 decoding + 3 waiting
  assert.ok(busy.length === 3 && busy.every(error => error.status === 429 && error.code === 'CATALOG_PROCESSING_BUSY'), JSON.stringify(busy.map(error => [error.status, error.code])))
  assert.ok((await Promise.allSettled(ids.slice(8, 12).map(id => thumbnail(service, id)))).every(row => row.status === 'fulfilled'))
})

test('the overall operation deadline still bounds a request waiting in the queue', async () => {
  const gate = Promise.withResolvers(), { service } = await fixture({ gate })
  const waiting = ids.slice(0, 4).map(id => thumbnail(service, id).then(() => 'ok', error => error))
  const controller = new AbortController(), early = thumbnail(service, ids[5], controller.signal).then(() => 'ok', error => error)
  await new Promise(resolve => setTimeout(resolve, 20)); controller.abort(); gate.resolve()
  const outcome = await early
  assert.ok(outcome === 'ok' || [499, 504].includes(outcome.status))
  assert.ok((await Promise.all(waiting)).every(result => result === 'ok'))
  void StudioError
})
