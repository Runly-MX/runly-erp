import test from 'node:test'
import assert from 'node:assert/strict'
import { extractServerYState, prepareAwarenessUpdate } from '../SupabaseYjsProvider.js'
import * as Y from 'yjs'
import * as awarenessProtocol from 'y-protocols/awareness'

// Regression: GET /notes/:id/ydoc returns { data: { state, version } }. The
// provider used to read `res.state`, always got undefined, and mounted the
// collaborative editor against an empty Y.Doc — the note reloaded blank while
// the sidebar preview (legacy notes.content column) still showed text.
test('extractServerYState: unwraps the Hono { data: { state } } envelope', () => {
  assert.equal(
    extractServerYState({ data: { state: 'AQID', version: 3 } }),
    'AQID',
  )
})

test('extractServerYState: accepts a bare { state } shape', () => {
  assert.equal(extractServerYState({ state: 'AQID' }), 'AQID')
})

test('extractServerYState: null when the note has no persisted state', () => {
  assert.equal(extractServerYState({ data: { state: null } }), null)
  assert.equal(extractServerYState({ state: null }), null)
  assert.equal(extractServerYState({ data: {} }), null)
})

test('extractServerYState: null for empty string / missing / non-object input', () => {
  assert.equal(extractServerYState({ data: { state: '' } }), null)
  assert.equal(extractServerYState({}), null)
  assert.equal(extractServerYState(null), null)
  assert.equal(extractServerYState(undefined), null)
})

test('legacy API awareness retains selection and clocks but does not authenticate browser-declared identity', () => {
  const doc=new Y.Doc(),peerDoc=new Y.Doc(),awareness=new awarenessProtocol.Awareness(doc),peer=new awarenessProtocol.Awareness(peerDoc)
  try {
    awareness.setLocalState({user:{id:'victim',name:'Forged name',avatarUrl:'https://avatar.example.test/fake'},cursor:{anchor:1,head:2}})
    const bytes=awarenessProtocol.encodeAwarenessUpdate(awareness,[doc.clientID])
    assert.equal(prepareAwarenessUpdate(bytes,1),bytes)
    awarenessProtocol.applyAwarenessUpdate(peer,prepareAwarenessUpdate(bytes,undefined),'legacy')
    const state=peer.getStates().get(doc.clientID)
    assert.equal(state.user.name,'Colaborador');assert.equal(state.user.id,null);assert.equal(state.user.avatarUrl,null)
    assert.deepEqual(state.cursor,{anchor:1,head:2})
  } finally {awareness.destroy();peer.destroy();doc.destroy();peerDoc.destroy()}
})
