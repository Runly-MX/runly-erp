import { useState, useCallback } from 'react'

const NOTES_LAYOUT_KEY = 'runly:v1:notes-layout'

function readLayout() {
  try {
    return localStorage.getItem(NOTES_LAYOUT_KEY) === 'split' ? 'split' : 'home'
  } catch {
    return 'home'
  }
}

// 'home' (card grid + editor overlay, default) or 'split' (list + editor panes).
export function useNotesLayout() {
  const [layout, setLayoutState] = useState(readLayout)
  const setLayout = useCallback((next) => {
    setLayoutState(next)
    try {
      localStorage.setItem(NOTES_LAYOUT_KEY, next)
    } catch {
      // localStorage unavailable: the choice still applies for this session.
    }
  }, [])
  return [layout, setLayout]
}
