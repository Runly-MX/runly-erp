import { useSyncExternalStore } from 'react'
import { getSaveStatus, subscribeSaveStatus } from '../lib/saveStatus.js'

export function useSaveStatus(noteId) {
  return useSyncExternalStore(
    (fn) => subscribeSaveStatus(noteId, fn),
    () => getSaveStatus(noteId),
    () => 'saved',
  )
}
