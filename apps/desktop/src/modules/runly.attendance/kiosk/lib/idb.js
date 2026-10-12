// Tiny promise wrapper over IndexedDB (no dependency). Used by the kiosk and
// the phone key, which both must work without any login.
export function openDatabase(name, version, upgrade) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version)
    request.onupgradeneeded = () => upgrade(request.result)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export function runStore(db, storeName, mode, fn) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode)
    const store = tx.objectStore(storeName)
    let result
    try { result = fn(store) } catch (error) { reject(error); return }
    tx.oncomplete = () => resolve(typeof IDBRequest !== 'undefined' && result instanceof IDBRequest ? result.result : result)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

export const requestResult = (request) => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error)
})
