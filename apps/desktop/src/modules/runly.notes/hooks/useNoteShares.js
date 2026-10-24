import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuth } from '../../../auth/AuthProvider'
import { runly } from '../../../lib/runly'

function useToken() {
  const { session } = useAuth()
  return session?.access_token
}

export function useNoteShares(noteId) {
  const token = useToken()
  return useQuery({
    queryKey: ['notes', noteId, 'shares'],
    queryFn: () => runly.notes.listShares(noteId, token),
    enabled: Boolean(token) && Boolean(noteId),
  })
}

export function useShareNote() {
  const token = useToken()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ noteId, targetUserId, permission }) =>
      runly.notes.shareNote(noteId, { targetUserId, permission }, token),
    onSuccess: (_, { noteId }) =>
      qc.invalidateQueries({ queryKey: ['notes', noteId, 'shares'] }),
  })
}

export function useUpdateNoteShare() {
  const token = useToken()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ noteId, shareId, permission }) =>
      runly.notes.updateShare(noteId, shareId, { permission }, token),
    onSuccess: (_, { noteId }) =>
      qc.invalidateQueries({ queryKey: ['notes', noteId, 'shares'] }),
  })
}

export function useRevokeNoteShare() {
  const token = useToken()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ noteId, shareId }) => runly.notes.revokeShare(noteId, shareId, token),
    onSuccess: (_, { noteId }) =>
      qc.invalidateQueries({ queryKey: ['notes', noteId, 'shares'] }),
  })
}

export function usePublishNote() {
  const token = useToken()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (noteId) => runly.notes.publish(noteId, token),
    onError: (err) => toast.error(err?.message ?? 'No se pudo publicar la nota.'),
    onSuccess: (_, noteId) => qc.invalidateQueries({ queryKey: ['notes', noteId] }),
  })
}

export function useUnpublishNote() {
  const token = useToken()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (noteId) => runly.notes.unpublish(noteId, token),
    onError: (err) => toast.error(err?.message ?? 'No se pudo despublicar la nota.'),
    onSuccess: (_, noteId) => qc.invalidateQueries({ queryKey: ['notes', noteId] }),
  })
}
