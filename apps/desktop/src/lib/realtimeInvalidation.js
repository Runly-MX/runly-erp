const clients = new WeakMap()

// One bounded batch per query/client. Events received while a fetch is in
// flight queue a fresh pass; they never cancel/restart somebody else's fetch.
export function invalidateRealtimeQuery(client, queryKey) {
  let keys = clients.get(client)
  if (!keys) { keys = new Map(); clients.set(client, keys) }
  const key = JSON.stringify(queryKey)
  let entry = keys.get(key)
  if (!entry) {
    entry = { waiters: [], running: false, timer: null }
    keys.set(key, entry)
  }
  const result = new Promise(resolve => entry.waiters.push(resolve))
  function schedule() {
    if (entry.running || entry.timer) return
    entry.timer = setTimeout(flush, 40)
  }
  async function flush() {
    entry.timer = null
    entry.running = true
    const waiters = entry.waiters
    entry.waiters = []
    const filters = { queryKey }
    try {
      const alreadyFetching = client.isFetching(filters) > 0
      await client.invalidateQueries(filters, { cancelRefetch: false })
      // An unrelated fetch may have started before this committed event.
      // Wait for it, then get a snapshot that includes the event as well.
      if (alreadyFetching) await client.invalidateQueries(filters, { cancelRefetch: false })
    } catch {
      // Query retains its error/stale state; focus/poll/reconnect recovery
      // remains responsible for outages, without an infinite retry timer.
    } finally {
      entry.running = false
      waiters.forEach(resolve => resolve())
      if (entry.waiters.length) schedule()
      else if (keys.get(key) === entry) keys.delete(key)
    }
  }
  schedule()
  return result
}
