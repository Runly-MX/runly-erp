import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

// Progressive page thumbnails. Cards report when they are on screen (`want`);
// pages are rendered one at a time by the engine's auxiliary renderer, only
// when their content signature changed, and never while `enabled` is false.
// A stale thumbnail stays visible until its replacement arrives.
export function usePageThumbnails(editorRef, pages, enabled) {
  const [thumbs, setThumbs] = useState({})
  const store = useRef({ urls: {}, wanted: new Set(), failed: {}, running: false, controller: null, alive: true })
  const latest = useRef({ pages, enabled })
  latest.current = { pages, enabled }

  const pump = useCallback(async () => {
    const state = store.current
    if (state.running || !latest.current.enabled) return
    state.running = true
    state.controller = new AbortController()
    const { signal } = state.controller
    try {
      for (;;) {
        const { pages: list, enabled: on } = latest.current
        const next = on && state.alive ? list.find(page => state.wanted.has(page.id) && state.urls[page.id]?.key !== page.key && state.failed[page.id] !== page.key) : null
        const editor = editorRef.current
        if (!next || !editor || signal.aborted) break
        try {
          const blob = await editor.getPageThumbnail(next.id, { signal })
          if (!state.alive || signal.aborted) break
          const url = URL.createObjectURL(blob)
          if (state.urls[next.id]) URL.revokeObjectURL(state.urls[next.id].url)
          state.urls[next.id] = { key: next.key, url }
          setThumbs(current => ({ ...current, [next.id]: { key: next.key, url } }))
        } catch {
          if (signal.aborted) break
          state.failed[next.id] = next.key
          setThumbs(current => ({ ...current }))
        }
      }
    } finally { state.running = false }
  }, [editorRef])

  const keys = useMemo(() => pages.map(page => `${page.id}:${page.key}`).join('|'), [pages])
  // Content changes are debounced so a drag or typing does not redraw on every step.
  useEffect(() => {
    if (!enabled) return undefined
    const timer = setTimeout(pump, 700)
    return () => clearTimeout(timer)
  }, [keys, enabled, pump])
  useEffect(() => {
    const state = store.current
    if (enabled) { state.failed = {}; pump() } else state.controller?.abort()
  }, [enabled]) // eslint-disable-line react-hooks/exhaustive-deps
  // Removed pages release their image.
  useEffect(() => {
    const state = store.current, alive = new Set(pages.map(page => page.id))
    for (const id of Object.keys(state.urls)) if (!alive.has(id)) { URL.revokeObjectURL(state.urls[id].url); delete state.urls[id]; delete state.failed[id] }
    setThumbs(current => (Object.keys(current).every(id => alive.has(id)) ? current : Object.fromEntries(Object.entries(current).filter(([id]) => alive.has(id)))))
  }, [keys]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const state = store.current
    state.alive = true
    return () => { state.alive = false; state.controller?.abort(); for (const entry of Object.values(state.urls)) URL.revokeObjectURL(entry.url); state.urls = {} }
  }, [])

  const want = useCallback((id, visible) => {
    const state = store.current
    if (visible) { state.wanted.add(id); pump() } else state.wanted.delete(id)
  }, [pump])
  const failed = id => store.current.failed[id] === pages.find(page => page.id === id)?.key
  return { thumbs, want, failed }
}
