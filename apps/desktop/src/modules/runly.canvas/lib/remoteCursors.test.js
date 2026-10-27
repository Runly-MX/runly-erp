import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CURSOR_TTL_MS, colorFor, createThrottle, createCursorStore, reduceCursor, visibleCursors } from './remoteCursors.js'

describe('Remote cursors', () => {
  it('assigns a stable color per user', () => {
    assert.equal(colorFor('user-1'), colorFor('user-1'))
    assert.match(colorFor('user-2'), /^#[0-9a-f]{6}$/i)
  })
  it('stores the latest cursor per actor and drops self', () => {
    let state = reduceCursor(new Map(), { actorId: 'u2', pageId: 'p1', x: 1, y: 2, selectedIds: ['a'] }, { selfId: 'u1', now: 100 })
    state = reduceCursor(state, { actorId: 'u1', pageId: 'p1', x: 9, y: 9 }, { selfId: 'u1', now: 100 })
    assert.deepEqual([...state.keys()], ['u2'])
    assert.equal(state.get('u2').at, 100)
  })
  it('shows cursors on the same page that are fresh and still present', () => {
    const state = new Map([
      ['u2', { actorId: 'u2', pageId: 'p1', x: 1, y: 1, selectedIds: [], at: 1000 }],
      ['u3', { actorId: 'u3', pageId: 'p2', x: 1, y: 1, selectedIds: [], at: 1000 }],
      ['u4', { actorId: 'u4', pageId: 'p1', x: 1, y: 1, selectedIds: [], at: 0 }],
    ])
    const presence = [{ id: 'u2', name: 'Ana' }, { id: 'u3', name: 'Luis' }, { id: 'u4', name: 'Eva' }]
    const shown = visibleCursors(state, { pageId: 'p1', presence, now: 1000 + CURSOR_TTL_MS - 1 })
    assert.deepEqual(shown.map((c) => [c.id, c.name]), [['u2', 'Ana']])
  })
  it('throttles to one call per interval and flushes the last value', async () => {
    const calls = []
    const throttled = createThrottle((value) => calls.push(value), 20)
    throttled(1); throttled(2); throttled(3)
    await new Promise((resolve) => setTimeout(resolve, 40))
    assert.deepEqual(calls, [1, 3])
  })
  it('cancels a trailing pointer when the board closes', async () => {
    const calls = [], throttled = createThrottle(value => calls.push(value), 20)
    throttled(1); throttled(2); throttled.cancel()
    await new Promise(resolve => setTimeout(resolve, 40))
    assert.deepEqual(calls, [1])
  })
  it('expires and clears cursor state without React timers or history', context => {
    context.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1000 })
    const store = createCursorStore(), changes = []
    store.setContext({ selfId: 'self', pageId: 'p1', presence: [{ id: 'peer', name: 'Ana' }] })
    const unsubscribe = store.subscribe(() => changes.push(store.getSnapshot()))
    store.update({ actorId: 'peer', pageId: 'p1', x: 1, y: 2, selectedIds: ['shape'] })
    assert.equal(store.getSnapshot()[0].name, 'Ana')
    assert.deepEqual(store.getSnapshot()[0].selectedIds, ['shape'])
    context.mock.timers.tick(CURSOR_TTL_MS)
    assert.deepEqual(store.getSnapshot(), [])
    store.update({ actorId: 'peer', pageId: 'p1', x: 3, y: 4 })
    store.setContext({ selfId: 'self', pageId: 'p2', presence: [{ id: 'peer' }] })
    assert.deepEqual(store.getSnapshot(), [])
    store.clear(); const count = changes.length
    context.mock.timers.tick(CURSOR_TTL_MS * 2)
    assert.equal(changes.length, count)
    unsubscribe()
  })
})
