import test from 'node:test'
import assert from 'node:assert/strict'
import { createProjectsTaskEffects } from '../projects-task-effects.js'

function setup({ calendarId = 'cal-1' } = {}) {
  const synced = []
  const projectCalendars = []
  const prisma = { project: { findFirst: async () => ({ id: 'p1', calendarId, name: 'Mis tareas' }) }, projectMember: { findMany: async () => [] } }
  const bridge = {
    syncTaskEvent: async (task, id) => { synced.push({ task: task.id, calendarId: id }) },
    syncProjectCalendar: async () => { projectCalendars.push(true); return 'cal-new' },
    deleteTaskEvent: async () => {},
  }
  const effects = createProjectsTaskEffects({ prisma, bridge, notifSvc: { notifyTaskAssigned: async () => {}, notifyTaskStatusChanged: async () => {} } })
  const c = { get: (key) => ({ companyId: 'co1', userId: 'u1' })[key] }
  return { effects, c, synced, projectCalendars }
}
const task = { id: 't1', projectId: 'p1', title: 'T' }

test('changing only the start date of a task updates its calendar event', async () => {
  const { effects, c, synced } = setup()
  await effects.afterUpdate(c, { id: 't1', projectId: 'p1' }, task, { startDate: '2026-11-03' })
  assert.deepEqual(synced, [{ task: 't1', calendarId: 'cal-1' }])
})

test('changing only the due date, or clearing a date, also syncs; other edits do not', async () => {
  const { effects, c, synced } = setup()
  await effects.afterUpdate(c, { id: 't1', projectId: 'p1' }, task, { dueDate: '2026-11-04' })
  await effects.afterUpdate(c, { id: 't1', projectId: 'p1' }, task, { startDate: null })
  await effects.afterUpdate(c, { id: 't1', projectId: 'p1' }, task, { title: 'Otro' })
  assert.equal(synced.length, 2)
})

test('a new task with only a start date reaches the calendar', async () => {
  const { effects, c, synced } = setup()
  await effects.afterCreate(c, { ...task, startDate: new Date(), dueDate: null, assigneeId: null })
  assert.equal(synced.length, 1)
})

test('a project without a calendar (like the personal one) gets one the first time it is needed', async () => {
  const { effects, c, synced, projectCalendars } = setup({ calendarId: null })
  await effects.afterUpdate(c, { id: 't1', projectId: 'p1' }, task, { dueDate: '2026-11-04' })
  assert.equal(projectCalendars.length, 1)
  assert.deepEqual(synced, [{ task: 't1', calendarId: 'cal-new' }])
})
