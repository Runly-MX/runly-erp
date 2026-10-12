// Cursor + de-duplication for punches this kiosk received from phones
// (GET .../recent?since=). Pure so it is testable without network or DOM.
export const RECENT_POLL_MS = 2_000
export const RECENT_LOOKBACK_MS = 5_000
const MAX_SEEN = 500

export function createRecentFeed({ now = Date.now() } = {}) {
  let cursor = now - RECENT_LOOKBACK_MS
  const seen = new Set()
  return {
    since: () => new Date(cursor).toISOString(),
    // Returns items not seen before (oldest first) and advances the cursor.
    ingest(items) {
      const fresh = []
      for (const item of Array.isArray(items) ? items : []) {
        if (!item?.id) continue
        const at = Date.parse(item.receivedAt)
        if (Number.isFinite(at) && at > cursor) cursor = at
        if (seen.has(item.id)) continue
        seen.add(item.id)
        fresh.push(item)
      }
      if (seen.size > MAX_SEEN) for (const id of [...seen].slice(0, seen.size - MAX_SEEN)) seen.delete(id)
      return fresh.sort((a, b) => Date.parse(a.receivedAt) - Date.parse(b.receivedAt))
    },
  }
}
