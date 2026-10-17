import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { runly } from '../../../lib/runly.js'
import { patchOutline } from '../lib/lmsLabels.js'
import { KEY, unwrap, useRead, useToken } from './useLmsData.js'

// Mutation that refreshes only the given lms query families.
function useScopedAction(fn, families, successMessage) {
  const token = useToken(), client = useQueryClient()
  return useMutation({
    mutationFn: async (vars) => unwrap(await fn(token, vars)),
    onSuccess: () => {
      families.forEach((family) => client.invalidateQueries({ queryKey: [KEY, family] }))
      if (successMessage) toast.success(successMessage)
    },
    onError: (error) => toast.error(error.message || 'No se pudo completar la acción.'),
  })
}

// Code of an LmsError response (NO_ATTEMPTS, EXPIRED, PENDING...).
export const errorCode = (error) => error?.details?.code ?? null

// ---- Authoring: quiz questions --------------------------------------------------
export const useQuestions = (lessonId, options = {}) => useRead(
  ['questions', lessonId], (t) => runly.lms.listQuestions(lessonId, t),
  { enabled: Boolean(lessonId) && (options.enabled ?? true), refetchOnWindowFocus: false },
)
export const useSaveQuestion = () => useScopedAction(
  (t, { id, lessonId, ...data }) => (id ? runly.lms.updateQuestion(id, data, t) : runly.lms.createQuestion(lessonId, data, t)),
  ['questions'], 'Pregunta guardada.',
)
export const useDeleteQuestion = () => useScopedAction((t, id) => runly.lms.deleteQuestion(id, t), ['questions'], 'Pregunta eliminada.')
export const useReorderQuestions = () => useScopedAction((t, { lessonId, questionIds }) => runly.lms.reorderQuestions(lessonId, questionIds, t), ['questions'])

// ---- Learner ----------------------------------------------------------------------
// A quiz submit or an assignment submission changes the lesson status: the
// outline (and so the unlock of later lessons), summaries and "Mis cursos" refresh.
function refreshLearner(client, courseId, lessonId, result) {
  if (result?.lessonStatus) client.setQueryData([KEY, 'outline', courseId], (old) => patchOutline(old, lessonId, result))
  for (const key of [['outline', courseId], ['quiz', lessonId], ['submissions', lessonId], ['my']]) client.invalidateQueries({ queryKey: [KEY, ...key] })
}

export function useRefreshLearner(courseId, lessonId) {
  const client = useQueryClient()
  return () => refreshLearner(client, courseId, lessonId)
}

export const useQuiz = (lessonId) => useRead(['quiz', lessonId], (t) => runly.lms.getQuiz(lessonId, t), { enabled: Boolean(lessonId), retry: false, refetchOnWindowFocus: false })
// Attempts carry the learner's answers: read once, never refreshed in the background.
export const useAttempt = (attemptId) => useRead(['attempt', attemptId], (t) => runly.lms.getAttempt(attemptId, t), {
  enabled: Boolean(attemptId), retry: false, staleTime: Infinity, refetchOnWindowFocus: false,
})

export function useStartAttempt() {
  const token = useToken(), client = useQueryClient()
  return useMutation({
    mutationFn: async (lessonId) => unwrap(await runly.lms.startAttempt(lessonId, token)),
    onSuccess: (attempt, lessonId) => {
      if (attempt?.id) client.setQueryData([KEY, 'attempt', attempt.id], attempt)
      client.invalidateQueries({ queryKey: [KEY, 'quiz', lessonId] })
    },
  })
}

export function useSaveAnswers() {
  const token = useToken()
  return useMutation({ mutationFn: async ({ attemptId, answers }) => unwrap(await runly.lms.saveAnswers(attemptId, answers, token)) })
}

export function useSubmitAttempt(courseId, lessonId) {
  const token = useToken(), client = useQueryClient()
  return useMutation({
    mutationFn: async ({ attemptId, answers }) => unwrap(await runly.lms.submitAttempt(attemptId, answers, token)),
    onSuccess: (result) => {
      if (result?.id) client.setQueryData([KEY, 'attempt', result.id], result)
      refreshLearner(client, courseId, lessonId, result)
    },
  })
}

export const useSubmissions = (lessonId) => useRead(['submissions', lessonId], (t) => runly.lms.listSubmissions(lessonId, t), { enabled: Boolean(lessonId), retry: false })

export function useSubmitAssignment(courseId, lessonId) {
  const token = useToken(), client = useQueryClient()
  return useMutation({
    mutationFn: async (data) => unwrap(await runly.lms.submitAssignment(lessonId, data, token)),
    onSuccess: () => {
      refreshLearner(client, courseId, lessonId, { lessonStatus: 'pending_review' })
      toast.success('Entrega enviada. Te avisaremos cuando la revisen.')
    },
    onError: (error) => toast.error(error.message || 'No se pudo enviar la entrega.'),
  })
}

// ---- Grading ----------------------------------------------------------------------
export const useReviewQueue = () => useRead(['review'], (t) => runly.lms.getReviewQueue({}, t))
export const useReviewAttempt = (id) => useRead(['review-attempt', id], (t) => runly.lms.getReviewAttempt(id, t), { enabled: Boolean(id), retry: false, refetchOnWindowFocus: false })
export const useReviewSubmission = (id) => useRead(['review-submission', id], (t) => runly.lms.getReviewSubmission(id, t), { enabled: Boolean(id), retry: false, refetchOnWindowFocus: false })

const GRADED = ['review', 'review-attempt', 'review-submission', 'enrollments']
export const useGradeAttempt = () => useScopedAction((t, { id, ...data }) => runly.lms.gradeAttempt(id, data, t), GRADED, 'Calificación guardada.')
export const useGradeSubmission = () => useScopedAction((t, { id, ...data }) => runly.lms.gradeSubmission(id, data, t), GRADED)
export const useGrantExtraAttempt = () => useScopedAction(
  (t, { enrollmentId, lessonId }) => runly.lms.grantExtraAttempt(enrollmentId, lessonId, t),
  ['enrollments'], 'Intento extra otorgado. El alumno ya puede volver a presentar el examen.',
)
