import { useCallback, useSyncExternalStore } from 'react'
import { useCoarsePointer } from '@runly/ui'
import { parseStoredSpellcheck, resolveSpellcheck } from '../lib/spellcheckPref.js'

const cache = new Map()
const listeners = new Set()

const keyFor = (noteId) => `runly:v1:notes-spellcheck:${noteId}`

// Stored value only (true | false | undefined); the device default is applied
// by the hook so the cache never freezes a default.
function read(noteId) {
  if (cache.has(noteId)) return cache.get(noteId)
  let value
  try {
    value = parseStoredSpellcheck(localStorage.getItem(keyFor(noteId)))
  } catch {
    // storage unavailable: use the device default
  }
  cache.set(noteId, value)
  return value
}

function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// Spellcheck is a per note, per viewer preference (never sent to the API). A
// shared in-memory store keeps the settings panel and the editor in sync.
export function useNoteSpellcheck(noteId) {
  const coarse = useCoarsePointer()
  const stored = useSyncExternalStore(
    subscribe,
    () => (noteId ? read(noteId) : undefined),
    () => undefined,
  )
  const setEnabled = useCallback((enabled) => {
    if (!noteId) return
    cache.set(noteId, enabled === true)
    try {
      localStorage.setItem(keyFor(noteId), String(enabled === true))
    } catch {
      // keep the in-memory value for this session
    }
    listeners.forEach((fn) => fn())
  }, [noteId])
  return [resolveSpellcheck(stored, coarse), setEnabled]
}
