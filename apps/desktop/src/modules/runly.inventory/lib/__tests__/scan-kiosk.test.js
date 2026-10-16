import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  announceResult, cameraErrorKind, cameraStatus, decideManualEntry, feedbackTone, filterRows, isExactIdentifier, itemFromSearchRow,
  readFlag, writeFlag,
} from '../scan-kiosk.js'
import { sessionReducer } from '../scan-session.js'

const TOKEN = 'b'.repeat(43)
const laptop = { id: 'i1', name: 'Laptop Dell', folio: 'LAP-1', assetTag: 'AT-1', serialNumber: 'SN-1' }
const monitor = { id: 'i2', name: 'Monitor Dell', folio: 'MON-1' }

describe('manual entry decision', () => {
  it('sends codes typed faster than the debounce (wedge scanners) to the exact lookup', () => {
    assert.deepEqual(decideManualEntry({ text: ' lap-1\r', ready: false }), { kind: 'resolve', code: 'lap-1' })
    assert.deepEqual(decideManualEntry({ text: '   ' }), { kind: 'none' })
  })

  it('resolves Runly links and exact identifiers, even with suggestions loaded', () => {
    const link = `https://erp.example.com/app/p/inv/${TOKEN}`
    assert.equal(decideManualEntry({ text: link, suggestions: [laptop, monitor], ready: true }).kind, 'resolve')
    assert.equal(decideManualEntry({ text: 'sn-1', suggestions: [laptop, monitor], ready: true }).kind, 'resolve')
    assert.ok(isExactIdentifier(laptop, ' at-1 '))
    assert.ok(!isExactIdentifier(laptop, 'lap'))
  })

  it('picks the highlighted or the only suggestion, else asks to choose', () => {
    assert.deepEqual(decideManualEntry({ text: 'dell', suggestions: [laptop, monitor], ready: true, activeIndex: 1 }), { kind: 'pick', item: monitor })
    assert.deepEqual(decideManualEntry({ text: 'monitor', suggestions: [monitor], ready: true }), { kind: 'pick', item: monitor })
    assert.deepEqual(decideManualEntry({ text: 'dell', suggestions: [laptop, monitor], ready: true }), { kind: 'choose' })
    // Nothing matches anywhere: still recorded as "No encontrado".
    assert.equal(decideManualEntry({ text: 'XYZ-9', suggestions: [], ready: true }).kind, 'resolve')
  })

  it('shapes a list row like a resolved item', () => {
    const item = itemFromSearchRow({ ...laptop, location: { name: 'Bodega' }, category: { name: 'Laptop' }, extra: 1 })
    assert.equal(item.locationName, 'Bodega')
    assert.equal(item.categoryName, 'Laptop')
    assert.equal(item.extra, undefined)
    assert.equal(itemFromSearchRow(null), null)
  })
})

describe('kiosk preferences', () => {
  it('persists flags and survives a blocked storage', () => {
    const store = new Map()
    const storage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) }
    assert.equal(readFlag('m', false, storage), false)
    writeFlag('m', true, storage)
    assert.equal(readFlag('m', false, storage), true)
    const broken = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
    assert.equal(readFlag('m', true, broken), true)
    assert.doesNotThrow(() => writeFlag('m', true, broken))
  })
})

describe('camera status and feedback', () => {
  it('derives the status chip', () => {
    assert.equal(cameraStatus({ enabled: false }), 'off')
    assert.equal(cameraStatus({ enabled: true, error: 'denied' }), 'denied')
    assert.equal(cameraStatus({ enabled: true, paused: true }), 'paused')
    assert.equal(cameraStatus({ enabled: true, starting: true }), 'starting')
    assert.equal(cameraStatus({ enabled: true }), 'scanning')
    assert.equal(cameraErrorKind({ name: 'NotAllowedError' }), 'denied')
    assert.equal(cameraErrorKind({ name: 'NotFoundError' }), 'unavailable')
    assert.equal(cameraErrorKind(new Error('unsupported')), 'unavailable')
    assert.equal(cameraErrorKind({ name: 'NotReadableError' }), 'failed')
  })

  it('maps read states to tones and announcements', () => {
    assert.equal(feedbackTone('added'), 'ok')
    assert.equal(feedbackTone('duplicate'), 'duplicate')
    assert.equal(feedbackTone('error'), 'missing')
    assert.equal(feedbackTone('loading'), null)
    assert.equal(announceResult({ state: 'added', item: laptop }), 'Encontrado: Laptop Dell, folio LAP-1. Agregado a la lista.')
    assert.equal(announceResult({ state: 'duplicate', item: laptop, reads: 3 }), 'Ya está en la lista: Laptop Dell, folio LAP-1. Leído 3 veces.')
    assert.equal(announceResult({ state: 'missing', code: 'XYZ' }), 'No encontrado: XYZ.')
  })
})

describe('session list filter and undo', () => {
  it('filters and restores a removed row in place', () => {
    let rows = sessionReducer([], { type: 'add', result: { code: 'LAP-1', item: laptop } })
    rows = sessionReducer(rows, { type: 'add', result: { code: 'XYZ', item: null } })
    rows = sessionReducer(rows, { type: 'add', result: { code: 'MON-1', item: monitor } })
    assert.deepEqual(filterRows(rows, 'missing').map((r) => r.key), ['code:xyz'])
    assert.equal(filterRows(rows, 'matched').length, 2)
    assert.equal(filterRows(rows, 'all').length, 3)
    const removed = rows[1]
    const after = sessionReducer(rows, { type: 'remove', key: removed.key })
    const restored = sessionReducer(after, { type: 'restore', row: removed, index: 1 })
    assert.deepEqual(restored.map((r) => r.key), rows.map((r) => r.key))
    // Already back (read again): no duplicate.
    assert.equal(sessionReducer(restored, { type: 'restore', row: removed, index: 0 }).length, 3)
  })
})
