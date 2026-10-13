import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as Y from 'yjs'
import { flushNoteSave } from '../flushNoteSave.js'
import { base64ToBytes, bytesToBase64 } from '../SupabaseYjsProvider.js'

const ref = current => ({ current })
const tick = () => new Promise(resolve => setImmediate(resolve))
const gate = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function fixture(options = {}) {
  const calls = [], invalidations = [], errors = []
  const state = { pendingRef: ref(null), ydocDirtyRef: ref(false), savingRef: ref(false), rerunRef: ref(false), flushRef: ref(null), capturedYDocRef: ref(null) }
  const args = { readOnly: false, noteId: 'note-a', token: 'fixture-token', ydoc: null, provider: null,
    notes: { update: async (...values) => { calls.push(['html', ...values]) }, saveYDoc: async (...values) => { calls.push(['y', ...values]) } },
    queryClient: { invalidateQueries: value => invalidations.push(value) }, state,
    logger: { warn: (...values) => errors.push(values), error: (...values) => errors.push(values) }, ...options }
  const flush = () => flushNoteSave(args)
  state.flushRef.current = flush
  return { args, state, flush, calls, invalidations, errors }
}
const snapshot = title => ({ title, content: `<p>${title}</p>`, contentText: title })

test('flush guards readOnly, absent identity/token and empty state', async () => {
  for (const options of [{ readOnly: true }, { noteId: null }, { token: null }]) {
    const f = fixture(options)
    f.state.pendingRef.current = snapshot('pending')
    await f.flush()
    assert.equal(f.calls.length, 0)
    assert.equal(f.state.pendingRef.current.title, 'pending')
  }
  const f = fixture()
  await f.flush()
  assert.equal(f.calls.length, 0)
})

test('HTML save retains destination, clears pending state and invalidates caches', async () => {
  const f = fixture()
  f.state.pendingRef.current = snapshot('first')
  await f.flush()
  assert.deepEqual(f.calls, [['html', 'note-a', snapshot('first'), 'fixture-token']])
  assert.equal(f.state.pendingRef.current, null)
  assert.equal(f.state.savingRef.current, false)
  assert.deepEqual(f.invalidations, [{ queryKey: ['notes'] }, { queryKey: ['notes', 'note-a'] }])
})

test('failed HTML remains pending for an explicitly requested retry', async () => {
  const f = fixture()
  let attempts = 0
  f.args.notes.update = async () => { if (++attempts === 1) throw new Error('fixture outage') }
  f.state.pendingRef.current = snapshot('first')
  await f.flush()
  assert.equal(f.state.pendingRef.current.title, 'first')
  assert.equal(attempts, 1)
  await f.flush()
  assert.equal(attempts, 2)
  assert.equal(f.state.pendingRef.current, null)
})

test('failed old HTML does not overwrite a newer edit; rerun serializes requests', async () => {
  const f = fixture(), first = gate(), sent = []
  f.args.notes.update = async (_, snap) => { sent.push(snap.title); if (sent.length === 1) await first.promise }
  f.state.pendingRef.current = snapshot('first')
  const saving = f.flush()
  f.state.pendingRef.current = snapshot('second')
  await f.flush()
  assert.deepEqual(sent, ['first'])
  first.reject(new Error('fixture outage'))
  await saving
  await tick()
  assert.deepEqual(sent, ['first', 'second'])
  assert.equal(f.state.pendingRef.current, null)
})

test('Y update goes first; active document receives server catch-up', async () => {
  const doc = new Y.Doc(), peer = new Y.Doc()
  try {
    doc.getText('text').insert(0, 'local')
    peer.getText('peer').insert(0, 'remote')
    const f = fixture({ ydoc: doc, provider: { serverStateVector: null } })
    f.args.notes.saveYDoc = async (...values) => { f.calls.push(['y', ...values]); return { missing: bytesToBase64(Y.encodeStateAsUpdate(peer)) } }
    f.state.ydocDirtyRef.current = true
    f.state.pendingRef.current = snapshot('local')
    await f.flush()
    assert.deepEqual(f.calls.map(x => x[0]), ['y', 'html'])
    assert.equal(doc.getText('peer').toString(), 'remote')
    const server = new Y.Doc()
    Y.applyUpdate(server, base64ToBytes(f.calls[0][2]))
    assert.equal(server.getText('text').toString(), 'local')
    server.destroy()
    assert.ok(f.args.provider.serverStateVector instanceof Uint8Array)
  } finally { doc.destroy(); peer.destroy() }
})

test('busy flush captures latest Y payload before document destruction', async () => {
  const doc = new Y.Doc(), server = new Y.Doc(), first = gate(), sent = []
  let readsAfterDestroy = 0
  const store = doc.store
  Object.defineProperty(doc, 'store', { get() { if (doc.isDestroyed) readsAfterDestroy++; return store } })
  const f = fixture({ ydoc: doc, provider: { serverStateVector: null } })
  f.args.notes.saveYDoc = async (_, update) => {
    sent.push(update)
    if (sent.length === 1) await first.promise
    Y.applyUpdate(server, base64ToBytes(update))
    return {}
  }
  try {
    doc.getText('text').insert(0, 'first')
    f.state.ydocDirtyRef.current = true
    const saving = f.flush()
    doc.getText('text').insert(5, ' second')
    f.state.ydocDirtyRef.current = true
    f.state.pendingRef.current = snapshot('second')
    await f.flush() // Exact request made by the unmount flush while busy.
    assert.equal(f.state.ydocDirtyRef.current, true, 'Keepalive must still see unsent edits while the doc is alive')
    doc.destroy()
    first.resolve()
    await saving
    await tick()
    assert.equal(sent.length, 2)
    assert.equal(readsAfterDestroy, 0, 'Rerun must use captured bytes, not encode a destroyed Y.Doc')
    assert.equal(server.getText('text').toString(), 'first second')
    assert.equal(f.calls[0][2].title, 'second')
  } finally { if (!doc.isDestroyed) doc.destroy(); server.destroy() }
})

test('late response cannot mutate a destroyed Y.Doc or acknowledge its provider', async () => {
  const doc = new Y.Doc(), peer = new Y.Doc(), response = gate()
  const provider = { serverStateVector: null }
  const f = fixture({ ydoc: doc, provider })
  let lateUpdates = 0
  f.args.notes.saveYDoc = () => response.promise
  try {
    doc.getText('text').insert(0, 'local')
    peer.getText('peer').insert(0, 'late')
    f.state.ydocDirtyRef.current = true
    const saving = f.flush()
    doc.destroy()
    doc.on('update', () => lateUpdates++)
    response.resolve({ missing: bytesToBase64(Y.encodeStateAsUpdate(peer)) })
    await saving
    assert.equal(lateUpdates, 0)
    assert.equal(provider.serverStateVector, null)
  } finally { if (!doc.isDestroyed) doc.destroy(); peer.destroy() }
})

test('failed Y payload remains retryable after destruction without an automatic retry loop', async () => {
  const doc = new Y.Doc(), first = gate(), server = new Y.Doc()
  const f = fixture({ ydoc: doc, provider: { serverStateVector: null } })
  let attempts = 0, fail = true
  f.args.notes.saveYDoc = async (_, update) => {
    attempts++
    if (attempts === 1) await first.promise
    if (fail) throw new Error('fixture outage')
    Y.applyUpdate(server, base64ToBytes(update))
  }
  try {
    doc.getText('text').insert(0, 'first')
    f.state.ydocDirtyRef.current = true
    const saving = f.flush()
    doc.getText('text').insert(5, ' second')
    f.state.ydocDirtyRef.current = true
    await f.flush()
    doc.destroy()
    first.resolve()
    await saving
    await tick()
    assert.equal(attempts, 2, 'Only the explicitly requested rerun is attempted')
    assert.ok(f.state.capturedYDocRef.current, 'Newest failed bytes must remain available')
    assert.equal(f.state.ydocDirtyRef.current, true, 'Existing active-editor retry/exit path must see the failure')
    fail = false
    await f.flush()
    assert.equal(attempts, 3)
    assert.equal(server.getText('text').toString(), 'first second')
    assert.equal(f.state.capturedYDocRef.current, null)
  } finally { if (!doc.isDestroyed) doc.destroy(); server.destroy() }
})

test('separate note instances keep their own destinations and pending state', async () => {
  const first = gate(), sent = []
  const a = fixture(), b = fixture({ noteId: 'note-b', token: 'other-fixture-token' })
  a.args.notes.update = async (...values) => { sent.push(values); await first.promise }
  b.args.notes.update = async (...values) => { sent.push(values) }
  a.state.pendingRef.current = snapshot('a')
  b.state.pendingRef.current = snapshot('b')
  const savingA = a.flush()
  await b.flush()
  assert.deepEqual(sent.map(x => [x[0], x[1].title, x[2]]), [['note-a', 'a', 'fixture-token'], ['note-b', 'b', 'other-fixture-token']])
  assert.equal(a.state.savingRef.current, true)
  assert.equal(b.state.savingRef.current, false)
  first.resolve()
  await savingA
})
