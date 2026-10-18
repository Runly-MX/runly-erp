import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { runly } from '../../../lib/runly.js'
import { guestCourseKey } from '../lib/lmsShare.js'
import { patchOutline } from '../lib/lmsLabels.js'
import { KEY, unwrap, useRead, useToken } from './useLmsData.js'

// ---- Manager: course share link ------------------------------------------------
export const useCourseShare = (courseId, options = {}) => useRead(['share', courseId], (t) => runly.lms.getCourseShare(courseId, t), {
  enabled: Boolean(courseId) && (options.enabled ?? true), retry: false, refetchOnWindowFocus: false,
})

function useShareMutation(fn, successMessage) {
  const token = useToken(), client = useQueryClient()
  return useMutation({
    mutationFn: async ({ courseId, ...data }) => unwrap(await fn(courseId, data, token)),
    onSuccess: (share, { courseId }) => {
      client.setQueryData([KEY, 'share', courseId], share)
      if (successMessage) toast.success(successMessage)
    },
    onError: (error) => toast.error(error.message || 'No se pudo guardar el enlace.'),
  })
}

export const useUpdateCourseShare = () => useShareMutation((courseId, data, t) => runly.lms.updateCourseShare(courseId, data, t), 'Enlace actualizado.')
export const useRotateCourseShare = () => useShareMutation((courseId, _data, t) => runly.lms.rotateCourseShare(courseId, t), 'Nuevo enlace generado. El anterior ya no funciona.')

// ---- Manager: guest email invitations ------------------------------------------
export const useShareInvites = (courseId, options = {}) => useRead(['share-invites', courseId], (t) => runly.lms.listShareInvites(courseId, t), {
  enabled: Boolean(courseId) && (options.enabled ?? true), retry: false, refetchOnWindowFocus: false,
})

function useInviteMutation(fn, errorMessage) {
  const token = useToken(), client = useQueryClient()
  return useMutation({
    mutationFn: async ({ courseId, ...data }) => unwrap(await fn(courseId, data, token)),
    onSuccess: (_result, { courseId }) => client.invalidateQueries({ queryKey: [KEY, 'share-invites', courseId] }),
    onError: (error) => toast.error(error.message || errorMessage),
  })
}

export const useCreateShareInvites = () => useInviteMutation((courseId, { invites }, t) => runly.lms.createShareInvites(courseId, invites, t), 'No se pudieron crear las invitaciones.')
export const useResendShareInvite = () => useInviteMutation((courseId, { inviteId }, t) => runly.lms.resendShareInvite(courseId, inviteId, t), 'No se pudo reenviar la invitación.')
export const useRevokeShareInvite = () => useInviteMutation((courseId, { inviteId }, t) => runly.lms.revokeShareInvite(courseId, inviteId, t), 'No se pudo revocar la invitación.')

// ---- Guest (public share page, no session) ---------------------------------------
const guestApi = () => runly.lms.guest

export const useSharedCourse = (shareToken) => useQuery({
  queryKey: [KEY, 'shared', shareToken],
  queryFn: async () => unwrap(await guestApi().getCourse(shareToken)),
  enabled: Boolean(shareToken), retry: false, refetchOnWindowFocus: false, staleTime: 60_000,
})

// Keyed like the internal outline so the shared quiz hooks patch it the same way.
export const useGuestOutline = (shareToken, guestToken) => useQuery({
  queryKey: [KEY, 'outline', guestCourseKey(shareToken)],
  queryFn: async () => unwrap(await guestApi().me(shareToken, guestToken)),
  enabled: Boolean(shareToken && guestToken), retry: false, refetchOnWindowFocus: false,
})

export const useGuestLesson = (shareToken, guestToken, lessonId) => useQuery({
  queryKey: [KEY, 'guest-lesson', shareToken, lessonId],
  queryFn: async () => unwrap(await guestApi().openLesson(shareToken, lessonId, guestToken)),
  enabled: Boolean(shareToken && guestToken && lessonId), retry: false, staleTime: Infinity, gcTime: 0, refetchOnWindowFocus: false,
})

export function useJoinSharedCourse(shareToken) {
  return useMutation({ mutationFn: async ({ data, guestToken }) => unwrap(await guestApi().join(shareToken, data, guestToken)) })
}

// Invite-only links: code check, then (first time) the intake form.
export function useGuestAccess(shareToken) {
  return useMutation({ mutationFn: async (data) => unwrap(await guestApi().access(shareToken, data)) })
}

export function useGuestProgress(shareToken, guestToken) {
  const client = useQueryClient()
  const key = [KEY, 'outline', guestCourseKey(shareToken)]
  return useMutation({
    mutationFn: async ({ lessonId, ...data }) => unwrap(await guestApi().saveProgress(shareToken, lessonId, data, guestToken)),
    onSuccess: (result, { lessonId }) => {
      client.setQueryData(key, (old) => patchOutline(old, lessonId, result))
      if (result?.lessonStatus === 'completed') client.invalidateQueries({ queryKey: key })
    },
  })
}

// Quiz transport for LmsQuizSourceContext (see useLmsEval.js).
export function useGuestQuizSource(shareToken, guestToken) {
  return useMemo(() => (shareToken && guestToken ? {
    getQuiz: (lessonId) => guestApi().getQuiz(shareToken, lessonId, guestToken),
    startAttempt: (lessonId) => guestApi().startAttempt(shareToken, lessonId, guestToken),
    getAttempt: (attemptId) => guestApi().getAttempt(shareToken, attemptId, guestToken),
    saveAnswers: (attemptId, answers) => guestApi().saveAnswers(shareToken, attemptId, answers, guestToken),
    submitAttempt: (attemptId, answers) => guestApi().submitAttempt(shareToken, attemptId, answers, guestToken),
  } : null), [shareToken, guestToken])
}

// Assignment transport for LmsAssignmentSourceContext (see useLmsEval.js).
export function useGuestAssignmentSource(shareToken, guestToken) {
  return useMemo(() => (shareToken && guestToken ? {
    listSubmissions: (lessonId) => guestApi().listSubmissions(shareToken, lessonId, guestToken),
    submit: (lessonId, data) => guestApi().submitAssignment(shareToken, lessonId, data, guestToken),
    presignUpload: (data) => guestApi().presignUpload(shareToken, data, guestToken),
    confirmUpload: (fileId) => guestApi().confirmUpload(shareToken, fileId, guestToken),
  } : null), [shareToken, guestToken])
}
