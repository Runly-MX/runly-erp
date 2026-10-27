import { mergeUpdates } from 'yjs'

// Coalesce local CRDT transactions, never snapshots or last-write-wins state.
// The doc remains the source of truth for reconnect and independent autosave.
export function createUpdateBatch(send, { delayMs = 80, maxBytes = 256 * 1024 } = {}) {
  let updates = [], bytes = 0, timer = null
  const clear = () => { clearTimeout(timer); timer = null; updates = []; bytes = 0 }
  function flush() {
    if (!updates.length) return
    const merged = updates.length === 1 ? updates[0] : mergeUpdates(updates)
    clear()
    send(merged)
  }
  return {
    push(update) {
      updates.push(update); bytes += update.byteLength
      if (bytes >= maxBytes) flush()
      else if (!timer) timer = setTimeout(flush, delayMs)
    },
    flush,
    clear,
  }
}
