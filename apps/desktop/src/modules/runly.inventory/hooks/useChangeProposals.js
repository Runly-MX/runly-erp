import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../../auth/AuthProvider'
import { runly } from '../../../lib/runly'

const KEY = ['inventory', 'change-proposals']

// Pending proposals the user may review (the API only returns those on items in areas they can write).
export function useChangeProposals({ enabled = true, status = 'pending' } = {}) {
  const { session } = useAuth()
  const token = session?.access_token
  return useQuery({
    queryKey: [...KEY, status],
    queryFn: () => runly.inventory.listChangeProposals({ status }, token).then((res) => res?.data ?? []),
    enabled: Boolean(token) && enabled,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: true,
  })
}

export function useReviewChangeProposal() {
  const { session } = useAuth()
  const token = session?.access_token
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, decisions, note }) => runly.inventory.reviewChangeProposal(id, { decisions, ...(note ? { note } : {}) }, token).then((res) => res?.data ?? res),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory'] }),
  })
}

export function useSubmitChangeProposal() {
  const { session } = useAuth()
  const token = session?.access_token
  return useMutation({
    mutationFn: (body) => runly.inventory.submitChangeProposal(body, token).then((res) => res?.data ?? res),
  })
}
