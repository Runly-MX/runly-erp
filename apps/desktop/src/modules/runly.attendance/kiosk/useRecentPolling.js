// Polls the punches this kiosk received from phones ("Con mi teléfono") while
// online and the tab is visible. Calls onItem once per new punch.
import { useEffect, useRef } from 'react'
import { kioskApi } from './lib/kiosk-api.js'
import { createRecentFeed, RECENT_POLL_MS } from './lib/recent-feed.js'

export function useRecentPolling({ enabled, link, tokenRef, onItem, onAuthError }) {
  const handlers = useRef({ onItem, onAuthError })
  handlers.current = { onItem, onAuthError }
  const feedRef = useRef(null)

  useEffect(() => {
    if (!enabled) return undefined
    feedRef.current ??= createRecentFeed()
    let busy = false
    const tick = async () => {
      if (busy || document.visibilityState === 'hidden' || !tokenRef.current) return
      busy = true
      try {
        const feed = feedRef.current
        const items = await kioskApi.recent(link, tokenRef.current, feed.since())
        for (const item of feed.ingest(items)) handlers.current.onItem(item)
      } catch (error) {
        if (error?.status === 401 || error?.status === 403) handlers.current.onAuthError?.(error)
      } finally { busy = false }
    }
    const id = setInterval(tick, RECENT_POLL_MS)
    return () => clearInterval(id)
  }, [enabled, link, tokenRef])
}
