import test from 'node:test'
import assert from 'node:assert/strict'
import { createAutomationApprovalsService, APPROVAL_TTL_MS } from '../automation-approvals-service.js'

const NOW = new Date('2026-10-26T14:00:00Z')
const ALICE = '01a10900-0000-7000-8000-00000000000a'
const BOB = '01a10900-0000-7000-8000-00000000000b'

function fakePrisma({ members = [ALICE, BOB] } = {}) {
  const jobs = new Map()
  const approvals = new Map()
  const runs = new Map([['run-1', { id: 'run-1', companyId: 'c1', status: 'waiting' }]])
  const audit = []
  const db = {
    jobs, approvals, runs, audit,
    membership: { findMany: async ({ where }) => members.filter((id) => where.userId.in.includes(id)).map((userId) => ({ userId })) },
    automationJob: {
      findFirst: async ({ where }) => [...jobs.values()].find((job) => job.dedupeKey === where.dedupeKey) ?? null,
      create: async ({ data }) => { const row = { id: `j${jobs.size + 1}`, ...data }; jobs.set(row.id, row); return row },
      update: async ({ where, data }) => Object.assign(jobs.get(where.id), data),
    },
    automationApproval: {
      create: async ({ data }) => { const row = { id: `a${approvals.size + 1}`, status: 'pending', createdAt: NOW, ...data }; approvals.set(row.id, row); return row },
      findFirst: async ({ where }) => [...approvals.values()].find((row) => row.id === where.id && row.companyId === where.companyId) ?? null,
      findMany: async ({ where }) => [...approvals.values()].filter((row) => row.status === where.status
        && (!where.companyId || row.companyId === where.companyId)
        && (!where.approverIds || row.approverIds.includes(where.approverIds.has))
        && (where.expiresAt.gt ? row.expiresAt > where.expiresAt.gt : row.expiresAt <= where.expiresAt.lte)),
      updateMany: async ({ where, data }) => {
        const row = approvals.get(where.id)
        if (!row || row.status !== where.status) return { count: 0 }
        Object.assign(row, data)
        return { count: 1 }
      },
    },
    automationRun: { updateMany: async ({ where, data }) => { const run = runs.get(where.id); if (!run || (where.status && run.status !== where.status)) return { count: 0 }; Object.assign(run, data); return { count: 1 } } },
    auditLog: { create: async ({ data }) => { audit.push(data) } },
    $transaction: async (fn) => fn(db),
  }
  return db
}

const request = (extra = {}) => ({ automationKey: 'a', fromStep: 2, runId: 'run-1', approvers: [ALICE, BOB, 'outsider'], message: 'Aprobar OS-1', payload: { data: { id: 1 } }, dedupe: 'a:r1:a2', ...extra })

test('create parks the continuation, keeps only company members and notifies them once', async () => {
  const db = fakePrisma({ members: [ALICE] })
  const notified = []
  const svc = createAutomationApprovalsService({ prisma: db, notifications: { publish: async (args) => { notified.push(args) } }, now: () => NOW })
  const approval = await svc.create({ companyId: 'c1', moduleKey: 'custom.x', request: request() })
  assert.deepEqual(approval.approverIds, [ALICE])
  const job = db.jobs.get(approval.jobId)
  assert.equal(job.status, 'awaiting_approval')
  assert.equal(job.runAt.getTime(), NOW.getTime() + APPROVAL_TTL_MS)
  assert.deepEqual(notified[0].input.recipients.userIds, [ALICE])
  assert.equal(await svc.create({ companyId: 'c1', moduleKey: 'custom.x', request: request() }), null) // retried: nothing new
  assert.equal(notified.length, 1)
  await assert.rejects(svc.create({ companyId: 'c1', moduleKey: 'custom.x', request: request({ approvers: ['outsider'], dedupe: 'other' }) }), /Ninguna/)
})

test('approve resumes the run, reject ends it, only approvers decide, once', async () => {
  const db = fakePrisma()
  const svc = createAutomationApprovalsService({ prisma: db, now: () => NOW })
  const approval = await svc.create({ companyId: 'c1', moduleKey: 'custom.x', request: request() })
  assert.equal((await svc.listMine({ companyId: 'c1', profileId: ALICE })).length, 1)
  assert.equal((await svc.listMine({ companyId: 'c1', profileId: 'someone-else' })).length, 0)
  await assert.rejects(svc.decide({ companyId: 'c1', profileId: 'someone-else', id: approval.id, decision: 'approve' }), /no encontrada/)
  await assert.rejects(svc.decide({ companyId: 'other', profileId: ALICE, id: approval.id, decision: 'approve' }), /no encontrada/)
  await assert.rejects(svc.decide({ companyId: 'c1', profileId: ALICE, id: approval.id, decision: 'maybe' }), /Decisión/)

  assert.deepEqual(await svc.decide({ companyId: 'c1', profileId: ALICE, id: approval.id, decision: 'approve' }), { id: approval.id, status: 'approved' })
  const job = db.jobs.get(approval.jobId)
  assert.equal(job.status, 'pending')
  assert.equal(job.runAt.getTime(), NOW.getTime())
  assert.equal(db.audit[0].action, 'automation.approval.decided')
  await assert.rejects(svc.decide({ companyId: 'c1', profileId: BOB, id: approval.id, decision: 'reject' }), /ya fue resuelta/)

  const second = await svc.create({ companyId: 'c1', moduleKey: 'custom.x', request: request({ dedupe: 'a:r2:a2' }) })
  await svc.decide({ companyId: 'c1', profileId: BOB, id: second.id, decision: 'reject', comment: 'No procede' })
  assert.equal(db.jobs.get(second.jobId).status, 'cancelled')
  assert.equal(db.runs.get('run-1').status, 'rejected')
  assert.match(db.runs.get('run-1').error, /No procede/)
})

test('unanswered approvals expire and cancel their job and run', async () => {
  const db = fakePrisma()
  let clock = NOW
  const svc = createAutomationApprovalsService({ prisma: db, now: () => clock })
  const approval = await svc.create({ companyId: 'c1', moduleKey: 'custom.x', request: request() })
  assert.equal(await svc.expireOverdue(), 0)
  clock = new Date(NOW.getTime() + APPROVAL_TTL_MS + 1000)
  await assert.rejects(svc.decide({ companyId: 'c1', profileId: ALICE, id: approval.id, decision: 'approve' }), /expiró/)
  assert.equal(await svc.expireOverdue(), 1)
  assert.equal(db.approvals.get(approval.id).status, 'expired')
  assert.equal(db.jobs.get(approval.jobId).status, 'cancelled')
  assert.equal(db.runs.get('run-1').status, 'cancelled')
})
