import { useNavigate } from 'react-router-dom'
import { LinkedTasksPanel } from '@runly/ui'
import { useAuth } from '../auth/AuthProvider.jsx'
import { useCreateLinkedTask, useTasksByTarget } from '../modules/runly.projects/hooks/useProjectsData.js'

// Tasks linked to one record, mounted in module detail screens. `type` is a
// relation-targets key (vehicle, hr_employee, inventory_item, contact...).
// Hidden when the user cannot read tasks or the projects module is off.
export function RecordTasks({ type, id, title }) {
  const navigate = useNavigate()
  const { userProfile } = useAuth()
  const permissions = userProfile?.permissions ?? []
  const canRead = Boolean(userProfile?.isAdmin || permissions.includes('projects.task.read'))
  const canCreate = Boolean(userProfile?.isAdmin || permissions.includes('projects.task.create'))
  const query = useTasksByTarget(canRead ? type : null, id)
  const create = useCreateLinkedTask(type, id)

  if (!canRead || !id) return null
  if (query.error?.status === 403 || query.error?.status === 404) return null

  return (
    <LinkedTasksPanel
      title={title}
      tasks={query.data ?? []}
      isLoading={query.isLoading}
      error={query.error}
      creating={create.isPending}
      onCreate={canCreate ? (taskTitle, options) => create.mutate({ title: taskTitle }, options) : undefined}
      onOpenTask={(task) => navigate(`/app/m/runly.projects?open=task:${task.id}&project=${task.projectId}`)}
    />
  )
}
