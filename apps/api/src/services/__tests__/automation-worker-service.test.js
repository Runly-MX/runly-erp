import test from 'node:test'
import assert from 'node:assert/strict'
import { createAutomationJobsService, MAX_JOB_ATTEMPTS } from '../automation-jobs-service.js'
import { createAutomationWorker } from '../automation-worker-service.js'

const NOW = new Date('2026-10-26T14:00:00Z')

function jobsPrisma() {
  const rows = new Map()
  return {
    rows,
    automationJob: {
      create: async ({ data }) => {
        if (data.dedupeKey && [...rows.values()].some((row) => row.dedupeKey === data.dedupeKey)) throw Object.assign(new Error('dup'), { code: 'P2002' })
        const row = { id: `j${rows.size + 1}`, status: 'pending', attempts: 0, ...data }
        rows.set(row.id, row)
        return row
      },
      update: async ({ where, data }) => Object.assign(rows.get(where.id), data),
      findFirst: async ({ where }) => [...rows.values()].find((row) => row.id === where.id && row.companyId === where.companyId && row.moduleKey === where.moduleKey) ?? null,
    },
  }
}

test('enqueue validates the delay, dedupes and cancel only affects pending waits', async () => {
  const prisma = jobsPrisma()
  const svc = createAutomationJobsService({ prisma, now: () => NOW })
  const job = { automationKey: 'a', fromStep: 2, runAt: new Date(NOW.getTime() + 3_600_000).toISOString(), payload: { data: { id: 1 } }, dedupe: 'a:r1:w2' }
  assert.ok(await svc.enqueue({ companyId: 'c1', moduleKey: 'custom.x', job }))
  assert.equal(await svc.enqueue({ companyId: 'c1', moduleKey: 'custom.x', job }), null) // retried request: no second continuation
  await assert.rejects(svc.enqueue({ companyId: 'c1', moduleKey: 'custom.x', job: { ...job, dedupe: null, runAt: new Date(NOW.getTime() + 40 * 86_400_000).toISOString() } }), /1 minuto a 30 días/)
  await assert.rejects(svc.enqueue({ companyId: 'c1', moduleKey: 'custom.x', job: { ...job, dedupe: null, payload: { big: 'x'.repeat(70_000) } } }), /demasiado grandes/)
  const cancelled = await svc.cancel({ companyId: 'c1', moduleKey: 'custom.x', id: 'j1' })
  assert.equal(cancelled.id, 'j1')
  await assert.rejects(svc.cancel({ companyId: 'c1', moduleKey: 'custom.x', id: 'j1' }), /pendiente/)
  await assert.rejects(svc.cancel({ companyId: 'other', moduleKey: 'custom.x', id: 'j1' }), /no encontrada/)
})

test('fail reschedules with backoff and gives up after the maximum attempts', async () => {
  const prisma = jobsPrisma()
  const svc = createAutomationJobsService({ prisma, now: () => NOW })
  const row = await prisma.automationJob.create({ data: { companyId: 'c', moduleKey: 'm', automationKey: 'a', fromStep: 1, runAt: NOW } })
  assert.equal(await svc.fail({ id: row.id, attempts: 1 }, 'boom'), false)
  assert.equal(row.status, 'pending')
  assert.equal(row.runAt.getTime(), NOW.getTime() + 60_000)
  assert.equal(await svc.fail({ id: row.id, attempts: MAX_JOB_ATTEMPTS }, 'boom'), true)
  assert.equal(row.status, 'failed')
})

function workerPrisma({ schedules = [], manifestSchedules = [] } = {}) {
  const claimedJobs = []
  const state = { schedules: [...schedules], updates: [], jobUpdates: [] }
  return {
    state,
    claimedJobs,
    instanceConfig: { findUnique: async () => ({ value: 'America/Mexico_City' }) },
    runlyModule: {
      findFirst: async () => ({ id: 'mod1' }),
      findMany: async () => [{ key: 'custom.x', manifest: { schedules: manifestSchedules } }],
    },
    companyModule: { findFirst: async () => null },
    automationApproval: { findMany: async () => [] },
    systemAutomation: { findMany: async () => [], findUnique: async () => null },
    company: { findMany: async () => [{ id: 'c1' }] },
    automationJob: { update: async ({ where, data }) => { state.jobUpdates.push({ id: where.id, ...data }) } },
    automationSchedule: {
      findMany: async ({ where } = {}) => (where?.nextRunAt ? state.schedules.filter((row) => row.nextRunAt <= where.nextRunAt.lte) : state.schedules),
      createMany: async ({ data }) => { state.schedules.push(...data) },
      deleteMany: async () => {},
      updateMany: async ({ where, data }) => {
        const row = state.schedules.find((item) => item.automationKey === where.automationKey && (!where.nextRunAt || item.nextRunAt <= where.nextRunAt.lte))
        if (where.nextRunAt && !row) return { count: 0 }
        if (row) Object.assign(row, data)
        state.updates.push(data)
        return { count: 1 }
      },
    },
    $queryRaw: async () => claimedJobs,
  }
}

test('worker resumes a due job through the module runtime and completes it', async () => {
  const prisma = workerPrisma()
  prisma.claimedJobs.push({ id: 'j1', company_id: 'c1', module_key: 'custom.x', automation_key: 'a', run_id: 'r1', from_step: 2, payload: { data: { id: 1 } }, attempts: 1, run_at: NOW })
  const resumed = []
  const worker = createAutomationWorker({
    prisma, now: () => NOW, resolveModulesDir: async () => '',
    importRuntime: async () => ({ resume: async ({ job }) => { resumed.push(job) } }),
  })
  assert.deepEqual(await worker.processJobs(), { done: 1, retry: 0, failed: 0, skipped: 0, expired: 0 })
  assert.equal(resumed[0].fromStep, 2)
  assert.equal(prisma.state.jobUpdates[0].status, 'done')
})

test('a module published before stage B has no resume: the job fails with a clear message', async () => {
  const prisma = workerPrisma()
  prisma.claimedJobs.push({ id: 'j2', company_id: 'c1', module_key: 'custom.x', automation_key: 'a', run_id: null, from_step: 1, payload: {}, attempts: 1, run_at: NOW })
  const worker = createAutomationWorker({ prisma, now: () => NOW, resolveModulesDir: async () => '', importRuntime: async () => ({}) })
  assert.equal((await worker.processJobs()).failed, 1)
  assert.match(prisma.state.jobUpdates[0].lastError, /Vuelve a publicar/)
})

test('due schedules advance next_run_at before firing and fire once with the occurrence', async () => {
  const due = new Date('2026-10-26T13:00:00Z')
  const prisma = workerPrisma({
    manifestSchedules: [{ key: 'revision', every: 'day', at: '08:00' }],
    schedules: [{ companyId: 'c1', moduleKey: 'custom.x', automationKey: 'revision', nextRunAt: due }],
  })
  const fired = []
  const worker = createAutomationWorker({
    prisma, now: () => NOW, resolveModulesDir: async () => '',
    importRuntime: async () => ({ runScheduled: async (args) => { fired.push(args) } }),
  })
  assert.deepEqual(await worker.processSchedules(), { fired: 1, failed: 0, skipped: 0 })
  assert.equal(fired[0].occurrence, due.toISOString())
  // 08:00 Mexico City on 2026-10-26 is 14:00Z, equal to now, so the next is the following day.
  assert.equal(prisma.state.schedules[0].nextRunAt.toISOString(), '2026-10-27T14:00:00.000Z')
  assert.deepEqual(await worker.processSchedules(), { fired: 0, failed: 0, skipped: 0 })
})
