import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createCompanyDeletionService } from '../company-deletion-service.js'

test('a notifier failure after commit still returns the scheduled deletion', async () => {
  let committed = false
  let suspended = false
  const db = {
    membership: { findFirst: async () => ({ role: {}, company: { name: 'Example', enabled: true }, userId: 'member' }) },
    $executeRawUnsafe: async () => 1,
    $queryRawUnsafe: async () => [],
    company: { update: async ({ data }) => { suspended = !data.enabled } },
  }
  const pending = { companyId: 'company', state: 'PENDING', purgeAfter: '2099-01-01' }
  const service = createCompanyDeletionService({
    prisma: {
      $transaction: async callback => { const result = await callback(db); committed = true; return result },
      $queryRawUnsafe: async () => [pending],
    },
    notifier: { notify: async () => { assert.ok(committed && suspended); throw new Error('mail unavailable') } },
  })
  const result = await service.request({ companyId: 'company', authUserId: 'user', confirmation: 'Example', notifyMembers: true })
  assert.deepEqual(result.pending, pending)
  assert.deepEqual(result.notice, { sent: 0, failed: 1, reasons: ['smtp_send_failed'] })
})
