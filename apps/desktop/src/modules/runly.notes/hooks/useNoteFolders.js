import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../../auth/AuthProvider'
import { runly } from '../../../lib/runly'

function useToken() {
  const { session } = useAuth()
  return session?.access_token
}

export function useNoteFolders() {
  const token = useToken()
  return useQuery({
    queryKey: ['notes', 'folders'],
    queryFn: () => runly.notes.listFolders(token),
    enabled: Boolean(token),
  })
}

export function useCreateNoteFolder() {
  const token = useToken()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => runly.notes.createFolder(data, token),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes', 'folders'] }),
  })
}

export function useUpdateNoteFolder() {
  const token = useToken()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ folderId, data }) => runly.notes.updateFolder(folderId, data, token),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes', 'folders'] }),
  })
}

export function useFolderShares(folderId) {
  const token = useToken()
  return useQuery({
    queryKey: ['notes', 'folders', folderId, 'shares'],
    queryFn: () => runly.notes.listFolderShares(folderId, token),
    enabled: Boolean(token) && Boolean(folderId),
  })
}

// Folder shares fan out to every note in the folder, so notes refetch too.
function useFolderShareMutation(fn) {
  const token = useToken()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars) => fn(vars, token),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes'] }),
  })
}

export const useShareFolder = () =>
  useFolderShareMutation(({ folderId, targetUserId, permission }, t) =>
    runly.notes.shareFolder(folderId, { targetUserId, permission }, t))
export const useUpdateFolderShare = () =>
  useFolderShareMutation(({ folderId, shareId, permission }, t) =>
    runly.notes.updateFolderShare(folderId, shareId, { permission }, t))
export const useRevokeFolderShare = () =>
  useFolderShareMutation(({ folderId, shareId }, t) => runly.notes.revokeFolderShare(folderId, shareId, t))

export function useDeleteNoteFolder() {
  const token = useToken()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (folderId) => runly.notes.deleteFolder(folderId, token),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes', 'folders'] }),
  })
}
