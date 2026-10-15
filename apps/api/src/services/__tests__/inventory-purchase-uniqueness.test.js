import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assertItemsFreeOfKind, duplicateLinkMessage, findDuplicateLinks } from '../inventory-purchase-uniqueness.js'

const fail = (message, status, code) => Object.assign(new Error(message), { status, code })
const clientWith = rows => ({
  entityRelation: {
    findMany: async ({ where }) => rows.filter(r => where.targetId.in.includes(r.targetId) && r.relationType === where.relationType
      && (!where.sourceId?.not || r.sourceId !== where.sourceId.not)),
  },
})

test('rechaza una segunda orden con 409 y mensaje claro', async () => {
  const client = clientWith([{ relationType: 'PURCHASED_IN', targetId: 'i1', sourceId: 'o1' }])
  await assert.rejects(assertItemsFreeOfKind(client, 'c', 'PURCHASED_IN', ['i1'], 'o2', fail),
    err => err.status === 409 && err.message === 'Este equipo ya tiene una orden de compra: cámbiala desde el campo Orden de compra.')
})

test('el mismo documento y otros equipos no chocan; una orden puede cubrir muchos equipos', async () => {
  const client = clientWith([{ relationType: 'PURCHASED_IN', targetId: 'i1', sourceId: 'o1' }])
  await assertItemsFreeOfKind(client, 'c', 'PURCHASED_IN', ['i1'], 'o1', fail)
  await assertItemsFreeOfKind(client, 'c', 'PURCHASED_IN', ['i2', 'i3'], 'o1', fail)
  await assertItemsFreeOfKind(client, 'c', 'INVOICED_ITEM', ['i1'], 'f1', fail)
})

test('mensaje plural y diagnóstico de duplicados', () => {
  assert.match(duplicateLinkMessage('INVOICED_ITEM', 3), /^3 equipos ya tienen una factura/)
  const rows = [
    { relationType: 'PURCHASED_IN', targetId: 'i1', sourceId: 'o1' },
    { relationType: 'PURCHASED_IN', targetId: 'i1', sourceId: 'o2' },
    { relationType: 'PURCHASED_IN', targetId: 'i2', sourceId: 'o1' },
    { relationType: 'RECEIVED_IN', targetId: 'i2', sourceId: 'r1' },
  ]
  assert.deepEqual(findDuplicateLinks(rows), [{ itemId: 'i1', relationType: 'PURCHASED_IN', documentIds: ['o1', 'o2'] }])
})
