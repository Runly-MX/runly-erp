import test from 'node:test'
import assert from 'node:assert/strict'
import { createGanttService } from '../projects-gantt-service.js'
import { parseDay } from '../projects-schedule.js'

function fake({ tasks, edges = [] }) {
  const rows = new Map(tasks.map((task) => [task.id, { projectId: 'p1', statusId: 's', assigneeId: null, ...task }]))
  const tx = {
    task: {
      findFirst: async ({ where }) => (rows.get(where.id) ? { ...rows.get(where.id) } : null),
      update: async ({ where, data }) => { Object.assign(rows.get(where.id), data); return { ...rows.get(where.id) } },
    },
  }
  return {
    rows,
    prisma: {
      task: { ...tx.task, findMany: async ({ where }) => [...rows.values()].filter((row) => !where.id?.in || where.id.in.includes(row.id)) },
      taskDependency: { findMany: async () => edges },
      $transaction: async (fn) => fn(tx),
    },
  }
}
const day = (value) => parseDay(value)
const iso = (date) => (date ? date.toISOString().slice(0, 10) : null) // eslint-disable-line no-restricted-syntax -- noon UTC task dates

test('rescheduling moves the task, keeps what is not sent and clears with null', async () => {
  const { prisma, rows } = fake({ tasks: [{ id: 'A', startDate: day('2026-11-03'), dueDate: day('2026-11-05') }] })
  const svc = createGanttService({ prisma })
  await svc.reschedule({ projectId: 'p1', taskId: 'A', dueDate: '2026-11-09' })
  assert.deepEqual([iso(rows.get('A').startDate), iso(rows.get('A').dueDate)], ['2026-11-03', '2026-11-09'])
  await svc.reschedule({ projectId: 'p1', taskId: 'A', startDate: null })
  assert.equal(rows.get('A').startDate, null)
})

test('invalid dates, reversed ranges and unknown tasks are refused', async () => {
  const { prisma } = fake({ tasks: [{ id: 'A', startDate: null, dueDate: null }] })
  const svc = createGanttService({ prisma })
  await assert.rejects(svc.reschedule({ projectId: 'p1', taskId: 'A', startDate: '2026-13-40' }), /no son válidas/)
  await assert.rejects(svc.reschedule({ projectId: 'p1', taskId: 'A', startDate: '2026-11-09', dueDate: '2026-11-03' }), /posterior/)
  await assert.rejects(svc.reschedule({ projectId: 'p1', taskId: 'zzz', dueDate: '2026-11-03' }), /no encontrada/)
  await assert.rejects(svc.reschedule({ projectId: 'p1', taskId: 'A', dueDate: '2026-11-03', pushDependentsBy: -1 }), /no es válido/)
})

test('pushing moves the dependents by the same days in the same change and reports each before/after', async () => {
  const { prisma, rows } = fake({
    tasks: [
      { id: 'A', startDate: day('2026-11-03'), dueDate: day('2026-11-05') },
      { id: 'B', startDate: day('2026-11-06'), dueDate: day('2026-11-08') },
      { id: 'C', startDate: null, dueDate: day('2026-11-10') },
      { id: 'X', startDate: day('2026-11-01'), dueDate: day('2026-11-02') },
    ],
    edges: [{ blockerId: 'A', blockedId: 'B' }, { blockerId: 'B', blockedId: 'C' }],
  })
  const { changed } = await createGanttService({ prisma }).reschedule({ projectId: 'p1', taskId: 'A', startDate: '2026-11-06', dueDate: '2026-11-08', pushDependentsBy: 3 })
  assert.deepEqual(changed.map((c) => c.after.id), ['A', 'B', 'C'])
  assert.deepEqual([iso(rows.get('B').startDate), iso(rows.get('B').dueDate)], ['2026-11-09', '2026-11-11'])
  assert.deepEqual([rows.get('C').startDate, iso(rows.get('C').dueDate)], [null, '2026-11-13'])
  assert.deepEqual([iso(rows.get('X').startDate)], ['2026-11-01'])
  assert.equal(iso(changed[1].before.startDate), '2026-11-06')
})
