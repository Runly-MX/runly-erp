import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../../auth/AuthProvider'
import { runly } from '../../../lib/runly'

function useToken() {
  const { session } = useAuth()
  return session?.access_token
}

export function useNotes(params = {}, { enabled = true } = {}) {
  const token = useToken()
  return useQuery({
    queryKey: ['notes', params],
    queryFn: () => runly.notes.list(params, token),
    enabled: Boolean(token) && enabled,
  })
}

export function useCreateNote() {
  const token = useToken()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => runly.notes.create(data, token),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes'] }),
  })
}
