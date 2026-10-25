import { useContext, useEffect, useRef, useState } from 'react'
import { UNSAFE_NavigationContext } from 'react-router-dom'
import { guardNavigation, registerNavigationGuard, registerPopNavigationGuard, commitNavigation } from '../../../lib/navigation-guard.js'

// BrowserRouter (declarative router) has no data-router useBlocker. Scope the
// navigator adapter to this dirty editor; never change the router of other modules.
export function useStudioNavigation(dirty, preserve) {
  const { navigator } = useContext(UNSAFE_NavigationContext)
  const [pending, setPending] = useState(null)
  const preserveRef = useRef(preserve)
  useEffect(() => { preserveRef.current = preserve }, [preserve])
  useEffect(() => {
    if (!dirty) return
    const unregister = registerNavigationGuard(action => { preserveRef.current(); setPending(() => action) })
    const originals = { push: navigator.push, replace: navigator.replace, go: navigator.go }
    const wrappers = Object.fromEntries(Object.entries(originals).map(([key, method]) => [key, (...args) => guardNavigation(() => {
      if (key === 'go') replay = true
      return method.apply(navigator, args)
    })]))
    Object.assign(navigator, wrappers)
    const index = window.history.state?.idx
    let restoring = null, replay = false
    const pop = event => {
      if (replay) { replay = false; return }
      if (restoring !== null) {
        event.stopImmediatePropagation()
        const delta = restoring; restoring = null
        guardNavigation(() => { replay = true; window.history.go(delta) })
        return
      }
      const delta = event.state?.idx - index
      if (!Number.isInteger(delta) || delta === 0) { preserveRef.current(); return }
      event.stopImmediatePropagation(); restoring = delta; window.history.go(-delta)
    }
    const unregisterPop = registerPopNavigationGuard(pop)
    const unload = event => { preserveRef.current(); event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', unload)
    return () => {
      unregister(); unregisterPop()
      for (const key of Object.keys(originals)) if (navigator[key] === wrappers[key]) navigator[key] = originals[key]
      window.removeEventListener('beforeunload', unload)
    }
  }, [dirty, navigator])
  return { pending: Boolean(pending), cancel: () => setPending(null), finish: commitNavigation, proceed: () => { preserveRef.current(); const action = pending; setPending(null); if (action) commitNavigation(action) } }
}
