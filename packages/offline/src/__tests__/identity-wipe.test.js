import { test } from 'node:test'
import assert from 'node:assert/strict'
import 'fake-indexeddb/auto'
import { RunlyOfflineDatabase } from '../db.js'
import { offlineDatabaseName } from '../offline-scope.js'
import { requestOfflineWipe, sweepOfflineDatabases, takeOfflineWipeRequest, wipeOfflineReadData } from '../identity-wipe.js'

const api = 'http://api.test'
const name = (userId, companyId) => offlineDatabaseName({ apiBaseUrl: api, userId, companyId })
async function seed(db, { pending = false } = {}) {
  await db.offline_records.put({ moduleKey: 'runly.contacts', entityType: 'contact', id: 'r1', companyId: 'c' })
  await db.sync_state.put({ moduleKey: 'runly.contacts', entityType: 'contact' })
  if (pending) await db.mutation_queue.put({ id: 'm1', status: 'PENDING', moduleKey: 'runly.contacts', entityType: 'contact', queuedAt: 1 })
  db.close()
}

test('a sweep removes other identities: read data is deleted, pending mutations survive, the current identity is untouched', async () => {
  for (const [user, company, pending] of [['alice', 'c1', false], ['alice', 'c2', true], ['bob', 'c1', false]]) {
    await seed(new RunlyOfflineDatabase(name(user, company)), { pending })
  }
  const cleaned = await sweepOfflineDatabases({ apiBaseUrl: api, shouldWipe: (owner) => owner !== 'bob' })
  assert.equal(cleaned, 2)
  const names = (await indexedDB.databases()).map((d) => d.name)
  assert.ok(!names.includes(name('alice', 'c1')), 'database without pending work is deleted')
  const kept = new RunlyOfflineDatabase(name('alice', 'c2'))
  assert.equal(await kept.offline_records.count(), 0)
  assert.equal(await kept.sync_state.count(), 0)
  assert.equal(await kept.mutation_queue.count(), 1, 'pending mutation is not lost silently')
  kept.close()
  const bob = new RunlyOfflineDatabase(name('bob', 'c1'))
  assert.equal(await bob.offline_records.count(), 1)
  bob.close()
})

test('wipeOfflineReadData clears read tables only; wipe requests are consumed once', async () => {
  const db = new RunlyOfflineDatabase(name('carol', 'c1'))
  await db.mutation_queue.put({ id: 'm2', status: 'PENDING', moduleKey: 'x', entityType: 'y', queuedAt: 1 })
  await db.offline_records.put({ moduleKey: 'x', entityType: 'y', id: '1' })
  await wipeOfflineReadData(db)
  assert.equal(await db.offline_records.count(), 0)
  assert.equal(await db.mutation_queue.count(), 1)
  db.close()
  requestOfflineWipe('carol')
  assert.equal(takeOfflineWipeRequest('carol'), true)
  assert.equal(takeOfflineWipeRequest('carol'), false)
})
