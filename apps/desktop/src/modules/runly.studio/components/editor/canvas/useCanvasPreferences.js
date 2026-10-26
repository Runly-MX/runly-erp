import { useCallback, useEffect, useState } from 'react'

// Per-viewer canvas preferences (snapping, grid, rulers, smart-guide
// visibility). Local only: never part of the design JSON, export or collab.
const KEY = 'runly.studio.canvas-preferences'
const DEFAULTS = { snapping: { enabled: true, page: true, objects: true, grid: false }, grid: { visible: false, size: 20, rulers: false }, guides: true }

function read() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(KEY) ?? 'null')
    return saved ? { snapping: { ...DEFAULTS.snapping, ...saved.snapping }, grid: { ...DEFAULTS.grid, ...saved.grid }, guides: saved.guides ?? true } : DEFAULTS
  } catch { return DEFAULTS }
}

export function useCanvasPreferences(editorRef, ready) {
  const [preferences, setPreferences] = useState(read)
  // Engine output: smart guides while dragging, grid/ruler ticks for the viewport.
  const [guides, setGuides] = useState([]), [references, setReferences] = useState(null)
  useEffect(() => {
    const editor = editorRef.current
    if (!ready || !editor) return
    try { editor.setSnappingOptions(preferences.snapping); editor.setGridOptions(preferences.grid) } catch { /* invalid stored values: engine keeps defaults */ }
  }, [ready, preferences, editorRef])
  const update = useCallback(change => setPreferences(current => {
    const next = typeof change === 'function' ? change(current) : change
    const merged = { snapping: { ...current.snapping, ...next.snapping }, grid: { ...current.grid, ...next.grid }, guides: next.guides ?? current.guides }
    try { window.localStorage.setItem(KEY, JSON.stringify(merged)) } catch { /* storage unavailable */ }
    return merged
  }), [])
  return {
    preferences, update, guides, references,
    onGuides: setGuides, onEditorPreferences: setReferences,
    toggle: {
      snapping: () => update(current => ({ snapping: { enabled: !current.snapping.enabled } })),
      grid: () => update(current => ({ grid: { visible: !current.grid.visible } })),
      rulers: () => update(current => ({ grid: { rulers: !current.grid.rulers } })),
    },
  }
}
