import { createContext, useContext } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
// Drag and drop: the cached list takes the new order at once and rolls back on error.
export function useReorderQuestions() {
  const token = useToken(), client = useQueryClient()
  return useMutation({
    mutationFn: async ({ lessonId, questionIds }) => unwrap(await runly.lms.reorderQuestions(lessonId, questionIds, token)),
    onMutate: async ({ lessonId, questionIds }) => {
      const key = [KEY, 'questions', lessonId]
      await client.cancelQueries({ queryKey: key })
      const previous = client.getQueryData(key)
      client.setQueryData(key, (old) => (Array.isArray(old)
        ? questionIds.map((id) => old.find((question) => question.id === id)).filter(Boolean)
        : old))
      return { key, previous }
    },
    onError: (error, _vars, context) => {
      if (context?.previous) client.setQueryData(context.key, context.previous)
      toast.error(error.message || 'No se pudo guardar el nuevo orden.')
    },
    onSettled: (_data, _error, { lessonId }) => client.invalidateQueries({ queryKey: [KEY, 'questions', lessonId] }),
  })
}

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

// Quiz transport. Internal learners use their session; the public share page
// provides a guest transport through this context ({ getQuiz, startAttempt,
// getAttempt, saveAnswers, submitAttempt }), so the quiz components are shared.
export const LmsQuizSourceContext = createContext(null)

function useQuizApi() {
  const source = useContext(LmsQuizSourceContext)
  const token = useToken()
  if (source) return { ...source, ready: true }
  return {
    ready: Boolean(token),
    getQuiz: (lessonId) => runly.lms.getQuiz(lessonId, token),
    startAttempt: (lessonId) => runly.lms.startAttempt(lessonId, token),
    getAttempt: (attemptId) => runly.lms.getAttempt(attemptId, token),
    saveAnswers: (attemptId, answers) => runly.lms.saveAnswers(attemptId, answers, token),
    submitAttempt: (attemptId, answers) => runly.lms.submitAttempt(attemptId, answers, token),
  }
}

export function useQuiz(lessonId) {
  const api = useQuizApi()
  return useQuery({ queryKey: [KEY, 'quiz', lessonId], queryFn: async () => unwrap(await api.getQuiz(lessonId)), enabled: api.ready && Boolean(lessonId), retry: false, refetchOnWindowFocus: false })
}

// Attempts carry the learner's answers: read once, never refreshed in the background.
export function useAttempt(attemptId) {
  const api = useQuizApi()
  return useQuery({
    queryKey: [KEY, 'attempt', attemptId], queryFn: async () => unwrap(await api.getAttempt(attemptId)),
    enabled: api.ready && Boolean(attemptId), retry: false, staleTime: Infinity, refetchOnWindowFocus: false,
  })
}

export function useStartAttempt() {
  const api = useQuizApi(), client = useQueryClient()
  return useMutation({
    mutationFn: async (lessonId) => unwrap(await api.startAttempt(lessonId)),
    onSuccess: (attempt, lessonId) => {
      if (attempt?.id) client.setQueryData([KEY, 'attempt', attempt.id], attempt)
      client.invalidateQueries({ queryKey: [KEY, 'quiz', lessonId] })
    },
  })
}

export function useSaveAnswers() {
  const api = useQuizApi()
  return useMutation({ mutationFn: async ({ attemptId, answers }) => unwrap(await api.saveAnswers(attemptId, answers)) })
}

export function useSubmitAttempt(courseId, lessonId) {
  const api = useQuizApi(), client = useQueryClient()
  return useMutation({
    mutationFn: async ({ attemptId, answers }) => unwrap(await api.submitAttempt(attemptId, answers)),
    onSuccess: (result) => {
      if (result?.id) client.setQueryData([KEY, 'attempt', result.id], result)
      refreshLearner(client, courseId, lessonId, result)
    },
  })
}

// Assignment transport, same idea as the quiz one: the public share page
// provides { listSubmissions, submit, presignUpload, confirmUpload } for guests.
export const LmsAssignmentSourceContext = createContext(null)

export function useAssignmentApi() {
  const source = useContext(LmsAssignmentSourceContext)
  const token = useToken()
  if (source) return { ...source, ready: true }
  return {
    ready: Boolean(token),
    listSubmissions: (lessonId) => runly.lms.listSubmissions(lessonId, token),
    submit: (lessonId, data) => runly.lms.submitAssignment(lessonId, data, token),
    presignUpload: (data) => runly.lms.presignUpload(data, token),
    confirmUpload: (fileId) => runly.lms.confirmUpload(fileId, token),
  }
}

export function useSubmissions(lessonId) {
  const api = useAssignmentApi()
  return useQuery({
    queryKey: [KEY, 'submissions', lessonId], queryFn: async () => unwrap(await api.listSubmissions(lessonId)),
    enabled: api.ready && Boolean(lessonId), retry: false,
  })
}

export function useSubmitAssignment(courseId, lessonId) {
  const api = useAssignmentApi(), client = useQueryClient()
  return useMutation({
    mutationFn: async (data) => unwrap(await api.submit(lessonId, data)),
    onSuccess: () => {
      refreshLearner(client, courseId, lessonId, { lessonStatus: 'pending_review' })
      toast.success('Entrega enviada. Te avisaremos cuando la revisen.')
    },
    onError: (error) => toast.error(error.message || 'No se pudo enviar la entrega.'),
  })
}

// ---- Grading ----------------------------------------------------------------------
// view: 'pending' (default queue) | 'history' (graded work, newest first).
export const useReviewQueue = (view = 'pending') => useRead(['review', view], (t) => runly.lms.getReviewQueue(view === 'history' ? { view: 'history' } : {}, t))
export const useReviewAttempt = (id) => useRead(['review-attempt', id], (t) => runly.lms.getReviewAttempt(id, t), { enabled: Boolean(id), retry: false, refetchOnWindowFocus: false })
export const useReviewSubmission = (id) => useRead(['review-submission', id], (t) => runly.lms.getReviewSubmission(id, t), { enabled: Boolean(id), retry: false, refetchOnWindowFocus: false })

const GRADED = ['review', 'review-attempt', 'review-submission', 'enrollments']
export const useGradeAttempt = () => useScopedAction((t, { id, ...data }) => runly.lms.gradeAttempt(id, data, t), GRADED, 'Calificación guardada.')
export const useGradeSubmission = () => useScopedAction((t, { id, ...data }) => runly.lms.gradeSubmission(id, data, t), GRADED)
export const useGrantExtraAttempt = () => useScopedAction(
  (t, { enrollmentId, lessonId }) => runly.lms.grantExtraAttempt(enrollmentId, lessonId, t),
  ['enrollments'], 'Intento extra otorgado. El alumno ya puede volver a presentar el examen.',
)
