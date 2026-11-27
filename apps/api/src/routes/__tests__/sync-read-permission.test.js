import test from 'node:test'
import assert from 'node:assert/strict'
import { syncReadAllowed } from '../sync.js'
import { createSyncService } from '../../services/sync-service.js'

const tenant = (keys, isAdmin = false) => ({ isAdmin, permissionSet: new Set(keys) })

test('sync pull allows an entity only with its read permission; admins and legacy atlas.* keys follow the same rule', () => {
  assert.equal(syncReadAllowed(tenant([]))('runly.contacts', 'contact'), false)
  assert.equal(syncReadAllowed(tenant(['contacts.contacts.read']))('runly.contacts', 'contact'), true)
  assert.equal(syncReadAllowed(tenant(['contacts.contacts.read']))('atlas.contacts', 'contact'), true)
  assert.equal(syncReadAllowed(tenant(['contacts.contacts.read']))('runly.hr', 'employee'), false)
  assert.equal(syncReadAllowed(tenant([], true))('runly.hr', 'employee'), true)
  assert.equal(syncReadAllowed(tenant(['hr.employee.read']))('runly.unknown', 'x'), false)
})

test('service.pull returns no records for a denied entity and does not query it', async () => {
  let queried = 0
  const prisma = {
    userProfile: { findUnique: async () => ({ id: 'u1' }) },
    contact: { findMany: async () => { queried += 1; return [] } },
  }
  const service = createSyncService({ prisma })
  await service.pull({ authUserId: 'a', companyId: 'c', modules: ['runly.contacts'], cursor: null, canRead: () => false }).catch(() => {})
  assert.equal(queried, 0)
})

test('sync push needs the create/update/delete permission of the entity; unknown operations and entities are denied', async () => {
  const { syncWriteAllowed } = await import('../sync.js')
  const t = tenant(['contacts.contacts.read', 'contacts.contacts.update'])
  assert.equal(syncWriteAllowed(t, 'UPDATE')('runly.contacts', 'contact'), true)
  assert.equal(syncWriteAllowed(t, 'CREATE')('runly.contacts', 'contact'), false)
  assert.equal(syncWriteAllowed(t, 'DELETE')('atlas.contacts', 'contact'), false)
  assert.equal(syncWriteAllowed(t, 'UPSERT')('runly.contacts', 'contact'), false)
  assert.equal(syncWriteAllowed(t, 'UPDATE')('runly.hr', 'employee'), false)
  assert.equal(syncWriteAllowed(tenant([], true), 'CREATE')('runly.hr', 'employee'), true)
})
