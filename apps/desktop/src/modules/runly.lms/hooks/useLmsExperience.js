import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { runly } from '../../../lib/runly.js'
import { KEY, unwrap, useRead, useToken } from './useLmsData.js'

// ---- Course page ------------------------------------------------------------------
export const useCourseOverview = (courseId) => useRead(['overview', courseId], (t) => runly.lms.getCourseOverview(courseId, t), { enabled: Boolean(courseId), retry: false })

// ---- Lesson resources (lesson editor) ----------------------------------------------
export const useLessonResources = (lessonId) => useRead(['resources', lessonId], (t) => runly.lms.listLessonResources(lessonId, t), { enabled: Boolean(lessonId) })

// Writes refresh the editor list only; the player reads resources with the lesson.
function useResourceAction(lessonId, fn, successMessage) {
  const token = useToken(), client = useQueryClient()
  return useMutation({
    mutationFn: async (vars) => unwrap(await fn(token, vars)),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: [KEY, 'resources', lessonId] })
      if (successMessage) toast.success(successMessage)
    },
    onError: (error) => toast.error(error.message || 'No se pudo completar la acción.'),
  })
}

export const useAddResource = (lessonId) => useResourceAction(lessonId, (t, data) => runly.lms.addLessonResource(lessonId, data, t))
export const useUpdateResource = (lessonId) => useResourceAction(lessonId, (t, { id, ...data }) => runly.lms.updateLessonResource(id, data, t), 'Recurso guardado.')
export const useDeleteResource = (lessonId) => useResourceAction(lessonId, (t, id) => runly.lms.deleteLessonResource(id, t), 'Recurso eliminado.')

// Drag and drop: the list takes the new order right away and rolls back on error.
export function useReorderResources(lessonId) {
  const token = useToken(), client = useQueryClient()
  const key = [KEY, 'resources', lessonId]
  return useMutation({
    mutationFn: async (resources) => unwrap(await runly.lms.reorderLessonResources(lessonId, resources.map((item) => item.id), token)),
    onMutate: async (resources) => {
      await client.cancelQueries({ queryKey: key })
      const previous = client.getQueryData(key)
      client.setQueryData(key, resources)
      return { previous }
    },
    onError: (error, _vars, context) => {
      if (context?.previous) client.setQueryData(key, context.previous)
      toast.error(error.message || 'No se pudo guardar el nuevo orden.')
    },
    onSettled: () => client.invalidateQueries({ queryKey: key }),
  })
}
