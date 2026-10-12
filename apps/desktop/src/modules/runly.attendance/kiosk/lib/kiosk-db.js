// Offline store for the kiosk: device token, roster snapshot and the punch
// outbox. Everything is keyed by the kiosk link so several kiosks can share a
// browser profile.
import { openDatabase, requestResult, runStore } from './idb.js'

let dbPromise = null
function db() {
  dbPromise ??= openDatabase('runly-attendance-kiosk', 2, (d) => {
    // Idempotent: v1 -> v2 only adds the selfies store and keeps existing data.
    if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'key' })
    if (!d.objectStoreNames.contains('roster')) d.createObjectStore('roster', { keyPath: 'link' })
    if (!d.objectStoreNames.contains('outbox')) d.createObjectStore('outbox', { keyPath: 'id' }).createIndex('link', 'link')
    if (!d.objectStoreNames.contains('rejected')) d.createObjectStore('rejected', { autoIncrement: true }).createIndex('link', 'link')
    if (!d.objectStoreNames.contains('selfies')) d.createObjectStore('selfies', { keyPath: 'punchId' }).createIndex('link', 'link')
  })
  return dbPromise
}

async function getAllByLink(storeName, link) {
  const d = await db()
  return runStore(d, storeName, 'readonly', (s) => s.index('link').getAll(link))
}

export const kioskDb = {
  async getMeta(key) {
    const d = await db()
    const tx = d.transaction('meta')
    const row = await requestResult(tx.objectStore('meta').get(key))
    return row?.value ?? null
  },
  async setMeta(key, value) {
    const d = await db()
    await runStore(d, 'meta', 'readwrite', (s) => { s.put({ key, value }) })
  },
  async deleteMeta(key) {
    const d = await db()
    await runStore(d, 'meta', 'readwrite', (s) => { s.delete(key) })
  },
  async getRoster(link) {
    const d = await db()
    return (await requestResult(d.transaction('roster').objectStore('roster').get(link)))?.roster ?? null
  },
  async putRoster(link, roster) {
    const d = await db()
    await runStore(d, 'roster', 'readwrite', (s) => { s.put({ link, roster, savedAt: Date.now() }) })
  },
  async putPunch(punch) {
    const d = await db()
    await runStore(d, 'outbox', 'readwrite', (s) => { s.put(punch) })
  },
  // Patches a punch only if it is still in the outbox (never resurrects a synced one).
  async patchPunch(id, patch) {
    const d = await db()
    await new Promise((resolve, reject) => {
      const tx = d.transaction('outbox', 'readwrite')
      const store = tx.objectStore('outbox')
      const get = store.get(id)
      get.onsuccess = () => { if (get.result) store.put({ ...get.result, ...patch }) }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  },
  async deletePunches(ids) {
    if (!ids.length) return
    const d = await db()
    await runStore(d, 'outbox', 'readwrite', (s) => { for (const id of ids) s.delete(id) })
  },
  async listPunches(link) {
    const rows = await getAllByLink('outbox', link)
    return rows.sort((a, b) => String(a.deviceTime).localeCompare(String(b.deviceTime)))
  },
  // Evidence photos waiting for their punch to sync: { punchId, link, blob, createdAt, attempts }.
  async putSelfie(row) {
    const d = await db()
    await runStore(d, 'selfies', 'readwrite', (s) => { s.put(row) })
  },
  async listSelfies(link) {
    const rows = await getAllByLink('selfies', link)
    return rows.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
  },
  async deleteSelfies(ids) {
    if (!ids.length) return
    const d = await db()
    await runStore(d, 'selfies', 'readwrite', (s) => { for (const id of ids) s.delete(id) })
  },
  async addRejected(link, entries) {
    if (!entries.length) return
    const d = await db()
    const at = new Date().toISOString()
    await runStore(d, 'rejected', 'readwrite', (s) => { for (const e of entries) s.add({ link, at, ...e }) })
  },
  async listRejected(link) {
    const rows = await getAllByLink('rejected', link)
    return rows.slice(-50).reverse()
  },
}
