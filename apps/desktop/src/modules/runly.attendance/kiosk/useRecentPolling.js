// Polls the kiosk's change feed while the tab is visible: the punches it received
// from phones ("Con mi teléfono") and the roster fingerprint, so a new phone key,
// card or person reaches the screen within seconds instead of at the next reload.
// Calls onItem once per new punch, onVersion with the latest roster fingerprint and
// onReachable(true|false) so the connection badge follows what really happens.
import { useEffect, useRef } from 'react'
import { kioskApi } from './lib/kiosk-api.js'
import { createRecentFeed, RECENT_POLL_MS } from './lib/recent-feed.js'

export function useRecentPolling({ enabled, link, tokenRef, onItem, onVersion, onReachable, onAuthError }) {
  const handlers = useRef({ onItem, onVersion, onReachable, onAuthError })
  handlers.current = { onItem, onVersion, onReachable, onAuthError }
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
        const data = await kioskApi.changes(link, tokenRef.current, feed.since())
        handlers.current.onReachable?.(true)
        for (const item of feed.ingest(data?.items)) handlers.current.onItem(item)
        if (data?.rosterVersion) handlers.current.onVersion?.(data.rosterVersion)
      } catch (error) {
        if (error?.status === 0) handlers.current.onReachable?.(false)
        else if (error?.status === 401 || error?.status === 403) handlers.current.onAuthError?.(error)
      } finally { busy = false }
    }
    tick()
    const id = setInterval(tick, RECENT_POLL_MS)
    const onVisible = () => { if (document.visibilityState === 'visible') tick() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible) }
  }, [enabled, link, tokenRef])
}
