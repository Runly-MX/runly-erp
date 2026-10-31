import { test } from 'node:test'
import assert from 'node:assert/strict'
import { documentaryDefaults, documentaryPayload, documentarySchema } from '../documentary-form.js'

test('only the reference is required; nothing economic, no assumed date', () => {
  const values = { ...documentaryDefaults(), reference: '  OC-2485 ' }
  assert.equal(documentarySchema('orders').safeParse(values).success, true)
  assert.deepEqual(documentaryPayload('orders', values), { reference: 'OC-2485' })
  assert.equal(documentaryDefaults().issueDate, '')
  const empty = documentarySchema('invoices').safeParse(documentaryDefaults())
  assert.equal(empty.success, false); assert.equal(empty.error.issues[0].path[0], 'reference')
})

test('optional data travels only when captured; lines never carry prices', () => {
  const body = documentaryPayload('invoices', {
    ...documentaryDefaults({ inventoryIds: ['i1'] }), reference: 'F-008721', supplierId: 's1', issueDate: '2026-10-12', fiscalUuid: '', expectedDate: '2026-10-20',
    lines: [{ description: 'Adaptador', quantity: '3', unit: 'pieza', itemKind: 'GOODS' }, { description: '', quantity: '', unit: '', itemKind: 'GOODS' }],
    orderIds: ['o1', 'o2'],
  }, { idempotencyKey: 'k1' })
  assert.deepEqual(body, {
    reference: 'F-008721', supplierId: 's1', issueDate: '2026-10-12', lines: [{ description: 'Adaptador', itemKind: 'GOODS', quantity: 3, unit: 'pieza' }],
    orderIds: ['o1'], inheritItems: true, inventoryIds: ['i1'], idempotencyKey: 'k1',
  })
  assert.ok(!('expectedDate' in body), 'expectedDate is an order field')
})
