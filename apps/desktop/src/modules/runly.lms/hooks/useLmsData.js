import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuth } from '../../../auth/AuthProvider.jsx'
import { runly } from '../../../lib/runly.js'
import { patchOutline } from '../lib/lmsLabels.js'

export const useToken = () => useAuth().session?.access_token
const unwrap = (response) => response?.data ?? response
const KEY = 'lms'

export function useLmsPermissions() {
  const profile = useAuth().userProfile
  const permissions = profile?.permissions ?? []
  const can = (key) => Boolean(profile?.isAdmin || permissions.includes(key))
  return {
    canManageCourses: can('lms.course.manage'),
    canManageEnrollments: can('lms.enrollment.manage'),
  }
}

function useRead(key, fn, options = {}) {
  const token = useToken()
  const enabled = Boolean(token) && (options.enabled ?? true)
  return useQuery({ queryKey: [KEY, ...key], queryFn: async () => unwrap(await fn(token)), refetchOnWindowFocus: true, ...options, enabled })
}

// ---- Learner ------------------------------------------------------------------
export const useCatalog = () => useRead(['catalog'], (t) => runly.lms.getCatalog(t), { staleTime: 30_000 })
export const useMyCourses = () => useRead(['my'], (t) => runly.lms.getMyCourses(t), { staleTime: 15_000 })
export const useOutline = (courseId) => useRead(['outline', courseId], (t) => runly.lms.getOutline(courseId, t), { enabled: Boolean(courseId), retry: false, refetchOnWindowFocus: false })
// A refetch would hand the player a new mediaUrl and restart the video, so the
// lesson payload is read once per open and never refreshed in the background.
export const useLesson = (lessonId) => useRead(['lesson', lessonId], (t) => runly.lms.openLesson(lessonId, t), {
  enabled: Boolean(lessonId), retry: false, staleTime: Infinity, gcTime: 0, refetchOnWindowFocus: false,
})

// Progress saves are frequent: they patch the cached outline instead of
// invalidating the player queries. `courseId` routes the patch.
export function useSaveProgress(courseId) {
  const token = useToken(), client = useQueryClient()
  return useMutation({
    mutationFn: async ({ lessonId, ...data }) => unwrap(await runly.lms.saveProgress(lessonId, data, token)),
    onSuccess: (result, { lessonId }) => {
      client.setQueryData([KEY, 'outline', courseId], (old) => patchOutline(old, lessonId, result))
      client.invalidateQueries({ queryKey: [KEY, 'my'] })
      // A completed lesson can unlock the next one: only the outline refetches
      // (the open lesson keeps its media URL and playback position).
      if (result?.lessonStatus === 'completed') client.invalidateQueries({ queryKey: [KEY, 'outline', courseId] })
    },
  })
}

// ---- Authoring ------------------------------------------------------------------
export const useCourses = (query) => useRead(['courses', query], (t) => runly.lms.listCourses(query, t), { placeholderData: keepPreviousData })
export const useCourse = (id) => useRead(['course', id], (t) => runly.lms.getCourse(id, t), { enabled: Boolean(id), retry: false })
export const useEnrollments = (courseId, options = {}) => useRead(['enrollments', courseId], (t) => runly.lms.listEnrollments(courseId, t), { enabled: Boolean(courseId) && (options.enabled ?? true) })

// Company users that can be assigned (the API already excludes MirAI/bots).
export const useUserCandidates = (search, options = {}) => useRead(
  ['candidates', search],
  (t) => runly.identity.listCandidates(t, { search: search || undefined, pageSize: 50 }),
  { staleTime: 30_000, placeholderData: keepPreviousData, ...options },
)

// Generic mutation: runs fn(token, vars) and refreshes every lms query.
function useAction(fn, successMessage) {
  const token = useToken(), client = useQueryClient()
  return useMutation({
    mutationFn: async (vars) => unwrap(await fn(token, vars)),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: [KEY] })
      if (successMessage) toast.success(successMessage)
    },
    onError: (error) => toast.error(error.message || 'No se pudo completar la acción.'),
  })
}

export const useEnroll = () => useAction((t, courseId) => runly.lms.enroll(courseId, t), 'Te inscribiste al curso.')
export const useCreateCourse = () => useAction((t, data) => runly.lms.createCourse(data, t), 'Curso creado.')
export const useUpdateCourse = (message = 'Curso guardado.') => useAction((t, { id, ...data }) => runly.lms.updateCourse(id, data, t), message)
export const useArchiveCourse = () => useAction((t, id) => runly.lms.archiveCourse(id, t), 'Curso archivado.')
export const useCreateSection = () => useAction((t, { courseId, ...data }) => runly.lms.createSection(courseId, data, t), 'Sección creada.')
export const useUpdateSection = () => useAction((t, { id, ...data }) => runly.lms.updateSection(id, data, t), 'Sección guardada.')
export const useDeleteSection = () => useAction((t, id) => runly.lms.deleteSection(id, t), 'Sección eliminada.')
export const useSaveLesson = () => useAction(
  (t, { id, sectionId, ...data }) => (id ? runly.lms.updateLesson(id, { ...data, sectionId }, t) : runly.lms.createLesson(sectionId, data, t)),
  'Lección guardada.',
)
export const useDeleteLesson = () => useAction((t, id) => runly.lms.deleteLesson(id, t), 'Lección eliminada.')
export const useReorder = () => useAction((t, { courseId, ...data }) => runly.lms.reorder(courseId, data, t))
export const useAssign = () => useAction((t, { courseId, ...data }) => runly.lms.assign(courseId, data, t))
export const useUpdateEnrollment = () => useAction((t, { id, ...data }) => runly.lms.updateEnrollment(id, data, t), 'Inscripción actualizada.')

// Covers and downloadable documents go through the regular files endpoint.
export function useUploadLmsFile() {
  const token = useToken()
  return useMutation({
    mutationFn: async ({ file, entityType = 'LmsLesson', entityId }) => {
      const form = new FormData()
      form.append('file', file)
      form.append('moduleKey', 'runly.lms')
      form.append('entityType', entityType)
      if (entityId) form.append('entityId', entityId)
      return unwrap(await runly.files.upload(form, token))
    },
    onError: (error) => toast.error(error.message || 'No se pudo subir el archivo.'),
  })
}
