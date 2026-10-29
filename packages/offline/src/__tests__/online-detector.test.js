import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
import { OnlineDetector } from '../online-detector.js'

test('OnlineDetector - isOnline() reflects navigator.onLine', () => {
  const detector = new OnlineDetector({ getNavigatorOnline: () => true })
  assert.equal(detector.isOnline(), true)

  const offlineDetector = new OnlineDetector({ getNavigatorOnline: () => false })
  assert.equal(offlineDetector.isOnline(), false)
})

test('OnlineDetector - onChange callback fires when state transitions', () => {
  let currentOnline = true
  const detector = new OnlineDetector({ getNavigatorOnline: () => currentOnline })

  const changes = []
  detector.onChange((isOnline) => changes.push(isOnline))

  detector._handleOnline()
  assert.deepEqual(changes, [])  // no change — was already online

  detector._handleOffline()
  assert.deepEqual(changes, [false])

  detector._handleOnline()
  assert.deepEqual(changes, [false, true])
})

test('OnlineDetector - multiple onChange callbacks all fire', () => {
  const detector = new OnlineDetector({ getNavigatorOnline: () => true })
  const calls = []
  detector.onChange((v) => calls.push('a:' + v))
  detector.onChange((v) => calls.push('b:' + v))
  detector._handleOffline()
  assert.deepEqual(calls, ['a:false', 'b:false'])
})

test('OnlineDetector - checkNow probes immediately and reports the result', async () => {
  const realFetch = globalThis.fetch
  let reachable = false
  globalThis.fetch = async () => { if (!reachable) throw new Error('down'); return {} }
  const detector = new OnlineDetector({ getNavigatorOnline: () => false, probeUrl: 'http://api.example/health' })
  try {
    const changes = []
    detector.onChange((v) => changes.push(v))
    assert.equal(await detector.checkNow(), false)
    reachable = true
    assert.equal(await detector.checkNow(), true)
    assert.deepEqual(changes, [true])
  } finally {
    detector.destroy()
    globalThis.fetch = realFetch
  }
})

test('OnlineDetector - hidden tabs skip the periodic probe and check once when shown', async () => {
  const real = { fetch: globalThis.fetch, setInterval: globalThis.setInterval, clearInterval: globalThis.clearInterval, document: globalThis.document }
  const listeners = {}
  let tick = null, probes = 0, visibilityState = 'hidden'
  globalThis.setInterval = (fn) => { tick = fn; return 1 }
  globalThis.clearInterval = () => {}
  globalThis.fetch = async () => { probes++; return {} }
  globalThis.document = { get visibilityState() { return visibilityState }, addEventListener: (e, fn) => { listeners[e] = fn }, removeEventListener: () => {} }
  const detector = new OnlineDetector({ getNavigatorOnline: () => true, probeUrl: 'http://api.example/health' })
  try {
    tick()
    assert.equal(probes, 0)
    visibilityState = 'visible'
    listeners.visibilitychange()
    await new Promise(setImmediate)
    assert.equal(probes, 1)
  } finally {
    detector.destroy()
    Object.assign(globalThis, real)
  }
})

test('OnlineDetector - destroy removes all listeners', () => {
  const detector = new OnlineDetector({ getNavigatorOnline: () => true })
  const calls = []
  detector.onChange((v) => calls.push(v))
  detector.destroy()
  detector._handleOffline()
  assert.deepEqual(calls, [])
})
