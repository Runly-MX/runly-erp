// Historical projects, tasks and calendar events for legacy migrations. Rows are
// written with their original dates and final status; every create goes through
// the legacy_ref ledger (idempotent) and no notification, calendar bridge or
// domain event is fired.
import { STATUS_TEMPLATES } from '../../routes/projects/projects-service.js';
import { LegacyImportError, clip, toTimestamp, writeImportAudit } from './shared.js';

const MODULE_KEYS = { projects: 'runly.projects', calendar: 'runly.calendar' };
const PROJECT_STATUSES = ['ACTIVE', 'COMPLETED', 'ARCHIVED'];
const TASK_STAGES = { todo: 'Por hacer', doing: 'En progreso', done: 'Listo' };
const ATTENDEE_STATUSES = ['PENDING', 'ACCEPTED', 'DECLINED'];

export function createProjectsHistorical({ prisma, refs, defaultSource }) {
  // Creates the project with the "general" statuses and the actor as OWNER.
  // Returns { id, created, statusIds: { todo, doing, done } }.
  async function importProject({ companyId, actorId, source = defaultSource, legacyId, name, description = null, status = 'ACTIVE', startDate = null, dueDate = null, createdAt = null, color = null, memberIds = [] }) {
    if (!actorId) throw new LegacyImportError('actorId es obligatorio para importar proyectos.');
    const title = clip(name, 200);
    if (!title) throw new LegacyImportError('El proyecto necesita nombre.');
    const finalStatus = String(status).toUpperCase();
    if (!PROJECT_STATUSES.includes(finalStatus)) throw new LegacyImportError(`Estado de proyecto no válido: ${status}.`);
    const bound = refs.bind(companyId, source);
    const result = await bound.ensure('project', legacyId, async (tx) => {
      const created = await tx.project.create({
        data: {
          companyId, ownerId: actorId, name: title, description: description ? String(description).trim() : null, color: color || '#6366f1',
          status: finalStatus, startDate: toTimestamp(startDate), dueDate: toTimestamp(dueDate), ...(createdAt ? { createdAt: toTimestamp(createdAt) } : {}),
        },
      });
      await tx.taskStatus.createMany({
        data: STATUS_TEMPLATES.general.map((s, position) => ({ projectId: created.id, name: s.name, color: s.color, position, isDefault: s.isDefault, isDone: s.isDone })),
      });
      const members = [...new Set([actorId, ...memberIds])];
      await tx.projectMember.createMany({ data: members.map((userId) => ({ projectId: created.id, userId, role: userId === actorId ? 'OWNER' : 'MEMBER' })) });
      await writeImportAudit(tx, { companyId, actorId, moduleKey: MODULE_KEYS.projects, entityType: 'project', entityId: created.id, action: 'import', source, legacyId });
      return created.id;
    });
    const statuses = await prisma.taskStatus.findMany({ where: { projectId: result.id }, select: { id: true, name: true } });
    const idOf = (stage) => statuses.find((s) => s.name === TASK_STAGES[stage])?.id ?? null;
    return { ...result, statusIds: { todo: idOf('todo'), doing: idOf('doing'), done: idOf('done') } };
  }

  // A top-level task takes the next project task number; subtasks have none.
  async function importTask({ companyId, actorId, source = defaultSource, legacyId, projectId, statusId, parentTaskId = null, title, description = null, assigneeIds = [], startDate = null, dueDate = null, position = 0, createdAt = null }) {
    const text = clip(title, 300);
    if (!text) throw new LegacyImportError('La tarea necesita título.');
    if (!projectId || !statusId) throw new LegacyImportError('projectId y statusId son obligatorios.');
    const bound = refs.bind(companyId, source);
    return bound.ensure('project_task', legacyId, async (tx) => {
      let taskNumber = null;
      if (!parentTaskId) {
        taskNumber = (await tx.project.update({ where: { id: projectId }, data: { taskCounter: { increment: 1 } }, select: { taskCounter: true } })).taskCounter;
      }
      const task = await tx.task.create({
        data: {
          projectId, statusId, parentTaskId, title: text, description: description ? String(description).trim() : null, assigneeId: assigneeIds[0] ?? null,
          startDate: toTimestamp(startDate), dueDate: toTimestamp(dueDate), position, createdBy: actorId, ...(taskNumber !== null ? { taskNumber } : {}),
          ...(createdAt ? { createdAt: toTimestamp(createdAt) } : {}),
        },
      });
      const unique = [...new Set(assigneeIds)];
      if (unique.length) await tx.projectTaskAssignee.createMany({ data: unique.map((userId) => ({ taskId: task.id, userId })) });
      return task.id;
    });
  }

  // Finds or creates the imported calendar owned by the actor; returns its id.
  async function ensureCalendar({ companyId, actorId, source = defaultSource, legacyId = 'default', name, color = '#0ea5e9' }) {
    const bound = refs.bind(companyId, source);
    const result = await bound.ensure('calendar', legacyId, async (tx) => {
      const created = await tx.calendarCalendar.create({ data: { ownerId: actorId, companyId, name: clip(name, 120) || 'Calendario importado', color } });
      return created.id;
    });
    return result.id;
  }

  async function importCalendarEvent({ companyId, actorId, source = defaultSource, legacyId, calendarId, title, description = null, startAt, endAt = null, allDay = true, attendees = [], createdAt = null }) {
    const text = clip(title, 300);
    if (!text) throw new LegacyImportError('El evento necesita título.');
    const start = toTimestamp(startAt);
    if (!start) throw new LegacyImportError('El evento necesita fecha.');
    const bound = refs.bind(companyId, source);
    return bound.ensure('calendar_event', legacyId, async (tx) => {
      const event = await tx.calendarEvent.create({
        data: { calendarId, title: text, description: description ? String(description).trim() : null, startAt: start, endAt: toTimestamp(endAt), allDay, ...(createdAt ? { createdAt: toTimestamp(createdAt) } : {}) },
      });
      const rows = new Map();
      for (const a of attendees) {
        const userId = typeof a === 'string' ? a : a.userId;
        const status = typeof a === 'string' ? 'PENDING' : String(a.status ?? 'PENDING').toUpperCase();
        if (userId && ATTENDEE_STATUSES.includes(status)) rows.set(userId, status);
      }
      if (rows.size) await tx.calendarEventAttendee.createMany({ data: [...rows].map(([userId, status]) => ({ eventId: event.id, userId, status })) });
      await writeImportAudit(tx, { companyId, actorId, moduleKey: MODULE_KEYS.calendar, entityType: 'calendar_event', entityId: event.id, action: 'import', source, legacyId });
      return event.id;
    });
  }

  return { importProject, importTask, ensureCalendar, importCalendarEvent };
}
