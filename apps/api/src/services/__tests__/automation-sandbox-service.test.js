import test from 'node:test'
import assert from 'node:assert/strict'
import { createAutomationSandboxService } from '../automation-sandbox-service.js'

function fakePrisma() {
  const rows = []
  return { rows, automationRun: { create: async ({ data }) => { const row = { id: `r${rows.length + 1}`, createdAt: new Date(), ...data }; rows.push(row); return row } } }
}

const automation = {
  key: 'avisar', label: 'Avisar', trigger: { type: 'event', event: 'purchases.order.approved', when: { field: 'status', op: 'equals', value: 'APPROVED' } },
  steps: [
    { service: 'runly.notifications:notifications.send', args: { title: { from: 'template', template: 'Orden {{id}}' }, userIds: { from: 'value', value: ['00000000-0000-7000-8000-0000000000b1'] } } },
    { type: 'delay', amount: 1, unit: 'hours' },
    { type: 'http', method: 'POST', url: 'https://example.com/hook', body: { id: { from: 'field', field: 'id' } } },
  ],
}

test('sandbox runs the real engine, skips waits and logs a test run', async () => {
  const prisma = fakePrisma()
  const svc = createAutomationSandboxService({ prisma })
  const out = await svc.run({ companyId: 'c1', moduleKey: 'system.automations', automation, data: { id: 'o1', status: 'APPROVED' } })
  assert.equal(out.passes, true)
  assert.deepEqual(out.steps.map((step) => step.index), [0, 1, 2])
  assert.equal(out.steps[1].simulated, true)
  assert.equal(out.steps[2].type, 'http')
  assert.equal(prisma.rows.length, 1)
  assert.equal(prisma.rows[0].triggerKind, 'test')
})

test('sandbox stops at "Solo si" and says so', async () => {
  const prisma = fakePrisma()
  const out = await createAutomationSandboxService({ prisma }).run({ companyId: 'c1', moduleKey: 'system.automations', automation, data: { id: 'o1', status: 'DRAFT' } })
  assert.equal(out.passes, false)
  assert.equal(out.status, 'cancelled')
  assert.equal(out.steps.length, 0)
  assert.equal(prisma.rows[0].status, 'cancelled')
})
