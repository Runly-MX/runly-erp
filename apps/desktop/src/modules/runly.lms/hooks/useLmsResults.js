import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { runly } from '../../../lib/runly.js'
import { KEY, unwrap, useRead, useToken } from './useLmsData.js'

// Results, candidate record, grading and incidents (phase 5). The server
// returns the whole record after every action, so the cache is replaced as is.
export const useResultAssessments = () => useRead(['result-assessments'], (t) => runly.lms.listResultAssessments(t), { staleTime: 15_000 })
export const useAssessmentResults = (assessmentId) => useRead(['results', assessmentId], (t) => runly.lms.getAssessmentResults(assessmentId, t), { enabled: Boolean(assessmentId), retry: false })
export const useSessionRecord = (sessionId) => useRead(['record', sessionId], (t) => runly.lms.getSessionRecord(sessionId, t), { enabled: Boolean(sessionId), retry: false, refetchOnWindowFocus: false })

function useRecordAction(sessionId, call, { success = null } = {}) {
  const token = useToken(), client = useQueryClient()
  return useMutation({
    mutationFn: async (data) => unwrap(await call(data, token)),
    onSuccess: (record) => {
      if (record?.session) client.setQueryData([KEY, 'record', sessionId], record)
      if (record?.assessment?.id) client.invalidateQueries({ queryKey: [KEY, 'results', record.assessment.id] })
      client.invalidateQueries({ queryKey: [KEY, 'result-assessments'] })
      if (success) toast.success(success)
    },
  })
}

export const useGradeQuiz = (sessionId) => useRecordAction(sessionId, ({ attemptId, ...data }, t) => runly.lms.gradeSessionQuiz(sessionId, attemptId, data, t))
export const useGradeDelivery = (sessionId) => useRecordAction(sessionId, ({ submissionId, ...data }, t) => runly.lms.gradeSessionDelivery(sessionId, submissionId, data, t))
export const useDecideSession = (sessionId) => useRecordAction(sessionId, (data, t) => runly.lms.decideSession(sessionId, data, t), { success: 'Decisión guardada.' })
export const useExtendSession = (sessionId) => useRecordAction(sessionId, (data, t) => runly.lms.extendSession(sessionId, data, t), { success: 'Tiempo extendido.' })
export const useVoidSession = (sessionId) => useRecordAction(sessionId, (data, t) => runly.lms.voidSession(sessionId, data, t), { success: 'Sesión anulada.' })

export function useExtraSession(sessionId) {
  const token = useToken(), client = useQueryClient()
  return useMutation({
    mutationFn: async ({ enrollmentId, ...data }) => unwrap(await runly.lms.grantExtraSession(enrollmentId, data, token)),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: [KEY, 'record', sessionId] })
      toast.success('Intento adicional autorizado.')
    },
  })
}

export const useAssessmentGraders = (assessmentId, options = {}) => useRead(['graders', assessmentId], (t) => runly.lms.getAssessmentGraders(assessmentId, t), { enabled: Boolean(assessmentId) && (options.enabled ?? true), retry: false })
export function useSetGraders(assessmentId) {
  const token = useToken(), client = useQueryClient()
  return useMutation({
    mutationFn: async (members) => unwrap(await runly.lms.setAssessmentGraders(assessmentId, members, token)),
    onSuccess: (list) => { client.setQueryData([KEY, 'graders', assessmentId], list); toast.success('Evaluadores guardados.') },
    onError: (error) => toast.error(error.message || 'No se pudieron guardar los evaluadores.'),
  })
}

export async function downloadResults(assessmentId, format, token) {
  return runly.lms.exportAssessmentResults(assessmentId, format, token)
}
