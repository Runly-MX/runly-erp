import { buildYDocSave, applyServerCatchUp } from './ydocPersistence.js'

export async function flushNoteSave({ readOnly, noteId, token, ydoc, provider, notes, queryClient, state, logger = console }) {
  const { pendingRef, ydocDirtyRef, savingRef, rerunRef, flushRef, capturedYDocRef } = state

  if (readOnly || !noteId || !token) return
  // Capture even while another request is in flight: unmount destroys the
  // engine before that request resolves. A new diff from the acknowledged
  // vector includes previous unacknowledged edits, so latest replaces older.
  if (ydoc && provider && ydocDirtyRef.current && !ydoc.isDestroyed) {
    capturedYDocRef.current = buildYDocSave(ydoc, provider.serverStateVector)
  }
  if (savingRef.current) {
    rerunRef.current = true
    return
  }
  // Payloads are independent of the engine and remain usable after teardown.
  // Only an active document may receive acknowledgements and catch-up below.
  const snap = pendingRef.current
  const ydocSave = capturedYDocRef.current
  if (!snap && !ydocSave) return
  savingRef.current = true
  pendingRef.current = null
  capturedYDocRef.current = null
  ydocDirtyRef.current = false
  try {
    // The Y.js state goes first: it is the collaborative source of truth
    // (the HTML column is a derived preview). The server MERGES it, so this
    // save can never erase a collaborator's work.
    if (ydocSave) {
      try {
        const res = await notes.saveYDoc(noteId, ydocSave.update, token, {
          stateVector: ydocSave.stateVector,
        })
        if (!ydoc.isDestroyed) {
          provider.serverStateVector = ydocSave.sentStateVector
          applyServerCatchUp(ydoc, res)
        }
      } catch (err) {
        if (!capturedYDocRef.current) capturedYDocRef.current = ydocSave
        ydocDirtyRef.current = true
        logger.error('[NoteEditor] Y.js state save failed:', err?.message ?? err)
      }
    }
    if (snap) {
      try {
        await notes.update(noteId, snap, token)
        // While newer edits are still pending, a refetch would bring back
        // this older title over the optimistic one; the next save refreshes.
        if (!pendingRef.current) {
          queryClient.invalidateQueries({ queryKey: ['notes'] })
          queryClient.invalidateQueries({ queryKey: ['notes', noteId] })
        }
      } catch (err) {
        logger.warn('[NoteEditor] content autosave failed:', err?.message)
        // Keep the snapshot so the next edit (or the unmount flush) retries.
        if (!pendingRef.current) pendingRef.current = snap
      }
    }
  } finally {
    savingRef.current = false
    // A flush requested while this one was in flight (switch to view, a new
    // debounce) runs now, even without another edit.
    if (rerunRef.current) {
      rerunRef.current = false
      queueMicrotask(() => flushRef.current())
    }
  }
}
