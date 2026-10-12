import test from 'node:test'
import assert from 'node:assert/strict'
import { purgeExpiredEvidence } from '../attendance-evidence.js'

test('purge removes photo, asset and coordinates of expired punches and keeps the punch', async () => {
  const now = new Date('2026-10-12T12:00:00Z')
  const removed = []
  const punches = [
    { id: 'old', companyId: 'c1', selfieFileId: 'f1', latitude: 1, occurredAt: new Date('2026-08-01T00:00:00Z'), evidencePurgedAt: null },
    { id: 'recent', companyId: 'c1', selfieFileId: 'f2', latitude: 1, occurredAt: new Date('2026-10-10T00:00:00Z'), evidencePurgedAt: null },
    { id: 'other-company-old', companyId: 'c2', selfieFileId: null, latitude: 5, occurredAt: new Date('2026-10-01T00:00:00Z'), evidencePurgedAt: null },
  ]
  const assets = [{ id: 'f1', bucket: 'b', objectKey: 'k1', moduleKey: 'runly.attendance' }, { id: 'f2', bucket: 'b', objectKey: 'k2', moduleKey: 'runly.attendance' }]
  const prisma = {
    attSettings: { findMany: async () => [{ companyId: 'c2', evidenceRetentionDays: 7 }] },
    attPunch: {
      groupBy: async () => [{ companyId: 'c1' }, { companyId: 'c2' }],
      findMany: async ({ where }) => punches.filter((p) => p.companyId === where.companyId && !p.evidencePurgedAt && p.occurredAt < where.occurredAt.lt),
      updateMany: async ({ where, data }) => { for (const p of punches) if (where.id.in.includes(p.id)) Object.assign(p, data) },
    },
    fileAsset: {
      findMany: async ({ where }) => assets.filter((a) => where.id.in.includes(a.id)),
      deleteMany: async ({ where }) => { for (const id of where.id.in) assets.splice(assets.findIndex((a) => a.id === id), 1) },
    },
  }
  const supabaseAdmin = { storage: { from: (bucket) => ({ remove: async (keys) => { removed.push([bucket, ...keys]) } }) } }
  const totals = await purgeExpiredEvidence({ prisma, supabaseAdmin, now })
  assert.equal(totals.punches, 2)
  assert.equal(totals.files, 1)
  assert.deepEqual(removed, [['b', 'k1']])
  assert.equal(punches[0].selfieFileId, null)
  assert.equal(punches[0].latitude, null)
  assert.ok(punches[0].evidencePurgedAt)
  assert.equal(punches[1].selfieFileId, 'f2') // inside the 30-day default window
  assert.equal(punches[2].latitude, null) // company retention of 7 days
  assert.equal(assets.length, 1)
})
