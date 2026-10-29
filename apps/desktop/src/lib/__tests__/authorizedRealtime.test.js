import { test } from 'node:test'
import assert from 'node:assert/strict'
import { authorizeRealtimeClient } from '../authorizedRealtime.js'

test('protected sockets rotate grants, relay every write and stop all timers on logout', async () => {
  const original = { fetch: globalThis.fetch, setInterval: globalThis.setInterval, clearInterval: globalThis.clearInterval }
  const timers = new Set(), sockets = [], requests = []
  let revision = '1', allowed = true, identityProtocol = 1
  globalThis.setInterval = (fn) => { timers.add(fn); return fn }
  globalThis.clearInterval = (fn) => timers.delete(fn)
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options })
    return { ok: !options.body || allowed, json: async () => ({ revision, identityProtocol, data: {} }) }
  }
  const client = {
    auth: { getSession: async () => ({ data: { session: { access_token: 'fixture-only' } } }) },
    channel: (topic) => {
      const socket = { topic: `realtime:${topic}`, on() { return socket }, subscribe() { return socket }, send() { assert.fail('native sends bypass authorization') } }
      sockets.push(socket)
      return socket
    },
    getChannels: () => sockets,
    removeChannel: async (socket) => { sockets.splice(sockets.indexOf(socket), 1); return 'ok' },
  }
  try {
    authorizeRealtimeClient(client)
    const rotations = []
    const stopListening = client.onRealtimeRevision((value) => rotations.push(value))
    const channel = client.channel('chat:presence:room').subscribe()
    client.channel('company:00000000-0000-7000-8000-000000000000:events').subscribe()
    await new Promise(setImmediate)
    assert.equal(sockets[0].topic, 'realtime:chat:presence:room@1')
    assert.equal(channel.identityProtocol,1)
    // Every channel and listener shares one timer and one revision request.
    assert.equal(timers.size, 1)
    assert.equal(requests.filter((r) => r.url.endsWith('/realtime/revision')).length, 1)
    revision = '2'
    identityProtocol = undefined
    await Promise.all([...timers].map((fn) => fn()))
    assert.equal(requests.filter((r) => r.url.endsWith('/realtime/revision')).length, 2)
    assert.deepEqual(rotations, ['2'])
    stopListening()
    await client.removeChannel(client.getChannels().at(-1))
    assert.equal(sockets.length, 1)
    assert.equal(sockets[0].topic, 'realtime:chat:presence:room@2')
    assert.equal(channel.identityProtocol,0)
    assert.equal(await channel.send({ event: 'typing', payload: { isTyping: true } }), 'ok')
    assert.equal(requests.at(-1).options.headers.Authorization, 'Bearer fixture-only')
    allowed = false
    assert.equal(await channel.send({ event: 'typing', payload: {} }), 'error')
    await client.removeAllChannels()
    assert.equal(timers.size, 0)
    assert.equal(sockets.length, 0)
    assert.equal(client.getChannels().length, 0)
  } finally {
    await client.removeAllChannels()
    Object.assign(globalThis, original)
  }
})

test('one tracked heartbeat carries the revision and falls back to the GET when it cannot', async () => {
  const original = { fetch: globalThis.fetch, setInterval: globalThis.setInterval, clearInterval: globalThis.clearInterval }
  const timers = new Set(), sockets = [], requests = []
  let revision = '1', presenceMode = 'combined'
  globalThis.setInterval = (fn) => { timers.add(fn); return fn }
  globalThis.clearInterval = (fn) => timers.delete(fn)
  globalThis.fetch = async (url, options) => {
    const body = options.body ? JSON.parse(options.body) : null
    requests.push({ url, body })
    if (url.endsWith('/realtime/presence') && presenceMode === 'denied') return { ok: false, json: async () => ({}) }
    const carries = url.endsWith('/realtime/revision') || (presenceMode === 'combined' && body?.revision === true)
    return { ok: true, json: async () => ({ data: {}, ...(carries ? { revision, identityProtocol: 1 } : {}) }) }
  }
  const client = {
    auth: { getSession: async () => ({ data: { session: { access_token: 'fixture-only' } } }) },
    channel: (topic) => {
      const socket = { topic: `realtime:${topic}`, on() { return socket }, subscribe() { return socket } }
      sockets.push(socket)
      return socket
    },
    getChannels: () => sockets,
    removeChannel: async (socket) => { sockets.splice(sockets.indexOf(socket), 1); return 'ok' },
  }
  const count = (path) => requests.filter((r) => r.url.endsWith(path)).length
  const tick = async () => { requests.length = 0; await Promise.all([...timers].map((fn) => fn())) }
  try {
    authorizeRealtimeClient(client)
    const company = client.channel('company:00000000-0000-7000-8000-000000000000:presence').subscribe()
    const room = client.channel('chat:presence:room').subscribe()
    client.channel('user:me:events').subscribe()
    await new Promise(setImmediate)
    await company.track({})
    await room.track({})

    // New API: one presence per tracked channel, no separate revision GET.
    await tick()
    assert.equal(count('/realtime/revision'), 0)
    assert.equal(count('/realtime/presence'), 2)
    assert.equal(requests.filter((r) => r.body?.revision === true).length, 1)
    revision = '2'
    await tick()
    assert.deepEqual(sockets.map((s) => s.topic.split('@')[1]), ['2', '2', '2'])

    // Older API ignores the flag: the GET comes back, presence is not repeated.
    presenceMode = 'legacy'
    revision = '3'
    await tick()
    assert.equal(count('/realtime/revision'), 1)
    assert.equal(count('/realtime/presence'), 2)
    assert.deepEqual(sockets.map((s) => s.topic.split('@')[1]), ['3', '3', '3'])

    // A denied heartbeat never validates the session; the GET still rotates channels.
    presenceMode = 'denied'
    revision = '4'
    await tick()
    assert.equal(count('/realtime/revision'), 1)
    assert.deepEqual(sockets.map((s) => s.topic.split('@')[1]), ['4', '4', '4'])
  } finally {
    await client.removeAllChannels()
    Object.assign(globalThis, original)
  }
})
