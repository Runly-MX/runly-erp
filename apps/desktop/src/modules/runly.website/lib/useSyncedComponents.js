import { useEffect, useMemo, useRef, useState } from 'react'
import { createSyncedComponents, websiteComponentsTransport } from './syncedComponents.js'

/**
 * Atlas `syncedComponents` prop for one site. Returns undefined (no Componentes tab) until the definitions are loaded
 * and whenever the Atlas release in use does not support synced components (`enabled` false).
 */
export function useSyncedComponents({ apiFetch, token, siteId, enabled }) {
  const [snapshot, setSnapshot] = useState({ definitions: {}, ready: false })
  const adapter = useRef(null)
  useEffect(() => {
    adapter.current = null
    setSnapshot({ definitions: {}, ready: false })
    if (!enabled || !token || !siteId) return undefined
    const created = createSyncedComponents(websiteComponentsTransport({ apiFetch, token, siteId }), (state) => setSnapshot({ definitions: state.definitions, ready: true }))
    adapter.current = created
    created.refresh().catch(() => { /* the tab simply stays hidden; page editing is unaffected */ })
    return () => { if (adapter.current === created) adapter.current = null }
  }, [apiFetch, token, siteId, enabled])
  return useMemo(() => (snapshot.ready ? { definitions: snapshot.definitions, save: (next) => adapter.current.save(next) } : undefined), [snapshot])
}
