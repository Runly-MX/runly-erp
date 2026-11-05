import { test } from 'node:test'
import assert from 'node:assert/strict'
import { listGeoItems } from '../inventory-geo-items.js'

test('listGeoItems: only geolocated active items, scoped, with numeric coordinates', async () => {
  let args
  const prisma = { invItem: { findMany: async (a) => { args = a; return [
    { id: 'i1', name: 'Laptop', latitude: '19.432608', longitude: '-99.133209', category: { name: 'Equipo' }, location: null, assignedTo: { firstName: 'Ana', lastName: 'Ruiz' } },
  ] } } }
  const scope = { all: false, roles: new Map([['a1', 'viewer']]), own: null }
  const result = await listGeoItems(prisma, 'c1', scope)
  assert.equal(args.where.companyId, 'c1')
  assert.deepEqual(args.where.latitude, { not: null })
  assert.deepEqual(args.where.adminStatus, { not: 'deregistered' })
  assert.deepEqual(args.where.areaId, { in: ['a1'] })
  assert.deepEqual(result, { truncated: false, data: [{ id: 'i1', name: 'Laptop', latitude: 19.432608, longitude: -99.133209, categoryName: 'Equipo', locationName: null, assignedToName: 'Ana Ruiz' }] })
})
