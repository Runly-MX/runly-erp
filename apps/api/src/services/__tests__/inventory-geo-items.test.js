import { test } from 'node:test'
import assert from 'node:assert/strict'
import { listGeoItems } from '../inventory-geo-items.js'

const fakePrisma = (rows, seen) => ({ invItem: { findMany: async (a) => { seen.args = a; return rows } } })

test('listGeoItems: geolocated, scoped, list filters, type pin data', async () => {
  const seen = {}
  const prisma = fakePrisma([
    { id: 'i1', name: 'Laptop', latitude: '19.432608', longitude: '-99.133209', category: { id: 'c9', name: 'Equipo', icon: 'laptop', color: '#7c3aed' }, location: null, assignedTo: { firstName: 'Ana', lastName: 'Ruiz' } },
  ], seen)
  const scope = { all: false, roles: new Map([['a1', 'viewer']]), own: null }
  const result = await listGeoItems(prisma, 'c1', scope, { categoryId: 'c9', status: 'available' })
  const { where } = seen.args
  assert.equal(where.companyId, 'c1')
  assert.equal(where.categoryId, 'c9')
  assert.equal(where.status, 'available')
  assert.deepEqual(where.adminStatus, { not: 'deregistered' })
  assert.ok(where.AND.some((c) => c.areaId?.in?.[0] === 'a1'))
  assert.ok(where.AND.some((c) => c.latitude))
  assert.deepEqual(result.data[0], { id: 'i1', name: 'Laptop', latitude: 19.432608, longitude: -99.133209, categoryId: 'c9', categoryName: 'Equipo', categoryIcon: 'laptop', categoryColor: '#7c3aed', locationName: null, assignedToName: 'Ana Ruiz' })
})

test('listGeoItems: an explicit adminStatus filter replaces the default', async () => {
  const seen = {}
  await listGeoItems(fakePrisma([], seen), 'c1', null, { adminStatus: 'deregistered' })
  assert.equal(seen.args.where.adminStatus, 'deregistered')
})
