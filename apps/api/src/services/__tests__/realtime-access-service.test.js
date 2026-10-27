import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createRealtimeAccessService } from '../realtime-access-service.js'

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
})
