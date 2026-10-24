// Tiny per-note pub/sub so the editor can publish autosave state to the page
// header without prop drilling. Status: 'saved' | 'saving' | 'error' | 'offline'.
const statuses = new Map()
const listeners = new Map()

export function getSaveStatus(noteId) {
  return statuses.get(noteId) ?? 'saved'
}

export function setSaveStatus(noteId, status) {
  if (getSaveStatus(noteId) === status) return
  statuses.set(noteId, status)
  listeners.get(noteId)?.forEach((fn) => fn())
}

export function subscribeSaveStatus(noteId, fn) {
  if (!listeners.has(noteId)) listeners.set(noteId, new Set())
  listeners.get(noteId).add(fn)
  return () => listeners.get(noteId)?.delete(fn)
}
