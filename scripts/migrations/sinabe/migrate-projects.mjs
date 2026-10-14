// Stage C: projects -> runly.projects (deadlines become tasks, their tasks
// become subtasks) and events -> a "Sinabe" calendar. People are mapped to
// Runly profiles by e-mail (--deliverers-map first, then UserProfile.email);
// anyone without a profile is skipped and counted, never invented. Project
// documents and inventory-deadline links are not migrated (counted as pending).
import { errorCode } from './migrate-files.mjs'
import { dayOf } from './mapping/item.mjs'

const ts = (d) => d?.getTime?.() ?? 0
const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0) || ts(a.createdAt) - ts(b.createdAt) || String(a.id).localeCompare(String(b.id))
const isReal = (id) => id && !String(id).startsWith('dry:')
const money = (n) => (Number.isFinite(Number(n)) && n !== null ? Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }) : null)

export const PROJECT_STATUS_MAP = { COMPLETED: 'COMPLETED', COMPLETADO: 'COMPLETED', FINALIZADO: 'COMPLETED', CANCELLED: 'ARCHIVED', CANCELADO: 'ARCHIVED' }
export const projectStatus = (project) => (project.enabled === false ? 'ARCHIVED' : PROJECT_STATUS_MAP[String(project.status ?? '').trim().toUpperCase()] ?? 'ACTIVE')

const STAGE_MAP = { PENDIENTE: 'todo', EN_PROGRESO: 'doing', COMPLETADO: 'done', CANCELADO: 'done' }
export const taskStage = (status) => STAGE_MAP[String(status ?? '').trim().toUpperCase()] ?? 'todo'

export function projectDescription(project) {
  const lines = [project.description?.trim()].filter(Boolean)
  const facts = [
    project.code ? `Código: ${project.code}` : null,
    project.provider ? `Proveedor: ${project.provider}` : null,
    money(project.budgetTotal) ? `Presupuesto: ${money(project.budgetTotal)}` : null,
    money(project.budgetUsed) ? `Ejercido: ${money(project.budgetUsed)}` : null,
  ].filter(Boolean)
  if (facts.length) lines.push(facts.join(' · '))
  return lines.join('\n\n') || null
}

const EVENT_TYPE = { MAINTENANCE: 'Mantenimiento', GENERAL: 'General' }
const EVENT_STATUS = { SCHEDULED: 'Programado', COMPLETED: 'Completado', POSTPONED: 'Pospuesto', CANCELLED: 'Cancelado', OVERDUE: 'Vencido' }
export function eventDescription(event, timeZone) {
  const status = String(event.status ?? '').toUpperCase()
  const facts = [
    EVENT_TYPE[String(event.type ?? '').toUpperCase()] ? `Tipo: ${EVENT_TYPE[String(event.type).toUpperCase()]}` : null,
    EVENT_STATUS[status] ? `Estado en sinabe: ${EVENT_STATUS[status]}` : null,
    event.provider ? `Proveedor: ${event.provider}` : null,
    event.completedDate ? `Completado: ${dayOf(event.completedDate, timeZone)}` : null,
  ].filter(Boolean)
  return [event.description?.trim(), facts.join(' · ')].filter(Boolean).join('\n\n') || null
}

// sinabe user id -> Runly profile id (or null). Cached per run.
export function createProfileResolver(run) {
  const cache = new Map()
  let profiles = null
  return async (userId) => {
    if (!userId) return null
    if (cache.has(userId)) return cache.get(userId)
    const email = String(run.model.users.get(userId)?.email ?? '').trim().toLowerCase()
    let id = email ? run.deliverers?.get(email) ?? null : null
    if (!id && email) {
      profiles ??= new Map((await run.prisma.userProfile.findMany({ select: { id: true, email: true } })).map((p) => [String(p.email).toLowerCase(), p.id]))
      id = profiles.get(email) ?? null
    }
    cache.set(userId, id)
    return id
  }
}

const group = (rows, key) => { const out = new Map(); for (const r of rows) { const k = r[key]; if (!out.has(k)) out.set(k, []); out.get(k).push(r) } return out }

async function profilesOf(resolve, userIds, report) {
  const found = new Set()
  for (const userId of new Set(userIds)) {
    const id = await resolve(userId)
    if (id) found.add(id); else report.warn('USER_WITHOUT_RUNLY_PROFILE')
  }
  return [...found]
}

async function migrateTasks(run, projectLegacyId, projectId, statusIds, deadlines, tasksByDeadline, usersOf, resolve) {
  const { report, companyId } = run
  for (const deadline of deadlines.sort(byOrder)) {
    if (deadline.enabled === false) { report.count('tasks', 'skipped'); continue }
    try {
      const stage = taskStage(deadline.status)
      const assigneeIds = await profilesOf(resolve, usersOf.deadline.get(deadline.id) ?? [], report)
      const note = String(deadline.status ?? '').toUpperCase() === 'CANCELADO' ? 'Cancelado en sinabe.' : null
      const parent = run.commit && isReal(projectId)
        ? await run.toolkit.importTask({ companyId, actorId: run.actorId, source: run.sourceName, legacyId: `deadline:${deadline.id}`, projectId, statusId: statusIds[stage], title: deadline.name, description: [deadline.description, note].filter(Boolean).join('\n\n') || null, assigneeIds, dueDate: deadline.dueDate, position: deadline.order ?? 0, createdAt: deadline.createdAt })
        : { id: `dry:task:${deadline.id}`, created: !run.dryRefs.has(`deadline:${deadline.id}`) }
      report.count('tasks', parent.created ? 'created' : 'matched')
      for (const task of (tasksByDeadline.get(deadline.id) ?? []).sort(byOrder)) {
        if (task.enabled === false) { report.count('tasks', 'skipped'); continue }
        try {
          const taskStageKey = taskStage(task.status)
          const taskAssignees = await profilesOf(resolve, usersOf.task.get(task.id) ?? [], report)
          const taskNote = String(task.status ?? '').toUpperCase() === 'CANCELADO' ? 'Cancelada en sinabe.' : null
          const child = run.commit && isReal(parent.id)
            ? await run.toolkit.importTask({ companyId, actorId: run.actorId, source: run.sourceName, legacyId: `task:${task.id}`, projectId, statusId: statusIds[taskStageKey], parentTaskId: parent.id, title: task.name, description: [task.description, taskNote].filter(Boolean).join('\n\n') || null, assigneeIds: taskAssignees, dueDate: task.date, position: task.order ?? 0, createdAt: task.createdAt })
            : { created: !run.dryRefs.has(`task:${task.id}`) }
          report.count('tasks', child.created ? 'created' : 'matched')
        } catch (error) { report.error('tasks', errorCode('TASK', error), task.id) }
      }
    } catch (error) { report.error('tasks', errorCode('TASK', error), deadline.id) }
  }
}

export async function migrateProjects(run) {
  const { report, companyId, model } = run
  const s = model.source
  const resolve = createProfileResolver(run)
  const deadlinesByProject = group(s.deadlines, 'projectId')
  const tasksByDeadline = group(s.deadlineTasks, 'deadlineId')
  const usersOf = {
    deadline: new Map([...group(s.deadlineUsers ?? [], 'deadlineId')].map(([k, rows]) => [k, rows.map((r) => r.userId)])),
    task: new Map([...group(s.taskUsers ?? [], 'taskId')].map(([k, rows]) => [k, rows.map((r) => r.userId)])),
  }
  const membersByProject = group(s.projectMembers, 'projectId')
  const refs = await run.refs.findMany('project', s.projects.map((p) => p.id))
  run.dryRefs = new Set([
    ...[...(await run.refs.findMany('project_task', [...s.deadlines.map((d) => `deadline:${d.id}`), ...s.deadlineTasks.map((t) => `task:${t.id}`)])).keys()],
  ])
  for (const project of [...s.projects].sort((a, b) => ts(a.createdAt) - ts(b.createdAt) || String(a.id).localeCompare(String(b.id)))) {
    try {
      const memberIds = await profilesOf(resolve, (membersByProject.get(project.id) ?? []).map((m) => m.userId), report)
      let result
      if (run.commit) {
        result = await run.toolkit.importProject({
          companyId, actorId: run.actorId, source: run.sourceName, legacyId: project.id, name: project.name, description: projectDescription(project),
          status: projectStatus(project), startDate: project.startDate, dueDate: project.endDate, createdAt: project.createdAt, memberIds: memberIds.filter((id) => id !== run.actorId),
        })
      } else result = { id: refs.get(project.id) ?? `dry:project:${project.id}`, created: !refs.has(project.id), statusIds: { todo: 'dry', doing: 'dry', done: 'dry' } }
      report.count('projects', result.created ? 'created' : 'matched')
      const statusIds = result.statusIds ?? (await run.prisma.taskStatus.findMany({ where: { projectId: result.id }, select: { id: true, name: true } }).then((rows) => ({ todo: rows.find((r) => r.name === 'Por hacer')?.id, doing: rows.find((r) => r.name === 'En progreso')?.id, done: rows.find((r) => r.name === 'Listo')?.id })))
      await migrateTasks(run, project.id, result.id, statusIds, [...(deadlinesByProject.get(project.id) ?? [])], tasksByDeadline, usersOf, resolve)
    } catch (error) { report.error('projects', errorCode('PROJECT', error), project.id) }
  }
  const orphanDeadlines = s.deadlines.filter((d) => !s.projects.some((p) => p.id === d.projectId)).length
  if (orphanDeadlines) report.warn('DEADLINE_WITHOUT_PROJECT', orphanDeadlines)
  report.pending('documentosProyecto', s.projectDocuments.length)
  if ((s.inventoryDeadlines ?? []).length) report.pending('activosEnHitos', s.inventoryDeadlines.length)
}

export async function migrateEvents(run) {
  const { report, companyId, model } = run
  const s = model.source
  if (!s.events.length) return
  const resolve = createProfileResolver(run)
  const attendeesByEvent = group(s.eventAttendees, 'eventId')
  const refs = await run.refs.findMany('calendar_event', s.events.map((e) => e.id))
  let calendarId = null
  if (run.commit) calendarId = await run.toolkit.ensureCalendar({ companyId, actorId: run.actorId, source: run.sourceName, name: 'Sinabe - eventos' })
  for (const event of [...s.events].sort((a, b) => ts(a.scheduledDate) - ts(b.scheduledDate) || String(a.id).localeCompare(String(b.id)))) {
    try {
      if (event.recurrence || event.isRecurring) report.warn('EVENT_RECURRENCE_NOT_MIGRATED')
      if (!event.scheduledDate) { report.conflict('events', 'EVENT_WITHOUT_DATE', event.id); continue }
      if (!run.commit) { report.count('events', refs.has(event.id) ? 'matched' : 'created'); continue }
      const done = String(event.status ?? '').toUpperCase() === 'COMPLETED'
      const attendees = []
      for (const row of attendeesByEvent.get(event.id) ?? []) {
        const userId = await resolve(row.userId)
        if (userId) attendees.push({ userId, status: done ? 'ACCEPTED' : 'PENDING' }); else report.warn('USER_WITHOUT_RUNLY_PROFILE')
      }
      const result = await run.toolkit.importCalendarEvent({
        companyId, actorId: run.actorId, source: run.sourceName, legacyId: event.id, calendarId, title: event.title, description: eventDescription(event, model.timeZone),
        startAt: event.scheduledDate, allDay: true, attendees, createdAt: event.createdAt,
      })
      report.count('events', result.created ? 'created' : 'matched')
    } catch (error) { report.error('events', errorCode('EVENT', error), event.id) }
  }
}
