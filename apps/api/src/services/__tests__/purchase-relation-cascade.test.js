import { test } from 'node:test'
import assert from 'node:assert/strict'
import { linkItemsToInvoiceOrder } from '../purchase-relation-cascade.js'

function fakeTx({ billedFrom = 'o1', orders = [], cancelled = [] }) {
  const created = []
  return {
    $queryRaw: async () => [],
    created,
    purchaseOrder: { findMany: async ({ where }) => where.id.in.filter(id => !cancelled.includes(id)).map(id => ({ id })) },
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

test('un equipo cuya orden se canceló toma la orden de la factura', async () => {
  const tx = fakeTx({ orders: [{ targetId: 'i2', sourceId: 'o-cancelada' }], cancelled: ['o-cancelada'] })
  const result = await linkItemsToInvoiceOrder(tx, { companyId: 'c', invoiceId: 'f1', itemIds: ['i2'] })
  assert.deepEqual(result, { orderId: 'o1', linked: 1, skipped: 0 })
})

test('una factura sin orden no hace nada', async () => {
  const tx = fakeTx({ billedFrom: null })
  assert.deepEqual(await linkItemsToInvoiceOrder(tx, { companyId: 'c', invoiceId: 'f1', itemIds: ['i1'] }), { orderId: null, linked: 0, skipped: 0 })
  assert.equal(tx.created.length, 0)
})
