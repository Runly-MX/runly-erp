import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuth } from '../../../auth/AuthProvider'
import { runly } from '../../../lib/runly'
import { patchNoteInCache } from '../lib/noteCache.js'

// Mutation failures surface as a toast (the lists refetch on their own).
const failToast = (fallback) => (err) => toast.error(err?.message ?? fallback)

function useToken() {
  const { session } = useAuth()
  return session?.access_token
}

export function useNote(noteId) {
  const token = useToken()
  return useQuery({
    queryKey: ['notes', noteId],
    queryFn: () => runly.notes.get(noteId, token),
    enabled: Boolean(token) && Boolean(noteId),
  })
}

export function useUpdateNote() {
  const token = useToken()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ noteId, data }) => runly.notes.update(noteId, data, token),
    onError: failToast('No se pudieron guardar los cambios.'),
    onSuccess: (_, { noteId }) => {
      qc.invalidateQueries({ queryKey: ['notes', noteId] })
      qc.invalidateQueries({ queryKey: ['notes'] })
    },
  })
}

// Optimistic flag/color change from cards and the selection bar.
// patch: { isPinned } | { isArchived } | { backgroundColor }.
export function useToggleNoteFlag() {
  const token = useToken()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ noteId, patch }) => runly.notes.update(noteId, patch, token),
    onMutate: ({ noteId, patch }) => { patchNoteInCache(qc, noteId, patch) },
    onError: (err) => {
      qc.invalidateQueries({ queryKey: ['notes'] })
      failToast('No se pudo actualizar la nota.')(err)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes'] }),
  })
}

export function useTrashNote() {
  const token = useToken()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (noteId) => runly.notes.trash(noteId, token),
    onError: failToast('No se pudo mover la nota a la papelera.'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes'] }),
  })
}

// A collaborator drops a note shared with them (the note itself stays intact).
export function useLeaveNote() {
  const token = useToken()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (noteId) => runly.notes.leave(noteId, token),
    onError: failToast('No se pudo salir de la nota.'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes'] }),
  })
}

export function isNoteOwner(note, userId) {
  if (!note) return false
  if (typeof note.is_owner === 'boolean') return note.is_owner
  return Boolean(userId) && note.owner_user_id === userId
}

export function useRestoreNote() {
  const token = useToken()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (noteId) => runly.notes.restore(noteId, token),
    onError: failToast('No se pudo restaurar la nota.'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes'] }),
  })
}

export function usePermanentDeleteNote() {
  const token = useToken()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (noteId) => runly.notes.permanentDelete(noteId, token),
    onError: failToast('No se pudo eliminar la nota.'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes'] }),
  })
}
