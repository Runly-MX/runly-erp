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
