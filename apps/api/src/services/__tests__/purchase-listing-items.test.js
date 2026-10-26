import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPurchaseListing } from '../purchase-listing.js'

function fakePrisma() {
  const order = { id: 'o1', companyId: 'c', number: 'OC-1', supplierId: null, status: 'ISSUED', total: 10, createdAt: new Date() }
  return {
    purchaseOrder: { findMany: async () => [order], count: async () => 1 },
    contact: { findMany: async () => [] },
    invItem: {
      findMany: async ({ where }) => (where.id
        ? [{ id: 'i1', assetTag: 'AF-1', serialNumber: 'SN1', name: 'Laptop' }, { id: 'i2', assetTag: 'AF-2', serialNumber: null, name: 'Mouse' }]
        : [{ id: 'i1' }]),
    },
    entityRelation: {
      findMany: async ({ where }) => (where.targetId ? [{ sourceId: 'o1' }] : [{ sourceId: 'o1', targetId: 'i1' }, { sourceId: 'o1', targetId: 'i2' }]),
    },
  }
}

test('cada orden trae sus activos con número y serie', async () => {
  const { list } = createPurchaseListing({ prisma: fakePrisma() })
  const { data } = await list('orders', 'c', {})
  assert.equal(data[0].items.count, 2)
  assert.deepEqual(data[0].items.preview.map(i => [i.assetTag, i.serialNumber]), [['AF-1', 'SN1'], ['AF-2', null]])
})

test('buscar por número de activo encuentra la orden', async () => {
  let where
  const prisma = fakePrisma()
  prisma.purchaseOrder.findMany = async args => { where = args.where; return [] }
  const { list } = createPurchaseListing({ prisma })
  await list('orders', 'c', { search: 'AF-1' })
  assert.ok(where.OR.some(clause => clause.id?.in?.includes('o1')))
})
