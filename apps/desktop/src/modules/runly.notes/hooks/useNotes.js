import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../../auth/AuthProvider'
import { runly } from '../../../lib/runly'
import { hasMore } from '../lib/notesPages.js'

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

export const GRID_PAGE_SIZE = 60

// Paged list for the grid. Stays under the ['notes'] prefix so invalidations
// and optimistic cache patches reach it.
export function useInfiniteNotes(params = {}, { enabled = true } = {}) {
  const token = useToken()
  return useInfiniteQuery({
    queryKey: ['notes', 'infinite', params],
    queryFn: ({ pageParam }) =>
      runly.notes.list({ ...params, pageSize: GRID_PAGE_SIZE, page: pageParam }, token),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) =>
      hasMore(lastPage, GRID_PAGE_SIZE) ? allPages.length + 1 : undefined,
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
