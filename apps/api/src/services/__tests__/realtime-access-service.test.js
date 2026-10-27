import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createRealtimeAccessService } from '../realtime-access-service.js'
import * as Y from 'yjs'
import { Awareness, encodeAwarenessUpdate, applyAwarenessUpdate } from 'y-protocols/awareness'

describe('realtime relay', () => {
  it('stamps the authenticated actor on canvas payloads', async () => {
    const sent = []
    const prisma = {
      $queryRaw: async () => [{ allowed: true }],
      userProfile: { findFirst: async () => ({ displayName: 'Ana' }) },
    }
    const broadcaster = { broadcastToChannel: async (topic, event, payload) => { sent.push(payload) } }
    const service = createRealtimeAccessService({ prisma, broadcaster })
    const ok = await service.relay({ topic: 'canvas:board:00000000-0000-4000-8000-000000000004', event: 'cursor', payload: { x: 1, actorId: 'spoofed' }, actorId: 'user-1' })
    assert.equal(ok, true)
    assert.equal(sent[0].actorId, 'user-1')
    assert.equal(sent[0].x, 1)
  })
  it('revalidates within the broadcaster transaction without borrowing another pool connection', async () => {
    let outerReads = 0, transactionalReads = 0
    const prisma = {
      $queryRaw: async () => { outerReads++; return [{ allowed: true }] },
      userProfile: { findFirst: async () => ({ displayName: 'Ana' }) },
    }
    const tx = { $queryRaw: async () => { transactionalReads++; return [{ allowed: false }] } }
    const broadcaster = { broadcastToChannel: async (_topic, _event, _payload, { authorize }) => {
      assert.equal(await authorize(tx), false)
    } }
    await createRealtimeAccessService({ prisma, broadcaster }).relay({ topic: 'canvas:board:00000000-0000-4000-8000-000000000004', event: 'cursor', actorId: 'user-1' })
    assert.equal(outerReads, 1)
    assert.equal(transactionalReads, 1)
  })
  it('does not allow a browser to forge a committed Canvas change or board deletion', async () => {
    const prisma = { $queryRaw: async () => assert.fail('reject the event before querying') }
    const broadcaster = { broadcastToChannel: async () => assert.fail('must not publish') }
    assert.equal(await createRealtimeAccessService({ prisma, broadcaster }).relay({ topic: 'canvas:board:00000000-0000-4000-8000-000000000004', event: 'canvas.changed', payload: { action: 'board.deleted' }, actorId: 'user-1' }), false)
  })
  it('stamps Notes canvas pointer identity from the authenticated profile', async () => {
    let sent
    const prisma = { $queryRaw: async () => [{ allowed: true }], userProfile: { findFirst: async () => ({ displayName: 'Ana' }) } }
    const broadcaster = { broadcastToChannel: async (_topic, _event, payload) => { sent = payload } }
    await createRealtimeAccessService({ prisma, broadcaster }).relay({ topic: 'note:canvas:00000000-0000-4000-8000-000000000004', event: 'pointer', payload: { senderId: 'forged', user: { name: 'Forged name' }, x: 1 }, actorId: 'user-1' })
    assert.equal(sent.senderId, 'user-1')
    assert.deepEqual(sent.user, { id: 'user-1', name: 'Ana' })
    assert.equal(sent.x, 1)
  })
  it('rewrites Y.js identity at the relay, keeps cursor state and rejects a forwarded identity', async () => {
    const doc=new Y.Doc(),peerDoc=new Y.Doc(),awareness=new Awareness(doc),peer=new Awareness(peerDoc)
    let sent
    const prisma={ $queryRaw:async()=>[{allowed:true}],userProfile:{findFirst:async()=>({displayName:'Ana',authUserId:'auth-ana'})} }
    const broadcaster={broadcastToChannel:async(_topic,_event,payload)=>{sent=payload}}
    const service=createRealtimeAccessService({prisma,broadcaster})
    const relay=()=>service.relay({topic:'note:ydoc:00000000-0000-4000-8000-000000000004',event:'awareness.update',actorId:'profile-ana',payload:{update:Buffer.from(encodeAwarenessUpdate(awareness,[doc.clientID])).toString('base64')}})
    try {
      awareness.setLocalState({user:{id:'auth-ana',name:'Forged victim',avatarUrl:'https://avatar.example.test/forged'},cursor:{anchor:1,head:2}})
      assert.equal(await relay(),true)
      applyAwarenessUpdate(peer,new Uint8Array(Buffer.from(sent.update,'base64')),'server')
      const state=peer.getStates().get(doc.clientID)
      assert.equal(state.user.name,'Ana');assert.equal(state.user.id,'auth-ana');assert.equal(state.user.avatarUrl,null)
      assert.deepEqual(state.cursor,{anchor:1,head:2})
      awareness.setLocalStateField('user',{id:'auth-victim',name:'Victim'})
      assert.equal(await relay(),false)
      awareness.setLocalState(null)
      assert.equal(await relay(),true)
    } finally {awareness.destroy();peer.destroy();doc.destroy();peerDoc.destroy()}
  })
})
