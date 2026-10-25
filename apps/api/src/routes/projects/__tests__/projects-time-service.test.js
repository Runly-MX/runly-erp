import test from 'node:test'
import assert from 'node:assert/strict'
import { createTimeService } from '../projects-time-service.js'

function fake() {
  const rows = []
  const match = (row, where) => Object.entries(where).every(([key, value]) => (value === null ? row[key] === null : key === 'minutes' && value?.not === null ? row[key] !== null : typeof value === 'object' && value !== null && !(value instanceof Date) ? true : row[key] === value))
  return {
    rows,
    taskTimeEntry: {
      findFirst: async ({ where }) => rows.find((row) => match(row, where)) ?? null,
      findMany: async ({ where }) => rows.filter((row) => match(row, { companyId: where.companyId, ...(where.userId ? { userId: where.userId } : {}), ...(where.taskId ? { taskId: where.taskId } : {}) })),
      create: async ({ data }) => { const row = { id: `e${rows.length + 1}`, note: null, createdAt: new Date(), ...data }; rows.push(row); return row },
      update: async ({ where, data }) => { const row = rows.find((item) => item.id === where.id); Object.assign(row, data); return row },
      delete: async ({ where }) => { rows.splice(rows.findIndex((row) => row.id === where.id), 1) },
    },
  }
}
let clock = new Date('2026-11-04T10:00:00Z')
const svc = (prisma) => createTimeService({ prisma, now: () => clock })

test('starting a timer stops the one already running and reports it', async () => {
  const prisma = fake()
  const time = svc(prisma)
  clock = new Date('2026-11-04T10:00:00Z')
  const first = await time.startTimer({ companyId: 'c', taskId: 't1', userId: 'u' })
  assert.equal(first.stopped, null)
  clock = new Date('2026-11-04T10:45:00Z')
  const second = await time.startTimer({ companyId: 'c', taskId: 't2', userId: 'u' })
  assert.equal(second.stopped.minutes, 45)
  assert.equal(prisma.rows.filter((row) => row.minutes === null).length, 1)
  clock = new Date('2026-11-04T11:00:00Z')
  assert.equal((await time.stopTimer({ companyId: 'c', userId: 'u' })).minutes, 15)
  await assert.rejects(time.stopTimer({ companyId: 'c', userId: 'u' }), /No tienes un cronómetro/)
})

test('a timer left on for more than 12 hours is closed at 12 and flagged', async () => {
  const prisma = fake()
  const time = svc(prisma)
  clock = new Date('2026-11-03T08:00:00Z')
  await time.startTimer({ companyId: 'c', taskId: 't1', userId: 'u' })
  clock = new Date('2026-11-04T10:00:00Z')
  assert.equal(await time.running({ companyId: 'c', userId: 'u' }), null)
  assert.equal(prisma.rows[0].minutes, 720)
  assert.match(prisma.rows[0].note, /12 h/)
})

test('manual entries are checked, people see only their own time and only owners see all', async () => {
  const prisma = fake()
  const time = svc(prisma)
  clock = new Date('2026-11-04T10:00:00Z')
  await assert.rejects(time.addEntry({ companyId: 'c', taskId: 't1', userId: 'u', minutes: 0 }), /1 minuto/)
  await time.addEntry({ companyId: 'c', taskId: 't1', userId: 'u', minutes: 30 })
  await time.addEntry({ companyId: 'c', taskId: 't1', userId: 'other', minutes: 60 })
  assert.equal((await time.listEntries({ companyId: 'c', taskId: 't1', userId: 'u', canSeeAll: false })).length, 1)
  assert.equal((await time.listEntries({ companyId: 'c', taskId: 't1', userId: 'u', canSeeAll: true })).length, 2)
  await assert.rejects(time.deleteEntry({ companyId: 'c', entryId: 'e2', taskId: 't1', userId: 'u', canSeeAll: false }), /no encontrado/)
  await time.deleteEntry({ companyId: 'c', entryId: 'e2', taskId: 't1', userId: 'u', canSeeAll: true })
  assert.equal(prisma.rows.length, 1)
})
