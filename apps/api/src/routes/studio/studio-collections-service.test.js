import test from 'node:test'
import assert from 'node:assert/strict'
import { createStudioCollectionsService } from './studio-collections-service.js'

const ID = '01a104ec-6405-7281-87f3-5f80cef7a306'
// Validation runs before any SQL: a prisma stub that throws proves nothing reached the database.
const service = createStudioCollectionsService({
  prisma: { $queryRaw: () => { throw new Error('db reached') }, $transaction: () => { throw new Error('db reached') } },
  access: { member: async () => {} },
})

test('collection names are trimmed, required and at most 60 characters', async () => {
  await assert.rejects(service.create(ID, ID, { name: '   ' }), { status: 400 })
  await assert.rejects(service.create(ID, ID, { name: 'x'.repeat(61) }), { status: 400 })
})

test('items must name a known kind and a valid id before touching the database', async () => {
  await assert.rejects(service.favorite(ID, ID, { kind: 'folder', itemId: ID }), { status: 400 })
  await assert.rejects(service.favorite(ID, ID, { kind: 'design', itemId: 'nope' }), { status: 404 })
  await assert.rejects(service.favorite(ID, ID, { kind: 'builtin', itemId: 'not-a-template' }), { status: 404 })
})
