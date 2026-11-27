import Dexie from 'dexie'
import { RunlyOfflineDatabase } from './db.js'
import { offlineDatabaseName } from './offline-scope.js'

// Read data downloaded by sync belongs to the identity that downloaded it. Pending local changes
// (mutation_queue) and unresolved conflicts are NOT read data: they are kept so nothing is lost silently.
const READ_TABLES = ['offline_records', 'sync_state', '_query_cache']

const wipeRequests = new Set()

// Called by the auth layer when an identity ends (logout, forced logout, switch to another user).
export const requestOfflineWipe = (userId) => { if (userId) wipeRequests.add(userId) }
export const takeOfflineWipeRequest = (userId) => wipeRequests.delete(userId)

export async function wipeOfflineReadData(database) {
  await database.transaction('rw', READ_TABLES.map((name) => database[name]), () => Promise.all(READ_TABLES.map((name) => database[name].clear())))
}

// Same encoding as offlineDatabaseName: `runly-offline-v2:<api>:<user>:<company>`.
const databasePrefix = (apiBaseUrl) => offlineDatabaseName({ apiBaseUrl, userId: 'u', companyId: 'c' }).replace(/u:c$/, '')
const ownerOf = (name, prefix) => { try { return decodeURIComponent(name.slice(prefix.length).split(':')[0]) } catch { return null } }

// Cleans every closed per-identity database of this server for which shouldWipe(userId, name) is true.
// A database with no pending mutation or conflict is deleted; otherwise only its read data is cleared.
export async function sweepOfflineDatabases({ apiBaseUrl, shouldWipe }) {
  if (!apiBaseUrl) return 0
  if (typeof indexedDB === 'undefined' || typeof indexedDB.databases !== 'function') return 0
  const prefix = databasePrefix(apiBaseUrl)
  let cleaned = 0
  for (const { name } of await indexedDB.databases()) {
    if (!name?.startsWith(prefix) || !shouldWipe(ownerOf(name, prefix), name)) continue
    const database = new RunlyOfflineDatabase(name)
    try {
      await database.open()
      const pending = (await database.mutation_queue.count()) + (await database.conflicts.count())
      if (pending === 0) { database.close(); await Dexie.delete(name) } else { await wipeOfflineReadData(database); database.close() }
      cleaned += 1
    } catch (err) {
      database.close()
      console.warn('[runly/offline] could not clean a stale identity database', err?.message ?? err)
    }
  }
  return cleaned
}
