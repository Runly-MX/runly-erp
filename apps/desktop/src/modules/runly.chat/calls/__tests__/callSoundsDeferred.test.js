import test from 'node:test'
import assert from 'node:assert/strict'

test('call sounds download nothing until enableCallSounds (login screen stays light), unlock works before', async () => {
  const fetched = []
  const elements = []
  globalThis.fetch = async (url) => { fetched.push(url); return { ok: true, arrayBuffer: async () => new ArrayBuffer(1) } }
  globalThis.Audio = class { constructor(src) { this.src = src; elements.push(this); this.loaded = false } load() { this.loaded = true } setAttribute() {} }
  globalThis.AudioContext = class { state = 'suspended'; async resume() { this.state = 'running' } decodeAudioData() { return Promise.resolve({}) } }
  const { unlockCallSounds, enableCallSounds } = await import('../callSounds.js')

  assert.equal(await unlockCallSounds(), true) // first gesture on the login form
  assert.equal(fetched.length, 0)
  assert.equal(elements.length, 0)

  enableCallSounds() // authenticated shell mounted
  assert.equal(elements.length, 4)
  assert.ok(elements.every((e) => e.loaded))
  await new Promise((r) => setTimeout(r, 0))
  assert.equal(fetched.length, 4) // context was already unlocked: buffers prefetched now
})
