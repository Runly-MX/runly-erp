import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { runly } from '../../../lib/runly.js'
import { clockOffset } from '../lib/lmsSession.js'
import { KEY, unwrap, useAction, useRead, useToken } from './useLmsData.js'
import { useSessionSource } from './useSessionSource.js'

// Every session payload carries serverNow; `offset` (server - device) keeps the
// countdown on the server clock whatever time the device shows.
export async function timed(call) {
  const sentAt = Date.now()
  const data = unwrap(await call())
  const receivedAt = Date.now()
  return { ...data, offset: clockOffset(data?.serverNow, sentAt, receivedAt) }
}

export const useMyAssessments = () => useRead(['my-assessments'], (t) => runly.lms.getMyAssessments(t), { staleTime: 15_000 })

export function useAssessmentOverview(assessmentId) {
  const token = useToken()
  return useQuery({
    queryKey: [KEY, 'assessment-overview', assessmentId],
    queryFn: () => timed(() => runly.lms.getAssessmentOverview(assessmentId, token)),
    enabled: Boolean(token && assessmentId), retry: false, refetchOnWindowFocus: false,
  })
}

// refetchInterval: polled after time runs out until the server closes it.
export function useSession(sessionId, { refetchInterval = false } = {}) {
  const source = useSessionSource()
  return useQuery({
    queryKey: [KEY, 'session', sessionId],
    queryFn: () => timed(() => source.getSession(sessionId)),
    enabled: Boolean(source.ready && sessionId), retry: false, refetchOnWindowFocus: true, refetchInterval,
  })
}

export function useStartSession(assessmentId) {
  const token = useToken(), client = useQueryClient()
  return useMutation({
    mutationFn: () => timed(() => runly.lms.startSession(assessmentId, token)),
    onSuccess: (data) => {
      client.setQueryData([KEY, 'session', data?.session?.id], data)
      client.invalidateQueries({ queryKey: [KEY, 'assessment-overview', assessmentId] })
    },
    onError: (error) => toast.error(error.message || 'No se pudo iniciar la evaluación.'),
  })
}

export function useSubmitSession(sessionId) {
  const source = useSessionSource(), client = useQueryClient()
  return useMutation({
    mutationFn: () => timed(() => source.submitSession(sessionId)),
    onSuccess: (data) => {
      client.setQueryData([KEY, 'session', sessionId], data)
      client.invalidateQueries({ queryKey: [KEY, 'my-assessments'] })
    },
    onError: (error) => toast.error(error.message || 'No se pudo entregar la evaluación.'),
  })
}

export function useSessionAttempt(sessionId, attemptId) {
  const source = useSessionSource()
  return useQuery({
    queryKey: [KEY, 'session-attempt', sessionId, attemptId],
    queryFn: async () => unwrap(await source.getSessionAttempt(sessionId, attemptId)),
    enabled: Boolean(source.ready && sessionId && attemptId), retry: false, refetchOnWindowFocus: false, refetchOnMount: 'always',
  })
}

// Errors are handled by the caller (autosave shows its own state).
export function useSaveDraft(sessionId) {
  const source = useSessionSource()
  return useMutation({ mutationFn: async ({ activityId, ...data }) => unwrap(await source.saveSessionDraft(sessionId, activityId, data)) })
}

export const useParticipants = (assessmentId) => useRead(['participants', assessmentId], (t) => runly.lms.listParticipants(assessmentId, t), { enabled: Boolean(assessmentId) })
export const useAddParticipants = () => useAction((t, { assessmentId, userProfileIds }) => runly.lms.addParticipants(assessmentId, { userProfileIds }, t))
