import { keepPreviousData } from '@tanstack/react-query'
import { runly } from '../../../lib/runly.js'
import { useAction, useRead } from './useLmsData.js'

// Standalone evaluations (authoring). Mutations refresh every lms query.
export const useAssessments = (query) => useRead(['assessments', query], (t) => runly.lms.listAssessments(query, t), { placeholderData: keepPreviousData })
export const useAssessment = (id) => useRead(['assessment', id], (t) => runly.lms.getAssessment(id, t), { enabled: Boolean(id), retry: false })

export const useCreateAssessment = () => useAction((t, data) => runly.lms.createAssessment(data, t), 'Evaluación creada.')
export const useUpdateAssessment = (message = 'Evaluación guardada.') => useAction((t, { id, ...data }) => runly.lms.updateAssessment(id, data, t), message)
export const useArchiveAssessment = () => useAction((t, id) => runly.lms.archiveAssessment(id, t), 'Evaluación archivada.')
export const useCreateActivity = () => useAction((t, { assessmentId, ...data }) => runly.lms.createActivity(assessmentId, data, t), 'Actividad creada.')
export const useUpdateActivity = () => useAction((t, { id, ...data }) => runly.lms.updateActivity(id, data, t), 'Actividad guardada.')
export const useDeleteActivity = () => useAction((t, id) => runly.lms.deleteActivity(id, t), 'Actividad eliminada.')
export const useReorderActivities = () => useAction((t, { assessmentId, activityIds }) => runly.lms.reorderActivities(assessmentId, activityIds, t))
