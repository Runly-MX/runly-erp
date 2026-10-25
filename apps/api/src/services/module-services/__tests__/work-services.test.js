import test from 'node:test'
import assert from 'node:assert/strict'
import { createWorkHandlers } from '../work-services.js'

class ServiceError extends Error { constructor(message, status = 400, code = 'x') { super(message); this.status = status; this.code = code } }

test('employee search is company scoped, matches name or department and returns only safe fields', async () => {
  let seen
  const prisma = { hrEmployee: {
    findMany: async (query) => { seen = query; return [{ id: 'e1', firstName: 'Ana', lastName: 'Pérez', department: 'Ventas', status: 'ACTIVE' }] },
    count: async () => 1,
  } }
  const { 'runly.hr:employees.search': search } = createWorkHandlers({ prisma, ServiceError })
  const result = await search({ companyId: 'c1' }, { search: 'ana ventas', limit: 5 })
  assert.deepEqual(result, { items: [{ id: 'e1', name: 'Ana Pérez', department: 'Ventas', status: 'ACTIVE' }], total: 1 })
  assert.equal(seen.where.companyId, 'c1')
  assert.equal(seen.where.AND.length, 2)
  assert.deepEqual(Object.keys(seen.select).sort(), ['department', 'firstName', 'id', 'lastName', 'status'])
})
