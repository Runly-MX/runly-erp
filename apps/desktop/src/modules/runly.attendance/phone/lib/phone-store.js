// Local-only identity of the phone key (CryptoKey objects survive structured clone).
import { openDatabase, requestResult, runStore } from '../../kiosk/lib/idb.js'

let dbPromise = null
const db = () => (dbPromise ??= openDatabase('runly-attendance-phone', 1, (d) => { d.createObjectStore('identity', { keyPath: 'id' }) }))

export const phoneStore = {
  async load() {
    const d = await db()
    return (await requestResult(d.transaction('identity').objectStore('identity').get('main'))) ?? null
  },
  async save(identity) {
    const d = await db()
    await runStore(d, 'identity', 'readwrite', (s) => { s.put({ ...identity, id: 'main' }) })
  },
  async clear() {
    const d = await db()
    await runStore(d, 'identity', 'readwrite', (s) => { s.delete('main') })
  },
}
