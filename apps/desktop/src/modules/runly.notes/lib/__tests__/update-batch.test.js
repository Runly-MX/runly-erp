import test from 'node:test'
import assert from 'node:assert/strict'
import * as Y from 'yjs'
import { createUpdateBatch } from '../updateBatch.js'

test('a bounded batch preserves concurrent inserts, deletions and later replay', context => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const a=new Y.Doc(),b=new Y.Doc(),peer=new Y.Doc(),sent=[]
  const batch=createUpdateBatch(bytes=>{sent.push(bytes);Y.applyUpdate(peer,bytes)})
  a.on('update',update=>batch.push(update)); b.on('update',update=>batch.push(update))
  a.getText('t').insert(0,'uno');a.getText('t').delete(0,1);b.getText('t').insert(0,'dos')
  assert.equal(sent.length,0)
  context.mock.timers.tick(80)
  assert.equal(sent.length,1)
  Y.applyUpdate(a,Y.encodeStateAsUpdate(b));Y.applyUpdate(b,Y.encodeStateAsUpdate(a))
  batch.flush()
  assert.equal(peer.getText('t').toString(),a.getText('t').toString())
  const reopened=new Y.Doc();for(const update of sent)Y.applyUpdate(reopened,update)
  assert.equal(reopened.getText('t').toString(),peer.getText('t').toString())
  batch.clear();a.destroy();b.destroy();peer.destroy();reopened.destroy()
})

test('flush on close and clear on full-state reconnect leave no trailing timer', context => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const sent=[],batch=createUpdateBatch(update=>sent.push(update)),doc=new Y.Doc()
  doc.on('update',update=>batch.push(update));doc.getText('t').insert(0,'save')
  batch.flush();assert.equal(sent.length,1)
  doc.getText('t').insert(0,'reconnect');batch.clear()
  context.mock.timers.tick(1000)
  assert.equal(sent.length,1)
  doc.destroy()
})

test('large updates flush immediately instead of retaining an unbounded queue', () => {
  const sent=[],batch=createUpdateBatch(update=>sent.push(update),{maxBytes:1}),doc=new Y.Doc()
  doc.on('update',update=>batch.push(update));doc.getText('t').insert(0,'large')
  assert.equal(sent.length,1)
  batch.clear();doc.destroy()
})
