import { useCallback, useEffect, useRef, useState } from 'react'

const KEY = 'runly:studio:animation-focus'
const remembered = () => { try { return localStorage.getItem(KEY) === '1' } catch { return false } }

// «Modo enfocado» while the timeline is open: side panels fold, the app chrome hides (the
// existing «clean» view mode), the paper is refitted, and
// leaving restores exactly what was open. The choice is a per-viewer preference that is
// applied again the next time the timeline opens; it never changes the document.
export function useAnimationFocus({ open, panel, setPanel, inspectorOpen, setInspectorOpen, viewMode, fit }) {
  const [active, setActive] = useState(false), saved = useRef(null), current = useRef(false)
  const apply = useCallback(on => {
    if (current.current === on) return
    current.current = on
    if (on) { saved.current = { panel, inspectorOpen, view: viewMode.mode }; setPanel(null); setInspectorOpen(false); if (viewMode.mode === 'normal') viewMode.setMode('clean') }
    else if (saved.current) { setPanel(saved.current.panel); setInspectorOpen(saved.current.inspectorOpen); if (viewMode.mode === 'clean' && saved.current.view === 'normal') viewMode.setMode('normal'); saved.current = null }
    setActive(on)
    // After the side panels finish folding, so the fit uses the final canvas size.
    setTimeout(fit, 320)
  }, [panel, inspectorOpen, setPanel, setInspectorOpen, viewMode, fit])
  useEffect(() => { apply(open && remembered()) }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = useCallback(() => {
    try { localStorage.setItem(KEY, active ? '0' : '1') } catch { /* per-viewer convenience only */ }
    apply(!active)
  }, [active, apply])
  return { active, toggle }
}
