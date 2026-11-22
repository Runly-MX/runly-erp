import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { runly } from '../../../lib/runly.js'
import { KEY, unwrap } from './useLmsData.js'
import { timed } from './useLmsSession.js'

// Public evaluation link (/app/p/lms/evaluacion/:token): no Runly session.
const api = () => runly.lms.evaluationGuest
const meKey = (linkToken) => [KEY, 'evaluation-me', linkToken]

export function useEvaluationLink(linkToken) {
  return useQuery({
    queryKey: [KEY, 'evaluation-link', linkToken],
    queryFn: () => timed(() => api().getEvaluation(linkToken)),
    enabled: Boolean(linkToken), retry: false, refetchOnWindowFocus: false,
  })
}

// The registered participant's overview (same shape as the internal one).
export function useEvaluationMe(linkToken, guestToken) {
  return useQuery({
    queryKey: meKey(linkToken),
    queryFn: () => timed(() => api().me(linkToken, guestToken)),
    enabled: Boolean(linkToken && guestToken), retry: false, refetchOnWindowFocus: false,
  })
}

export function useEvaluationRegister(linkToken) {
  return useMutation({ mutationFn: async ({ data, guestToken }) => unwrap(await api().register(linkToken, data, guestToken)) })
}

// Access code: invited people, and registered people on another device.
export function useEvaluationAccess(linkToken) {
  return useMutation({ mutationFn: async (data) => unwrap(await api().access(linkToken, data)) })
}

export function useEvaluationResume(linkToken) {
  return useMutation({ mutationFn: async (data) => unwrap(await api().resume(linkToken, data)) })
}

export function useEvaluationStart(linkToken, guestToken) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => timed(() => api().start(linkToken, guestToken)),
    onSuccess: (data) => {
      client.setQueryData([KEY, 'session', data?.session?.id], data)
      client.invalidateQueries({ queryKey: meKey(linkToken) })
    },
  })
}

export const forgetEvaluation = (client, linkToken) => client.removeQueries({ queryKey: meKey(linkToken) })
