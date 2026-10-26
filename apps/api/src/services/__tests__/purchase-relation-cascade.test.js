import { test } from 'node:test'
import assert from 'node:assert/strict'
import { linkItemsToInvoiceOrder } from '../purchase-relation-cascade.js'

function fakeTx({ billedFrom = 'o1', orders = [] }) {
  const created = []
  return {
    created,
    entityRelation: {
      findFirst: async () => (billedFrom ? { targetId: billedFrom } : null),
      findMany: async () => orders,
      createMany: async ({ data }) => { created.push(...data); return { count: data.length } },
    },
    auditLog: { create: async () => ({}) },
  }
}

test('la factura con orden relaciona sus equipos libres a esa orden', async () => {
  const tx = fakeTx({ orders: [{ targetId: 'i2', sourceId: 'o9' }, { targetId: 'i3', sourceId: 'o1' }] })
  const result = await linkItemsToInvoiceOrder(tx, { companyId: 'c', invoiceId: 'f1', itemIds: ['i1', 'i2', 'i3'] })
  assert.deepEqual(result, { orderId: 'o1', linked: 1, skipped: 1 })
  assert.deepEqual(tx.created.map(r => [r.targetId, r.sourceId, r.origin]), [['i1', 'o1', 'AUTOMATIC']])
})

test('una factura sin orden no hace nada', async () => {
  const tx = fakeTx({ billedFrom: null })
  assert.deepEqual(await linkItemsToInvoiceOrder(tx, { companyId: 'c', invoiceId: 'f1', itemIds: ['i1'] }), { orderId: null, linked: 0, skipped: 0 })
  assert.equal(tx.created.length, 0)
})
