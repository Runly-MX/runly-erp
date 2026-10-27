import test from 'node:test'
import assert from 'node:assert/strict'
import { createAutomationRunsService } from '../automation-runs-service.js'

function fakePrisma() {
  const rows = []
  return {
    rows,
    automationRun: {
      create: async ({ data }) => { const row = { id: `r${rows.length + 1}`, createdAt: new Date(), ...data }; rows.push(row); return row },
      findMany: async ({ where, take }) => rows.filter((r) => r.companyId === where.companyId && r.moduleKey === where.moduleKey
        && (!where.automationKey || r.automationKey === where.automationKey) && (!where.status || r.status === where.status)).slice(0, take),
      deleteMany: async ({ where }) => { const before = rows.length; for (let i = rows.length - 1; i >= 0; i -= 1) if (rows[i].createdAt < where.createdAt.lt) rows.splice(i, 1); return { count: before - rows.length } },
    },
  }
}

test('log binds company and module, normalizes the entry and never throws', async () => {
  const prisma = fakePrisma()
  const svc = createAutomationRunsService({ prisma })
  const row = await svc.log({ companyId: 'c1', moduleKey: 'custom.a', entry: { automationKey: 'x', triggerKind: 'weird', status: 'bogus', steps: [{ ok: true }], durationMs: -4 } })
  assert.equal(row.triggerKind, 'record')
  assert.equal(row.status, 'failed')
  assert.equal(row.durationMs, 0)
  assert.equal(await svc.log({ companyId: null, moduleKey: 'custom.a', entry: { automationKey: 'x' } }), null)
  const broken = createAutomationRunsService({ prisma: { automationRun: { create: async () => { throw new Error('tabla') } } } })
  assert.equal(await broken.log({ companyId: 'c1', moduleKey: 'm', entry: { automationKey: 'x' } }), null)
})

test('list is scoped to company and module and filters; purge drops old rows', async () => {
  const prisma = fakePrisma()
  const svc = createAutomationRunsService({ prisma })
  await svc.log({ companyId: 'c1', moduleKey: 'm', entry: { automationKey: 'a', status: 'success' } })
  await svc.log({ companyId: 'c1', moduleKey: 'm', entry: { automationKey: 'b', status: 'failed' } })
  await svc.log({ companyId: 'c2', moduleKey: 'm', entry: { automationKey: 'a', status: 'success' } })
  assert.equal((await svc.list({ companyId: 'c1', moduleKey: 'm' })).length, 2)
  assert.deepEqual((await svc.list({ companyId: 'c1', moduleKey: 'm', status: 'failed' })).map((r) => r.automationKey), ['b'])
  prisma.rows[0].createdAt = new Date(Date.now() - 100 * 86_400_000)
  assert.equal(await svc.purgeOlderThan(90), 1)
})

test('a finished run is published as an event; chained runs add depth, tests and waits stay silent', async () => {
  const prisma = fakePrisma()
  const events = []
  prisma.domainEventOutbox = { create: async ({ data }) => { events.push(data); return data } }
  const svc = createAutomationRunsService({ prisma })
  const log = (entry) => svc.log({ companyId: 'c1', moduleKey: 'm', entry: { automationKey: 'a', steps: [], ...entry } })
  await log({ status: 'failed', error: 'x', triggerKind: 'event' })
  await log({ status: 'waiting', triggerKind: 'event' })
  await log({ status: 'success', triggerKind: 'test' })
  assert.equal(events.length, 1)
  assert.deepEqual([events[0].event, events[0].payload.status, events[0].payload.depth], ['automations.run.finished', 'failed', 0])
  await log({ status: 'success', triggerKind: 'event', input: { automationKey: 'a', status: 'failed', depth: 2 } })
  assert.equal(events[1].payload.depth, 3)
  await log({ status: 'success', triggerKind: 'event', input: { automationKey: 'a', status: 'failed', depth: 3 } })
  assert.equal(events.length, 2)
})
