import { useCallback, useEffect, useState } from 'react'
import { parsePortalHash, portalHash } from '../lib/guest-view.js'

// Hash-based navigation inside the portal page (back button and shared links keep working).
export function useGuestPortalView() {
  const [route, setRoute] = useState(() => parsePortalHash(window.location.hash))
  useEffect(() => {
    const onChange = () => { setRoute(parsePortalHash(window.location.hash)); window.scrollTo?.({ top: 0 }) }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  const go = useCallback((view, id = null) => {
    const hash = portalHash(view, id)
    if (hash === window.location.hash || (!hash && !window.location.hash)) return
    window.location.hash = hash
    if (!hash) history.replaceState(null, '', window.location.pathname + window.location.search)
  }, [])
  return { ...route, go }
}
