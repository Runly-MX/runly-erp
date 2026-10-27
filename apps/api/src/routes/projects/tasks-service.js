import { createUserAccessService } from '../../services/user-access-service.js'
import { createProjectFilesService } from './project-files.js'
import { publishDomainEvent } from '../../services/domain-events/events.js'
// Dates go out as plain days (YYYY-MM-DD) so automations compare them without time zones.
export function rescheduledPayload(task) {
  const day = (value) => (value ? new Date(value).toISOString().slice(0, 10) : null) // eslint-disable-line no-restricted-syntax -- task dates are UTC calendar days
  return {
    id: task.id,
    projectId: task.projectId,
    title: task.title,
    statusId: task.statusId ?? null,
    assigneeId: task.assigneeId ?? null,
    priority: task.priority ?? null,
    startDate: day(task.startDate),
    dueDate: day(task.dueDate),
  }
}
// Every projects.task.* event carries the same payload (PROJECT_TASK_FIELDS in event-catalog.js).
export const taskEventPayload = rescheduledPayload

export class TaskServiceError extends Error {
  constructor(message, status = 500) {
    super(message)
    this.name = 'TaskServiceError'
    this.status = status
  }
}

function toNoonUTC(val) {
  const str = String(val)
  const part = str.includes('T') ? str.slice(0, 10) : str
  return new Date(`${part}T12:00:00.000Z`)
}

const RRULE_PRESETS = {
  'FREQ=DAILY': (now) => new Date(now.getTime() + 24 * 60 * 60 * 1000),
  'FREQ=WEEKLY': (now) => new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
  'FREQ=WEEKLY;INTERVAL=2': (now) => new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
  'FREQ=MONTHLY': (now) => {
    const d = new Date(now)
    d.setMonth(d.getMonth() + 1)
    return d
  },
}

export function computeRruleNextAt(rrule) {
  const fn = RRULE_PRESETS[rrule]
  return fn ? fn(new Date()) : null
}

export function createTasksService({ prisma }) {
  const access = createUserAccessService({ prisma })
  const files = createProjectFilesService({ prisma })
  async function validateTargets(projectId, { assigneeId, parentTaskId, statusId }) {
    const project = await prisma.project.findFirst({ where: { id: projectId }, select: { companyId: true } })
    if (!project) throw new TaskServiceError('Recurso no encontrado.', 404)
    if (assigneeId) await access.assertCandidates({ companyId: project.companyId, userIds: [assigneeId], permission: 'projects.project.read', projectId })
    if (parentTaskId && !(await prisma.task.findFirst({ where: { id: parentTaskId, projectId }, select: { id: true } }))) throw new TaskServiceError('Recurso no encontrado.', 404)
    if (statusId && !(await prisma.taskStatus.findFirst({ where: { id: statusId, projectId }, select: { id: true } }))) throw new TaskServiceError('Recurso no encontrado.', 404)
  }

  async function listTasks(projectId, { companyId, actorId, statusId, assigneeId, priority, dueDateFrom, dueDateTo, parentTaskId, includeSubtasks } = {}) {
    const where = { projectId }
    if (statusId) where.statusId = statusId
    if (assigneeId) where.assigneeId = assigneeId
    if (priority) where.priority = priority
    if (dueDateFrom || dueDateTo) {
      where.dueDate = {}
      if (dueDateFrom) where.dueDate.gte = new Date(dueDateFrom)
      if (dueDateTo) where.dueDate.lte = new Date(dueDateTo)
    }
    if (!includeSubtasks) {
      where.parentTaskId = parentTaskId === undefined ? null : parentTaskId
    }
    const tasks = await prisma.task.findMany({
      where,
      include: {
        assignee: { select: { id: true, firstName: true, lastName: true, avatarFileId: true } },
        assignees: {
          include: { user: { select: { id: true, firstName: true, lastName: true, avatarFileId: true } } },
          orderBy: { assignedAt: 'asc' },
        },
        status: true,
        parent: { select: { id: true, title: true } },
        _count: { select: { subtasks: true } },
      },
      orderBy: [{ statusId: 'asc' }, { position: 'asc' }],
    })

    if (tasks.length === 0) return tasks
    const taskIds = tasks.map(t => t.id)
    const attachments = await files.list({ companyId, taskIds, actorId })
    const countById = {}
    for (const file of attachments) {
      const id = file.entityId === companyId ? file.metadata?.sourceEntityId : file.entityId
      countById[id] = (countById[id] ?? 0) + 1
    }
    return tasks.map(t => ({ ...t, _count: { ...t._count, attachments: countById[t.id] ?? 0 } }))
  }

  async function getTask(taskId, { projectId, companyId, actorId }) {
    if (!projectId || !companyId) throw new TaskServiceError('Tarea no encontrada.', 404)
    const task = await prisma.task.findFirst({
      where: { id: taskId, projectId, project: { companyId } },
      include: {
        assignee: { select: { id: true, firstName: true, lastName: true, avatarFileId: true } },
        assignees: {
          include: { user: { select: { id: true, firstName: true, lastName: true, avatarFileId: true } } },
          orderBy: { assignedAt: 'asc' },
        },
        status: true,
        subtasks: {
          include: {
            assignee: { select: { id: true, firstName: true, lastName: true, avatarFileId: true } },
            assignees: {
              include: { user: { select: { id: true, firstName: true, lastName: true, avatarFileId: true } } },
            },
          },
          orderBy: { position: 'asc' },
        },
        parent: { select: { id: true, title: true } },
        fieldValues: { include: { field: true }, orderBy: { field: { position: 'asc' } } },
        blockedBy: {
          where: { blocker: { projectId } },
          include: { blocker: { select: { id: true, title: true, taskNumber: true, statusId: true } } },
          orderBy: { createdAt: 'asc' },
        },
        blocking: {
          where: { blocked: { projectId } },
          include: { blocked: { select: { id: true, title: true, taskNumber: true, statusId: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    })
    if (!task) throw new TaskServiceError('Tarea no encontrada.', 404)

    const attachments = await files.list({ companyId, taskIds: [taskId], actorId })

    return { ...task, attachments }
  }

  async function createTask(projectId, createdBy, { title, description, statusId, assigneeId, priority = 'NONE', startDate, dueDate, parentTaskId }) {
    if (!statusId) {
      const fallback = await prisma.taskStatus.findFirst({
        where: { projectId },
        orderBy: [{ isDefault: 'desc' }, { position: 'asc' }],
        select: { id: true },
      })
      statusId = fallback?.id
    }
    await validateTargets(projectId, { assigneeId, parentTaskId, statusId })
    if (!title?.trim()) throw new TaskServiceError('El titulo es requerido.', 400)
    const status = await prisma.taskStatus.findFirst({ where: { id: statusId, projectId } })
    if (!status) throw new TaskServiceError('Estado no valido para este proyecto.', 400)
    const last = await prisma.task.findFirst({
      where: { projectId, statusId, parentTaskId: null },
      orderBy: { position: 'desc' },
    })
    const position = (last?.position ?? -1) + 1
    const task = await prisma.$transaction(async (tx) => {
      let taskNumber = null
      if (!parentTaskId) {
        const updated = await tx.project.update({
          where: { id: projectId },
          data: { taskCounter: { increment: 1 } },
          select: { taskCounter: true },
        })
        taskNumber = updated.taskCounter
      }
      return tx.task.create({
        data: {
          projectId,
          statusId,
          parentTaskId: parentTaskId || null,
          title: title.trim(),
          description: description?.trim() || null,
          assigneeId: assigneeId || null,
          priority,
          startDate: startDate ? toNoonUTC(startDate) : null,
          dueDate: dueDate ? toNoonUTC(dueDate) : null,
          position,
          createdBy,
          ...(taskNumber !== null ? { taskNumber } : {}),
        },
      })
    })
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { companyId: true } })
    await publishDomainEvent(prisma, { companyId: project?.companyId, event: 'projects.task.created', payload: taskEventPayload(task) })
    return task
  }

  // Best-effort publish of projects.task.updated / deleted (never fails the request).
  async function announce(event, task) {
    try {
      const project = await prisma.project.findFirst({ where: { id: task.projectId }, select: { companyId: true } })
      await publishDomainEvent(prisma, { companyId: project?.companyId, event, payload: taskEventPayload(task) })
    } catch (err) {
      console.error(`[projects] no se pudo publicar ${event}:`, err?.message ?? err)
    }
  }

  // Fires projects.task.completed when a status change moves a task into a done status.
  async function emitCompletion(before, after) {
    if (!after || before.statusId === after.statusId) return
    try {
      const statuses = await prisma.taskStatus.findMany({ where: { id: { in: [before.statusId, after.statusId] } }, select: { id: true, isDone: true } })
      const done = (id) => statuses.find((s) => s.id === id)?.isDone === true
      if (!done(after.statusId) || done(before.statusId)) return
      const project = await prisma.project.findFirst({ where: { id: after.projectId }, select: { companyId: true } })
      await publishDomainEvent(prisma, { companyId: project?.companyId, event: 'projects.task.completed', payload: taskEventPayload(after) })
    } catch (err) {
      console.error('[projects] no se pudo publicar projects.task.completed:', err?.message ?? err)
    }
  }

  // Fires projects.task.rescheduled when a task's start or due date actually changed.
  async function emitRescheduled(before, after) {
    const same = (a, b) => (a ? new Date(a).getTime() : null) === (b ? new Date(b).getTime() : null)
    if (same(before.startDate, after.startDate) && same(before.dueDate, after.dueDate)) return
    try {
      const project = await prisma.project.findFirst({ where: { id: after.projectId }, select: { companyId: true } })
      await publishDomainEvent(prisma, { companyId: project?.companyId, event: 'projects.task.rescheduled', payload: rescheduledPayload(after) })
    } catch (err) {
      console.error('[projects] no se pudo publicar projects.task.rescheduled:', err?.message ?? err)
    }
  }

  async function updateTask(taskId, data) {
    const task = await prisma.task.findFirst({ where: { id: taskId } })
    if (!task) throw new TaskServiceError('Tarea no encontrada.', 404)
    await validateTargets(task.projectId, data)
    const { title, description, assigneeId, priority, startDate, dueDate, statusId, rrule, estimateMinutes } = data
    if (estimateMinutes !== undefined && estimateMinutes !== null && !(Number.isInteger(estimateMinutes) && estimateMinutes >= 0 && estimateMinutes <= 100000)) {
      throw new TaskServiceError('La estimación debe ser un número entero de minutos (0 a 100000).', 400)
    }
    const rruleNextAt = rrule !== undefined
      ? (rrule ? computeRruleNextAt(rrule) : null)
      : undefined
    const updated = await prisma.task.update({
      where: { id: taskId },
      data: {
        ...(title?.trim() ? { title: title.trim() } : {}),
        ...(description !== undefined ? { description: description?.trim() || null } : {}),
        ...(assigneeId !== undefined ? { assigneeId: assigneeId || null } : {}),
        ...(priority ? { priority } : {}),
        ...(startDate !== undefined ? { startDate: startDate ? toNoonUTC(startDate) : null } : {}),
        ...(dueDate !== undefined ? { dueDate: dueDate ? toNoonUTC(dueDate) : null } : {}),
        ...(statusId ? { statusId } : {}),
        ...(estimateMinutes !== undefined ? { estimateMinutes } : {}),
        ...(rrule !== undefined ? { rrule: rrule || null } : {}),
        ...(rruleNextAt !== undefined ? { rruleNextAt } : {}),
      },
    })
    await emitCompletion(task, updated)
    if (startDate !== undefined || dueDate !== undefined) await emitRescheduled(task, updated)
    await announce('projects.task.updated', updated)
    return updated
  }

  async function moveTask(taskId, { statusId, position }) {
    const task = await prisma.task.findFirst({ where: { id: taskId } })
    if (!task) throw new TaskServiceError('Tarea no encontrada.', 404)
    await validateTargets(task.projectId, { statusId })
    await prisma.task.updateMany({
      where: { projectId: task.projectId, statusId, position: { gte: position }, id: { not: taskId } },
      data: { position: { increment: 1 } },
    })
    const moved = await prisma.task.update({ where: { id: taskId }, data: { statusId, position } })
    await emitCompletion(task, moved)
    return moved
  }

  async function deleteTask(taskId) {
    const task = await prisma.task.findFirst({ where: { id: taskId } })
    if (!task) throw new TaskServiceError('Tarea no encontrada.', 404)
    await prisma.task.deleteMany({ where: { parentTaskId: taskId } })
    await prisma.task.delete({ where: { id: taskId } })
    await announce('projects.task.deleted', task)
    return task
  }

  async function addAssignee(taskId, userId) {
    const task = await prisma.task.findFirst({ where: { id: taskId } })
    if (!task) throw new TaskServiceError('Tarea no encontrada.', 404)
    await validateTargets(task.projectId, { assigneeId: userId })
    const existing = await prisma.projectTaskAssignee.findFirst({ where: { taskId, userId } })
    if (existing) throw new TaskServiceError('El usuario ya esta asignado a esta tarea.', 409)
    const row = await prisma.projectTaskAssignee.create({
      data: { taskId, userId },
      include: { user: { select: { id: true, firstName: true, lastName: true, avatarFileId: true } } },
    })
    if (!task.assigneeId) {
      await prisma.task.update({ where: { id: taskId }, data: { assigneeId: userId } })
    }
    return row
  }

  async function removeAssignee(taskId, userId) {
    const task = await prisma.task.findFirst({ where: { id: taskId } })
    if (!task) throw new TaskServiceError('Tarea no encontrada.', 404)
    const existing = await prisma.projectTaskAssignee.findFirst({ where: { taskId, userId } })
    if (!existing) throw new TaskServiceError('El usuario no esta asignado a esta tarea.', 404)
    await prisma.projectTaskAssignee.delete({ where: { taskId_userId: { taskId, userId } } })
    if (task.assigneeId === userId) {
      const next = await prisma.projectTaskAssignee.findFirst({
        where: { taskId },
        orderBy: { assignedAt: 'asc' },
      })
      await prisma.task.update({ where: { id: taskId }, data: { assigneeId: next?.userId ?? null } })
    }
  }

  async function listAssignees(taskId) {
    return prisma.projectTaskAssignee.findMany({
      where: { taskId },
      include: { user: { select: { id: true, firstName: true, lastName: true, avatarFileId: true } } },
      orderBy: { assignedAt: 'asc' },
    })
  }

  async function bulkUpdateTasks(projectId, taskIds, patch) {
    if (!taskIds?.length) throw new TaskServiceError('Se requiere al menos una tarea.', 400)
    await validateTargets(projectId, patch)
    const { statusId, assigneeId, priority } = patch
    if (!statusId && assigneeId === undefined && !priority)
      throw new TaskServiceError('Se requiere al menos un campo para actualizar.', 400)
    await prisma.task.updateMany({
      where: { id: { in: taskIds }, projectId },
      data: {
        ...(statusId ? { statusId } : {}),
        ...(assigneeId !== undefined ? { assigneeId: assigneeId || null } : {}),
        ...(priority ? { priority } : {}),
      },
    })
    return { updated: taskIds.length }
  }

  async function bulkDeleteTasks(projectId, taskIds) {
    if (!taskIds?.length) throw new TaskServiceError('Se requiere al menos una tarea.', 400)
    await prisma.task.deleteMany({ where: { parentTaskId: { in: taskIds }, projectId } })
    const result = await prisma.task.deleteMany({ where: { id: { in: taskIds }, projectId } })
    return { deleted: result.count }
  }

  // Open tasks assigned to the user across the projects they belong to (Home
  // "Mis tareas" widget). Overdue is counted over the whole set, not the page.
  async function listMyTasks(companyId, userId, { limit = 20 } = {}) {
    const where = {
      status: { isDone: false },
      project: { companyId, status: { not: 'ARCHIVED' }, OR: [{ ownerId: userId }, { members: { some: { userId } } }] },
      OR: [{ assigneeId: userId }, { assignees: { some: { userId } } }],
    }
    const now = new Date()
    const [items, total, overdue] = await Promise.all([
      prisma.task.findMany({
        where,
        orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
        take: limit,
        select: {
          id: true, projectId: true, title: true, taskNumber: true, priority: true, dueDate: true,
          status: { select: { name: true, color: true } },
          project: { select: { name: true } },
        },
      }),
      prisma.task.count({ where }),
      prisma.task.count({ where: { ...where, dueDate: { lt: now } } }),
    ])
    return { items, total, overdue }
  }

  return {
    listMyTasks, listTasks, getTask, createTask, updateTask, moveTask, deleteTask,
    addAssignee, removeAssignee, listAssignees,
    bulkUpdateTasks, bulkDeleteTasks,
  }
}
