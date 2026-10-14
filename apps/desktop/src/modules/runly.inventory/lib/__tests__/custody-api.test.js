import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dataUrlToBase64, formatCustodyDate, parseCustody, parseCustodyList, parsePublicCustody, templateWarnings } from '../custody-api.js'

test('parseCustodyList unwraps { items, total } and derives display fields', () => {
  const { items, total } = parseCustodyList({ items: [{ id: 'a', employee: { firstName: 'Ana', lastName: 'Ruiz' }, items: [{}, {}], receiverSignedAt: '2026-10-13' }], total: 7 })
  assert.equal(total, 7)
  assert.equal(items[0].employeeName, 'Ana Ruiz')
  assert.equal(items[0].itemCount, 2)
  assert.equal(items[0].receiverSigned, true)
  assert.equal(items[0].delivererSigned, false)
})

test('parseCustody unwraps { custody }', () => {
  assert.equal(parseCustody({ custody: { id: 'x', items: [] } }).id, 'x')
})

test('parsePublicCustody accepts nested company and flags', () => {
  const c = parsePublicCustody({ folio: 'RES-2026-0001', company: { name: 'Acme' }, items: [{ model: 'T14' }] })
  assert.equal(c.companyName, 'Acme')
  assert.equal(c.items.length, 1)
  assert.equal(c.receiverSigned, false)
})

test('helpers', () => {
  assert.equal(dataUrlToBase64('data:image/png;base64,AAAA'), 'AAAA')
  assert.equal(formatCustodyDate('2026-10-13T00:00:00.000Z'), '13/10/2026')
  assert.deepEqual(templateWarnings({ warnings: ['x', { tag: 'foo' }] }), ['x', 'Etiqueta desconocida: foo'])
})
