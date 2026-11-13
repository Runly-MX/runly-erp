import test from 'node:test'
import assert from 'node:assert/strict'
import { requestedParent, componentLinkWhere, prepareParentLink } from '../inventory-item-components.js'
import { buildInventoryWhere } from '../inventory-query.js'

const fail = (message, status) => Object.assign(new Error(message), { status })
const COMPANY = '11111111-1111-4111-8111-111111111111'

test('requestedParent: untouched, clear and set', () => {
  assert.equal(requestedParent({}), undefined)
  assert.equal(requestedParent({ parentItemId: '' }), null)
  assert.equal(requestedParent({ parentItemId: 'abc' }), 'abc')
})

test('link filter is added to the list where', () => {
  assert.equal(componentLinkWhere('nope'), null)
  const where = buildInventoryWhere(COMPANY, { link: 'child' })
  assert.deepEqual(where.AND, [{ parentItemId: { not: null } }])
})

test('prepareParentLink rejects self, deep and non-parent chains', async () => {
  const prisma = (parent, children = 0) => ({ invItem: { findFirst: async () => parent, count: async () => children } })
  const run = (p, itemId, parentItemId) => prepareParentLink({ prisma: p, companyId: COMPANY, itemId, body: { parentItemId }, fail })
  await assert.rejects(run(prisma({}), 'a', 'a'), { status: 400 })
  await assert.rejects(run(prisma(null), 'a', 'b'), { status: 404 })
  await assert.rejects(run(prisma({ parentItemId: 'x' }), 'a', 'b'), { status: 409 })
  await assert.rejects(run(prisma({ parentItemId: null }, 2), 'a', 'b'), { status: 409 })
  assert.equal((await run(prisma({ parentItemId: null }), 'a', 'b')).afterWrite instanceof Function, true)
  assert.equal((await prepareParentLink({ prisma: prisma(null), companyId: COMPANY, body: {}, fail })).afterWrite, null)
})

test('linkComponents validates and updates in bulk', async () => {
  const { linkComponents } = await import('../inventory-item-components.js')
  const calls = []
  const prisma = (parent, withKids = 0, found = 2) => ({ invItem: {
    findFirst: async () => parent, count: async () => withKids,
    findMany: async () => Array.from({ length: found }, (_, i) => ({ id: `i${i}`, areaId: null })),
    updateMany: async (args) => { calls.push(args) },
  } })
  const run = (p, parentId, ids = ['i0', 'i1']) => linkComponents({ prisma: p, companyId: COMPANY, parentId, itemIds: ids, fail })
  await assert.rejects(run(prisma({}), 'i0'), { status: 400 })
  await assert.rejects(run(prisma({ parentItemId: 'x' }), 'p'), { status: 409 })
  await assert.rejects(run(prisma({ parentItemId: null }, 1), 'p'), { status: 409 })
  await assert.rejects(run(prisma({ parentItemId: null }, 0, 1), 'p'), { status: 404 })
  assert.deepEqual(await run(prisma({ parentItemId: null }), 'p'), { linked: 2 })
  assert.deepEqual(await run(prisma(null), null), { linked: 2 })
  assert.equal(calls.at(-1).data.parentItemId, null)
})
