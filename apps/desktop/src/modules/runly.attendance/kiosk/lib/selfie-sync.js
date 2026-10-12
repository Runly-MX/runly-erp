// Uploads queued selfies whose punch already reached the server. Dependencies are
// injected so the loop is testable without IndexedDB or fetch.
import { overflowIds, pickUploadable, resolveAttempt } from './selfie-queue.js'

// store: { list(), put(row), remove(ids) }; upload(punchId, blob) throws an error
// with a numeric `status` (0 = network). Returns { uploaded, dropped, stopped }.
export async function uploadPendingSelfies({ store, upload, outboxIds, rejectedIds = [], log = () => {} }) {
  const all = await store.list()
  const stale = [...overflowIds(all), ...all.filter((s) => rejectedIds.includes(s.punchId)).map((s) => s.punchId)]
  if (stale.length) { await store.remove(stale); log(`${stale.length} foto(s) descartadas de la cola`) }
  const queue = pickUploadable(all.filter((s) => !stale.includes(s.punchId)), outboxIds)
  let uploaded = 0
  let dropped = 0
  for (const item of queue) {
    let status = 201
    try { await upload(item.punchId, item.blob) } catch (error) { status = error?.status ?? 0 }
    const outcome = resolveAttempt(item.attempts ?? 0, status)
    if (outcome.action === 'delete') { await store.remove([item.punchId]); uploaded += 1 } else if (outcome.action === 'drop') {
      await store.remove([item.punchId])
      dropped += 1
      log(`Foto descartada tras ${outcome.attempts} intento(s) (estado ${status})`)
    } else {
      if (outcome.attempts !== (item.attempts ?? 0)) await store.put({ ...item, attempts: outcome.attempts })
      if (status === 0 || status === 401 || status === 403) return { uploaded, dropped, stopped: true } // offline or unauthorized: try next cycle
    }
  }
  return { uploaded, dropped, stopped: false }
}
