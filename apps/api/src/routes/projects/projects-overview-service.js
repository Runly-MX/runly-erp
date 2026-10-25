// Workload per person/week and the project overview ("Resumen"). Spec
// docs/superpowers/specs/2026-10-26-projects-depth-design.md, section 3.
import { buildWorkload } from './projects-workload.js'
import { parseDay } from './projects-schedule.js'
import { summarize, weekStart } from './projects-time.js'

export class OverviewServiceError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.name = 'OverviewServiceError'
    this.status = status
  }
}

const DAY_MS = 86_400_000
const WEEKS_BACK = 8
const person = { select: { id: true, firstName: true, lastName: true } }

export function createOverviewService({ prisma, now = () => new Date() }) {
  const todayNoon = () => { const n = now(); return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate(), 12)) }

  // Default window: the current week and the next five.
  async function workload({ projectId, from, to }) {
    const start = from ? parseDay(from) : new Date(`${weekStart(now())}T12:00:00.000Z`)
    const end = to ? parseDay(to) : new Date(start.getTime() + (6 * 7 - 1) * DAY_MS)
    if (!start || !end || end < start) throw new OverviewServiceError('El rango de fechas no es válido.')
    const [tasks, members] = await Promise.all([
      prisma.task.findMany({
        where: { projectId, assigneeId: { not: null } },
        select: { id: true, title: true, assigneeId: true, startDate: true, dueDate: true, estimateMinutes: true, status: { select: { isDone: true } } },
      }),
      prisma.projectMember.findMany({ where: { projectId }, select: { userId: true, weeklyCapacityMinutes: true, user: person } }),
    ])
    const capacity = Object.fromEntries(members.filter((m) => m.weeklyCapacityMinutes).map((m) => [m.userId, m.weeklyCapacityMinutes]))
    const result = buildWorkload({ from: start, to: end, capacity, tasks: tasks.map((t) => ({ ...t, done: t.status?.isDone })) })
    const names = new Map(members.map((m) => [m.userId, m.user]))
    const missing = result.people.map((p) => p.userId).filter((id) => !names.has(id))
    if (missing.length) for (const u of await prisma.userProfile.findMany({ where: { id: { in: missing } }, select: person.select })) names.set(u.id, u)
    const taskById = Object.fromEntries(tasks.map((t) => [t.id, { id: t.id, title: t.title }]))
    return {
      from: start, to: end, weeks: result.weeks,
      // Members with nothing assigned still show, so capacity can be set and work assigned to them.
      people: [...result.people, ...members.filter((m) => !result.people.some((p) => p.userId === m.userId)).map((m) => ({ userId: m.userId, capacity: m.weeklyCapacityMinutes ?? 2400, byWeek: {}, items: {}, unscheduled: [] }))]
        .map((p) => ({ ...p, user: names.get(p.userId) ?? null })),
      tasks: taskById,
    }
  }

  async function setCapacity({ projectId, userId, weeklyCapacityMinutes }) {
    const minutes = weeklyCapacityMinutes === null ? null : Number(weeklyCapacityMinutes)
    if (minutes !== null && !(Number.isInteger(minutes) && minutes >= 60 && minutes <= 10080)) throw new OverviewServiceError('La capacidad semanal debe ser de 1 a 168 horas.')
    const member = await prisma.projectMember.findFirst({ where: { projectId, userId }, select: { id: true } })
    if (!member) throw new OverviewServiceError('La persona no es miembro del proyecto.', 404)
    await prisma.projectMember.update({ where: { id: member.id }, data: { weeklyCapacityMinutes: minutes } })
    return { userId, weeklyCapacityMinutes: minutes }
  }

  async function overview({ projectId, companyId }) {
    const [tasks, entries] = await Promise.all([
      prisma.task.findMany({
        where: { projectId },
        select: { id: true, title: true, assigneeId: true, dueDate: true, startDate: true, estimateMinutes: true, status: { select: { id: true, name: true, color: true, isDone: true } } },
      }),
      prisma.taskTimeEntry.findMany({ where: { companyId, task: { projectId }, minutes: { not: null } }, select: { taskId: true, userId: true, startedAt: true, minutes: true } }),
    ])
    const today = todayNoon()
    const time = summarize(entries)
    const open = tasks.filter((t) => !t.status?.isDone)
    const estimated = tasks.reduce((sum, t) => sum + (t.estimateMinutes ?? 0), 0)

    const byStatus = {}
    for (const t of tasks) {
      const key = t.status?.id ?? 'none'
      byStatus[key] ??= { id: key, name: t.status?.name ?? 'Sin estado', color: t.status?.color ?? null, count: 0 }
      byStatus[key].count += 1
    }

    const people = {}
    for (const t of tasks) {
      if (!t.assigneeId) continue
      people[t.assigneeId] ??= { userId: t.assigneeId, open: 0, done: 0, overdue: 0, loggedMinutes: 0 }
      if (t.status?.isDone) people[t.assigneeId].done += 1
      else { people[t.assigneeId].open += 1; if (t.dueDate && t.dueDate < today) people[t.assigneeId].overdue += 1 }
    }
    for (const [userId, minutes] of Object.entries(time.byUser)) { people[userId] ??= { userId, open: 0, done: 0, overdue: 0, loggedMinutes: 0 }; people[userId].loggedMinutes = minutes }
    const ids = Object.keys(people)
    const users = ids.length ? await prisma.userProfile.findMany({ where: { id: { in: ids } }, select: person.select }) : []
    const userById = new Map(users.map((u) => [u.id, u]))

    // Estimated (by the week each open task is due) against logged, for the last weeks.
    const thisWeek = Date.parse(`${weekStart(today)}T00:00:00.000Z`)
    const weeks = Array.from({ length: WEEKS_BACK }, (_, i) => new Date(thisWeek - (WEEKS_BACK - 1 - i) * 7 * DAY_MS).toISOString().slice(0, 10)) // eslint-disable-line no-restricted-syntax -- UTC week keys
    const estimatedByWeek = {}
    for (const t of tasks) if (t.dueDate && t.estimateMinutes > 0) { const w = weekStart(t.dueDate); estimatedByWeek[w] = (estimatedByWeek[w] ?? 0) + t.estimateMinutes }

    const milestones = tasks
      .filter((t) => t.estimateMinutes === 0 && t.dueDate && !t.status?.isDone && t.dueDate >= today)
      .sort((a, b) => a.dueDate - b.dueDate).slice(0, 5)
      .map((t) => ({ id: t.id, title: t.title, dueDate: t.dueDate }))

    return {
      progress: { tasksTotal: tasks.length, tasksDone: tasks.length - open.length, estimatedMinutes: estimated, loggedMinutes: time.total },
      overdue: open.filter((t) => t.dueDate && t.dueDate < today).length,
      byStatus: Object.values(byStatus),
      people: Object.values(people).map((p) => ({ ...p, user: userById.get(p.userId) ?? null })),
      weeks: weeks.map((week) => ({ week, estimatedMinutes: estimatedByWeek[week] ?? 0, loggedMinutes: time.byWeek[week] ?? 0 })),
      milestones,
    }
  }

  return { workload, setCapacity, overview }
}
