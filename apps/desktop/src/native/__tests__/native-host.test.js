import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { detectRuntime, isNativeMobile, isBundledDesktop } from '@runly/core/native-runtime'
import { compareVersions, supportsCapability, parseDeepLink, createEventPump } from '../policy.js'
import { resolveEnvironment, makeConfig, nativeBuildEnvironment, useUniversalHost } from '../../../scripts/native-host.mjs'
import { createInstanceManager } from '../../../native-host/shell/manager.js'
import { nativeHostHeaders, NATIVE_CSP } from '../../../native-host/web-policy.js'

test('runtime distinguishes browser, PWA, Desktop, Android, iOS and missing bridge', () => {
  assert.equal(detectRuntime({}), 'web')
  assert.equal(detectRuntime({ navigator: { standalone: true } }), 'pwa')
  assert.equal(detectRuntime({ matchMedia: () => ({ matches: true }) }), 'pwa')
  assert.equal(detectRuntime({ __RUNLY_NATIVE_HOST__: { platform: 'android' } }), 'web')
  const bridge = { __TAURI_INTERNALS__: { invoke() {} } }
  assert.equal(detectRuntime(bridge), 'tauri-desktop')
  for (const platform of ['android', 'ios']) {
    const scope = { ...bridge, __RUNLY_NATIVE_HOST__: { platform } }
    assert.equal(detectRuntime(scope), `tauri-${platform}`)
    assert.equal(isNativeMobile(scope), true)
  }
})

test('release environment cannot be replaced by a user URL or development origin', () => {
  assert.equal(resolveEnvironment('production', 'https://evil.test', 'build'), 'https://app.example.com')
  assert.throws(() => resolveEnvironment('https://evil.test', null, 'build'))
  assert.throws(() => resolveEnvironment('development', 'http://10.0.2.2:5173', 'build'))
  for (const bad of ['https://evil.example', 'http://8.8.8.8', 'javascript:alert(1)', 'http://user:pass@localhost:5173', 'http://localhost:5173/app', 'http://localhost:5173/?url=evil']) {
    assert.throws(() => resolveEnvironment('development', bad, 'dev'))
  }
  assert.equal(resolveEnvironment('development', 'http://192.168.1.5:5173', 'dev'), 'http://192.168.1.5:5173')
})

test('production/staging origins can be overridden by the deployer\'s own environment variables', () => {
  process.env.RUNLY_NATIVE_PRODUCTION_URL = 'https://real-customer-instance.example'
  try {
    assert.equal(resolveEnvironment('production', null, 'build'), 'https://real-customer-instance.example')
  } finally {
    delete process.env.RUNLY_NATIVE_PRODUCTION_URL
  }
  // No env var set -> falls back to the checked-in placeholder, never a real instance.
  assert.equal(resolveEnvironment('production', null, 'build'), 'https://app.example.com')
})

test('remote capability is restricted to main, selected origin/app path, and minimal commands', () => {
  const config = makeConfig('https://app.example.com')
  const [shell, remote] = config.app.security.capabilities
  assert.equal(config.build.frontendDist, '../native-host/dist')
  assert.equal(config.build.devUrl, null)
  assert.equal(remote.local, false)
  assert.deepEqual(remote.windows, ['main'])
  assert.deepEqual(remote.remote.urls, ['https://app.example.com/app/*'])
  assert.ok(!remote.permissions.some((p) => /sql|store|shell|window|allow-host-connect|allow-host-confirm-origin|allow-host-forget-origin/.test(p)))
  assert.deepEqual(shell.permissions, ['allow-host-info', 'allow-host-connect', 'allow-host-confirm-origin', 'allow-host-forget-origin', 'allow-host-servers', 'allow-host-device', 'notification:allow-is-permission-granted'])
  const desktop = JSON.parse(readFileSync(new URL('../../../src-tauri/tauri.conf.json', import.meta.url)))
  assert.equal(desktop.build.frontendDist, '../native-host/dist')
  const windowsRemote = JSON.parse(readFileSync(new URL('../../../src-tauri/capabilities/desktop-remote.json', import.meta.url)))
  assert.equal(windowsRemote.local, false)
  assert.deepEqual(windowsRemote.remote.urls, ['https://*/app/*'])
  assert.ok(!windowsRemote.permissions.some((p) => /sql|store|shell|allow-host-connect|allow-host-confirm-origin|allow-host-servers/.test(p)))
})

test('semantic versions and capability negotiation fail closed', () => {
  assert.equal(compareVersions('1.10.0', '1.9.9'), 1)
  assert.equal(compareVersions('1.0.0-rc.2', '1.0.0-rc.10'), -1)
  assert.equal(compareVersions('1.0.0+web.12', '1.0.0'), 0)
  assert.equal(compareVersions('1.0.0-beta', '1.0.0'), -1)
  assert.throws(() => compareVersions('latest', '1.0.0'))
  assert.throws(() => compareVersions('1.0.0-01', '1.0.0'))
  assert.throws(() => compareVersions('1.0.0-rc..1', '1.0.0'))
  const info = { nativeHostVersion: '1.2.0', bridgeVersion: 1, capabilities: ['haptics'] }
  assert.ok(supportsCapability(info, 'haptics', '1.1.0'))
  assert.equal(supportsCapability(info, 'push'), false)
  assert.equal(supportsCapability(info, 'haptics', '2.0.0'), false)
  assert.equal(supportsCapability({ ...info, bridgeVersion: 2 }, 'haptics'), false)
  assert.equal(supportsCapability(null, 'haptics'), false)
})

test('deep links accept only bounded chat/call IDs without tokens or redirects', () => {
  assert.deepEqual(parseDeepLink('runly://chat/abc-123'), { kind: 'chat', targetId: 'abc-123' })
  for (const value of ['https://app.example.com/app/', 'runly://call/a?token=secret', 'runly://evil/a', 'runly://call/a%2fb', 'runly://call/a/b', 'runly://user@chat/a', 'runly://chat/']) {
    assert.equal(parseDeepLink(value), null, value)
  }
})

test('events ACK only after successful delivery, including retries after mount', async () => {
  let queue = [{ id: 1, kind: 'call', targetId: 'abc' }]
  const pump = createEventPump({ read: async () => queue, acknowledge: async (ids) => { queue = queue.filter((e) => !ids.includes(e.id)) } })
  await pump(async () => false)
  assert.equal(queue.length, 1)
  await assert.rejects(pump(async () => { throw new Error('network') }))
  assert.equal(queue.length, 1)
  await pump(async (event) => { assert.equal(event.targetId, 'abc') })
  assert.equal(queue.length, 0)
})

test('event pump serializes concurrent ticks', async () => {
  let release
  const blocked = new Promise((resolve) => { release = resolve })
  let delivered = 0
  const pump = createEventPump({ read: async () => [{ id: 1, kind: 'chat', targetId: 'abc' }], acknowledge: async () => {} })
  const first = pump(async () => { delivered++; await blocked })
  await pump(async () => { delivered++ })
  release()
  await first
  assert.equal(delivered, 1)
})

test('Vite applies frame restriction only to native host requests', () => {
  let middleware
  nativeHostHeaders().configureServer({ middlewares: { use: (value) => { middleware = value } } })
  for (const [agent, expected] of [['Browser', undefined], ['Mozilla RunlyNativeHost/1.0', NATIVE_CSP]]) {
    const headers = {}
    middleware({ headers: { 'user-agent': agent } }, { setHeader: (k, v) => { headers[k] = v } }, () => {})
    assert.equal(headers['Content-Security-Policy'], expected)
  }
})

test('universal build strips both inherited native origins', () => {
  const env = nativeBuildEnvironment('production', null, { RUNLY_NATIVE_ORIGIN: 'https://old.example.com', ATLAS_NATIVE_ORIGIN: 'https://legacy.example.com', PATH: 'tools' })
  assert.equal(env.RUNLY_NATIVE_ORIGIN, undefined)
  assert.equal(env.ATLAS_NATIVE_ORIGIN, undefined)
  assert.equal(env.PATH, 'tools')
  assert.equal(env.RUNLY_NATIVE_ENV, 'production')
  assert.equal(nativeBuildEnvironment('staging', 'https://qa.example.com', env).RUNLY_NATIVE_ORIGIN, 'https://qa.example.com')
  assert.deepEqual(makeConfig(null).app.security.capabilities[1].remote.urls, ['https://*/app/*'])
})

test('public Android builds default to universal; a fixed production origin requires explicit opt-in', () => {
  assert.equal(useUniversalHost('android', 'build', 'production'), true)
  assert.equal(useUniversalHost('android', 'config', 'production'), true)
  assert.equal(useUniversalHost('android', 'build', 'production', ['--pinned']), false)
  assert.equal(useUniversalHost('android', 'build', 'staging'), false)
  assert.equal(useUniversalHost('ios', 'build', 'production'), false)
  assert.throws(() => useUniversalHost('android', 'build', 'production', ['--universal', '--pinned']))
})

test('remote Windows keeps desktop identity without opening bundled config or SQL stores', () => {
  const legacy = { __TAURI_INTERNALS__: { invoke() {} }, navigator: { userAgent: 'Windows' } }
  const remote = { ...legacy, __RUNLY_NATIVE_HOST__: { platform: 'windows' } }
  assert.equal(detectRuntime(remote), 'tauri-desktop')
  assert.equal(isBundledDesktop(legacy), true)
  assert.equal(isBundledDesktop(remote), false)
  assert.equal(isBundledDesktop({}), false)
})

function fixture(registry = { instances: [], activeOrigin: null }, overrides = {}) {
  const calls = []
  const manager = createInstanceManager(async (command, args) => {
    calls.push([command, args])
    if (overrides[command]) return overrides[command](args)
    if (command === 'host_info') return { nativeHostVersion: '1.2.0' }
    if (command === 'host_servers') return registry
    if (command === 'host_connect') return { status: 'pending_confirmation', origin: args.origin }
    return null
  })
  return { manager, calls }
}

test('clean installation prompts without attempting any fixed instance', async () => {
  const { manager, calls } = fixture()
  await manager.initialize('')
  assert.equal(manager.getSnapshot().phase, 'manager')
  assert.equal(calls.some(([command]) => command === 'host_connect'), false)
})

test('manager and fallback never automatically reconnect a saved instance', async () => {
  for (const hash of ['#manage', '#device', '#failed']) {
    const { manager, calls } = fixture({ instances: [{ origin: 'https://a.example.com' }], activeOrigin: 'https://a.example.com' })
    await manager.initialize(hash)
    assert.equal(manager.getSnapshot().phase, 'manager')
    assert.equal(calls.some(([command]) => command === 'host_connect'), false)
  }
})

test('normal startup reconnects using the persisted origin in native storage', async () => {
  const { manager, calls } = fixture({ instances: [{ origin: 'https://a.example.com' }], activeOrigin: 'https://a.example.com' }, { host_connect: () => ({ status: 'connected' }) })
  await manager.initialize('')
  assert.deepEqual(calls.at(-1), ['host_connect', { origin: null, name: null }])
  assert.equal(manager.getSnapshot().phase, 'connecting')
})

test('new instance requires confirmation; cancel clears the native candidate', async () => {
  const { manager, calls } = fixture()
  await manager.initialize('#manage')
  await manager.connect('https://b.example.com', 'Oficina')
  assert.equal(manager.getSnapshot().phase, 'confirm')
  assert.equal(calls.some(([command]) => command === 'host_confirm_origin'), false)
  await manager.cancel()
  assert.equal(calls.at(-1)[0], 'host_cancel_origin')
  assert.equal(manager.getSnapshot().pending, null)
  await manager.connect('https://b.example.com')
  await manager.confirm()
  assert.equal(calls.at(-1)[0], 'host_confirm_origin')
})

test('storage failure is surfaced and does not pretend reset succeeded', async () => {
  const { manager } = fixture(undefined, { host_forget_origin: () => { throw 'STORAGE_FAILED' } })
  await manager.initialize('#manage')
  await manager.reset()
  assert.equal(manager.getSnapshot().diagnostic, 'STORAGE_FAILED')
  assert.equal(manager.getSnapshot().busy, false)
})

test('simultaneous connect attempts are serialized and network failure recovers', async () => {
  let finish
  const preflight = new Promise((resolve) => { finish = resolve })
  const { manager, calls } = fixture(undefined, { host_connect: async () => { await preflight; throw 'NETWORK_TLS_OR_TIMEOUT' } })
  await manager.initialize('#manage')
  const first = manager.connect('https://a.example.com')
  await manager.connect('https://b.example.com')
  finish(); await first
  assert.equal(calls.filter(([command]) => command === 'host_connect').length, 1)
  assert.match(manager.getSnapshot().error, /certificado/)
  assert.equal(manager.getSnapshot().phase, 'manager')
})
