import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createStudioAdapter } from '../adapters/studio.js'

test('studio_create_design creates a blank canvas from a page size and background', async () => {
  const created = []
  const application = { designs: { access: { member: async () => {}, assets: async () => {} }, create: async (_c, _a, input) => { created.push(input); return { id: 'd1', name: input.name, revision: 1 } } },
    templates: {}, guide: async () => ({}) }
  const adapter = createStudioAdapter({ application, prisma: {} })
  const action = adapter.actions.find(item => item.key === 'studio_create_design')
  const input = action.inputSchema.parse({ name: 'Historia', page: { width: 1080, height: 1920, background: '#0F172A' } })
  const prepared = await action.prepare(input, { companyId: 'c', actorProfileId: 'a' })
  assert.deepEqual(prepared.input.document.page, { id: 'page-1', width: 1080, height: 1920, background: '#0f172a' })
  assert.equal(prepared.input.document.schemaVersion, 7)
  assert.equal(prepared.input.page, undefined)
  await action.execute(prepared.input, { companyId: 'c', actorProfileId: 'a' })
  assert.equal(created[0].document.objects.length, 0)
  await assert.rejects(action.prepare(action.inputSchema.parse({ name: 'X', page: { width: 100, height: 100 }, templateId: 'runly:slow-mornings' }), { companyId: 'c', actorProfileId: 'a' }), /exclusivamente/)
})
