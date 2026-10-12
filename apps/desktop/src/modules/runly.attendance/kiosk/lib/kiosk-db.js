// Offline store for the kiosk: device token, roster snapshot and the punch
// outbox. Everything is keyed by the kiosk link so several kiosks can share a
// browser profile.
import { openDatabase, requestResult, runStore } from './idb.js'

let dbPromise = null
function db() {
  dbPromise ??= openDatabase('runly-attendance-kiosk', 1, (d) => {
    d.createObjectStore('meta', { keyPath: 'key' })
    d.createObjectStore('roster', { keyPath: 'link' })
    d.createObjectStore('outbox', { keyPath: 'id' }).createIndex('link', 'link')
    d.createObjectStore('rejected', { autoIncrement: true }).createIndex('link', 'link')
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
  async deletePunches(ids) {
    if (!ids.length) return
    const d = await db()
    await runStore(d, 'outbox', 'readwrite', (s) => { for (const id of ids) s.delete(id) })
  },
  async listPunches(link) {
    const rows = await getAllByLink('outbox', link)
    return rows.sort((a, b) => String(a.deviceTime).localeCompare(String(b.deviceTime)))
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
