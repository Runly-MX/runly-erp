// Gantt data and rescheduling for a project. Spec
// docs/superpowers/specs/2026-10-26-projects-depth-design.md, section 1.3.
import { MAX_PUSHED_TASKS, dependentsOf, parseDay, pushedDates } from './projects-schedule.js'

export class GanttServiceError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.name = 'GanttServiceError'
    this.status = status
  }
}

const TASK_SELECT = {
  id: true, projectId: true, parentTaskId: true, title: true, taskNumber: true, position: true,
  startDate: true, dueDate: true, calendarEventId: true, assigneeId: true, statusId: true,
  assignee: { select: { id: true, firstName: true, lastName: true } },
  status: { select: { id: true, name: true, color: true, isDone: true } },
}

export function createGanttService({ prisma }) {
  // One call for the chart: tasks (with their dates and status) and every dependency.
  async function gantt(projectId) {
    const [tasks, dependencies] = await Promise.all([
      prisma.task.findMany({ where: { projectId }, select: TASK_SELECT, orderBy: [{ statusId: 'asc' }, { position: 'asc' }] }),
      prisma.taskDependency.findMany({ where: { blocked: { projectId }, blocker: { projectId } }, select: { id: true, blockerId: true, blockedId: true } }),
    ])
    return { tasks, dependencies }
  }

  // Moves one task (and, when `pushDependentsBy` days is given, everything that depends on
  // it by the same number of days). Returns the rows before and after for each change so
  // the caller can run the usual side effects (calendar, notifications, realtime).
  async function reschedule({ projectId, taskId, startDate, dueDate, pushDependentsBy = 0 }) {
    const task = await prisma.task.findFirst({ where: { id: taskId, projectId }, select: { id: true, startDate: true, dueDate: true } })
    if (!task) throw new GanttServiceError('Tarea no encontrada.', 404)
    // undefined keeps the task's current date, null clears it.
    const start = startDate === undefined ? task.startDate : startDate === null ? null : parseDay(startDate)
    const due = dueDate === undefined ? task.dueDate : dueDate === null ? null : parseDay(dueDate)
    if ((startDate && !start) || (dueDate && !due)) throw new GanttServiceError('Las fechas no son válidas (usa AAAA-MM-DD).')
    if (start && due && start > due) throw new GanttServiceError('La fecha de inicio no puede ser posterior a la de entrega.')
    const days = Number(pushDependentsBy) || 0
    if (!Number.isInteger(days) || days < 0 || days > 3650) throw new GanttServiceError('El desplazamiento de las tareas dependientes no es válido.')

    let pushed = []
    if (days > 0) {
      const edges = await prisma.taskDependency.findMany({ where: { blocked: { projectId }, blocker: { projectId } }, select: { blockerId: true, blockedId: true } })
      const ids = dependentsOf(edges, taskId)
      if (ids.length > MAX_PUSHED_TASKS) throw new GanttServiceError(`Mover tantas tareas a la vez no está permitido (máximo ${MAX_PUSHED_TASKS}).`, 409)
      const rows = await prisma.task.findMany({ where: { id: { in: ids }, projectId }, select: { id: true, startDate: true, dueDate: true } })
      pushed = pushedDates(new Map(rows.map((row) => [row.id, row])), ids, days)
    }

    const changed = await prisma.$transaction(async (tx) => {
      const out = []
      const apply = async (id, data) => {
        const before = await tx.task.findFirst({ where: { id, projectId } })
        const after = await tx.task.update({ where: { id }, data })
        out.push({ before, after })
      }
      await apply(taskId, { startDate: start, dueDate: due })
      for (const move of pushed) await apply(move.id, { startDate: move.startDate, dueDate: move.dueDate })
      return out
    })
    return { changed }
  }

  return { gantt, reschedule }
}
