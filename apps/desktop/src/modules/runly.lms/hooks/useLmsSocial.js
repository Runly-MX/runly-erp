import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { runly } from '../../../lib/runly.js'
import { KEY, unwrap, useRead, useToken } from './useLmsData.js'
import { errorCode } from './useLmsEval.js'

const ERROR_MESSAGES = {
  NOT_ELIGIBLE: 'Podrás calificar el curso cuando lleves al menos el 30% de avance.',
}

// Mutation that refreshes the given lms query families (phase 3 social data).
function useSocialAction(fn, families, successMessage) {
  const token = useToken(), client = useQueryClient()
  return useMutation({
    mutationFn: async (vars) => unwrap(await fn(token, vars)),
    onSuccess: () => {
      families.forEach((family) => client.invalidateQueries({ queryKey: [KEY, family] }))
      if (successMessage) toast.success(successMessage)
    },
    onError: (error) => toast.error(ERROR_MESSAGES[errorCode(error)] ?? (error.message || 'No se pudo completar la acción.')),
  })
}

// ---- Discussion -------------------------------------------------------------------
export const useComments = (lessonId, options = {}) => useRead(
  ['comments', lessonId], (t) => runly.lms.listComments(lessonId, t),
  { enabled: Boolean(lessonId) && (options.enabled ?? true), retry: false },
)
export const useCreateComment = () => useSocialAction((t, { lessonId, ...data }) => runly.lms.createComment(lessonId, data, t), ['comments'])
export const useUpdateComment = (message) => useSocialAction((t, { id, ...data }) => runly.lms.updateComment(id, data, t), ['comments'], message)
export const useDeleteComment = () => useSocialAction((t, id) => runly.lms.deleteComment(id, t), ['comments'], 'Comentario eliminado.')

// ---- Reviews ----------------------------------------------------------------------
// A review write changes the cached course aggregates shown on cards and headers.
const REVIEWED = ['reviews', 'catalog', 'my', 'course', 'courses', 'outline']
export const useReviews = (courseId, options = {}) => useRead(
  ['reviews', courseId], (t) => runly.lms.getReviews(courseId, t),
  { enabled: Boolean(courseId) && (options.enabled ?? true), retry: false },
)
export const useSaveMyReview = () => useSocialAction((t, { courseId, ...data }) => runly.lms.saveMyReview(courseId, data, t), REVIEWED, 'Gracias por tu reseña.')
export const useModerateReview = (message) => useSocialAction((t, { id, ...data }) => runly.lms.moderateReview(id, data, t), REVIEWED, message)

// ---- Announcements ----------------------------------------------------------------
const ANNOUNCED = ['announcements', 'outline']
export const useAnnouncements = (courseId, options = {}) => useRead(
  ['announcements', courseId], (t) => runly.lms.listAnnouncements(courseId, t),
  { enabled: Boolean(courseId) && (options.enabled ?? true), retry: false },
)
export const useSaveAnnouncement = () => useSocialAction(
  (t, { id, courseId, ...data }) => (id ? runly.lms.updateAnnouncement(id, data, t) : runly.lms.createAnnouncement(courseId, data, t)),
  ANNOUNCED, 'Anuncio guardado.',
)
export const useDeleteAnnouncement = () => useSocialAction((t, id) => runly.lms.deleteAnnouncement(id, t), ANNOUNCED, 'Anuncio eliminado.')
