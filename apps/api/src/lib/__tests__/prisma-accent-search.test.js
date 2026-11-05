import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildModelIndex, rewriteWhere } from '../prisma-accent-search.js'

const index = buildModelIndex()

function recorder(ids = ['x1']) {
  const calls = []
  return { calls, findIds: async (model, column, term, companyId) => { calls.push({ table: model.table, column, term, companyId }); return ids } }
}

test('rewrites contains+insensitive into an accent-insensitive id filter scoped to the company', async () => {
  const { calls, findIds } = recorder()
  const where = { companyId: 'c1', enabled: true, OR: [{ name: { contains: 'telefono', mode: 'insensitive' } }, { code: { contains: 'tel', mode: 'insensitive' } }] }
  const out = await rewriteWhere(index, 'InvCategory', where, findIds)
  assert.deepEqual(out, { companyId: 'c1', enabled: true, OR: [{ AND: [{ id: { in: ['x1'] } }] }, { AND: [{ id: { in: ['x1'] } }] }] })
  assert.deepEqual(calls[0], { table: 'inv_category', column: 'name', term: 'telefono', companyId: 'c1' })
})

test('follows relation filters into the related model', async () => {
  const { calls, findIds } = recorder(['cat1'])
  const out = await rewriteWhere(index, 'InvItem', { companyId: 'c1', category: { name: { contains: 'telefono', mode: 'insensitive' } } }, findIds)
  assert.deepEqual(out.category, { AND: [{ id: { in: ['cat1'] } }] })
  assert.equal(calls[0].table, 'inv_category')
  const some = await rewriteWhere(index, 'InvItem', { customValues: { some: { value: { contains: 'azul', mode: 'insensitive' } } } }, findIds)
  assert.ok(some.customValues.some.AND)
})

test('leaves other filters untouched (same object)', async () => {
  const { calls, findIds } = recorder()
  const where = { companyId: 'c1', name: { contains: 'x' }, folio: { equals: 'A', mode: 'insensitive' }, status: 'available' }
  assert.equal(await rewriteWhere(index, 'InvItem', where, findIds), where)
  assert.equal(calls.length, 0)
})
