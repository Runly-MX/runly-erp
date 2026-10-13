import { buildYDocSave, applyServerCatchUp } from './ydocPersistence.js'

export async function flushNoteSave({ readOnly, noteId, token, ydoc, provider, notes, queryClient, state, logger = console }) {
  const { pendingRef, ydocDirtyRef, savingRef, rerunRef, flushRef } = state

    if (readOnly || !noteId || !token) return
    if (savingRef.current) {
      rerunRef.current = true
      return
    }
    // Build both payloads synchronously: on note switch the engine's Y.Doc is
    // destroyed right after this unmount flush starts, so nothing may be read
    // from it after the first await.
    const snap = pendingRef.current
    const ydocSave = ydoc && provider && ydocDirtyRef.current
      ? buildYDocSave(ydoc, provider.serverStateVector)
      : null
    if (!snap && !ydocSave) return
    savingRef.current = true
    pendingRef.current = null
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
          provider.serverStateVector = ydocSave.sentStateVector
          applyServerCatchUp(ydoc, res)
        } catch (err) {
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
