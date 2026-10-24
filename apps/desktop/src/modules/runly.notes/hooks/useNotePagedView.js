import { useCallback, useSyncExternalStore } from 'react'

const DEFAULT = Object.freeze({ enabled: false, size: 'a4' })
const SIZES = ['a4', 'letter']
const cache = new Map()
const listeners = new Set()

const keyFor = (noteId) => `runly:v1:notes-paged:${noteId}`

function read(noteId) {
  if (cache.has(noteId)) return cache.get(noteId)
  let value = DEFAULT
  try {
    const raw = JSON.parse(localStorage.getItem(keyFor(noteId)) ?? 'null')
    if (raw && typeof raw === 'object') {
      value = { enabled: raw.enabled === true, size: SIZES.includes(raw.size) ? raw.size : 'a4' }
    }
  } catch {
    // storage unavailable or corrupt: fall back to the continuous view
  }
  cache.set(noteId, value)
  return value
}

function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// Paged view is a per note, per viewer presentation mode (never sent to the
// API). A shared store keeps the settings panel and the sheet in sync.
export function useNotePagedView(noteId) {
  const value = useSyncExternalStore(
    subscribe,
    () => (noteId ? read(noteId) : DEFAULT),
    () => DEFAULT,
  )
  const setPaged = useCallback((patch) => {
    if (!noteId) return
    const next = { ...read(noteId), ...patch }
    cache.set(noteId, next)
    try {
      localStorage.setItem(keyFor(noteId), JSON.stringify(next))
    } catch {
      // keep the in-memory value for this session
    }
    listeners.forEach((fn) => fn())
  }, [noteId])
  return [value, setPaged]
}
