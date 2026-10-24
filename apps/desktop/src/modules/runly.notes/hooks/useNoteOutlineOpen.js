import { useCallback, useState } from 'react'

const KEY = 'runly:v1:notes-outline-open'

function read() {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

// Per-viewer preference for the outline panel (not synced to the server).
export function useNoteOutlineOpen() {
  const [open, setOpen] = useState(read)
  const set = useCallback((next) => {
    setOpen((prev) => {
      const value = typeof next === 'function' ? next(prev) : Boolean(next)
      try {
        localStorage.setItem(KEY, value ? '1' : '0')
      } catch {
        // storage unavailable: the toggle still works for this session
      }
      return value
    })
  }, [])
  return [open, set]
}
