import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchMyHours, isRevokedError, loadCachedHours, saveCachedHours } from './self-service.js'

// Loads the signed "me" summary, keeps the last good response cached for offline use and
// refreshes when the tab becomes visible again, the phone regains signal, and every
// REFRESH_MS while the app is open (so a resolved request or a new punch shows up by itself). `identity` may be null (not enrolled).
const REFRESH_MS = 15_000

export function useMyHours(identity, onRevoked) {
  const personId = identity?.personId ?? null
  const identityRef = useRef(identity)
  const revokedRef = useRef(onRevoked)
  const [state, setState] = useState(() => {
    const cached = personId ? loadCachedHours(personId) : null
    return { data: cached?.data ?? null, savedAt: cached?.savedAt ?? null, loading: false, error: null }
  })

  useEffect(() => { identityRef.current = identity; revokedRef.current = onRevoked }, [identity, onRevoked])

  const refresh = useCallback(async () => {
    const current = identityRef.current
    if (!current) return
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const data = await fetchMyHours(current)
      const savedAt = Date.now()
      saveCachedHours(current.personId, data, savedAt)
      setState({ data, savedAt, loading: false, error: null })
    } catch (e) {
      if (isRevokedError(e)) { revokedRef.current?.(); return }
      setState((s) => ({ ...s, loading: false, error: e.message, errorCode: e.code ?? null }))
    }
  }, [])

  useEffect(() => {
    if (!personId) return undefined
    refresh()
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    const onOnline = () => refresh()
    const timer = setInterval(() => { if (document.visibilityState === 'visible' && navigator.onLine !== false) refresh() }, REFRESH_MS)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('online', onOnline) }
  }, [personId, refresh])

  return { ...state, refresh, stale: Boolean(state.error && state.data) }
}
