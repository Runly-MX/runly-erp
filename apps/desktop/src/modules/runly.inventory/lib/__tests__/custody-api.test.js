import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  dataUrlToBase64, editClearsSignatures, formatCustodyDate, isEditedField, itemEditClearsSignatures, itemFieldPatch, parseCustody, parseCustodyList, parseDeliverers, parsePublicCustody,
  templateTagCount, templateWarnings,
} from '../custody-api.js'

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

test('revision 2: flags, deliverers, saved signature, signature reset', () => {
  const c = parseCustody({ custody: { id: 'x', receiverSigned: true, hasPublicLink: true, deliverer: { id: 'u1', name: 'Luis' }, employee: { workEmail: 'a@example.com' } } })
  assert.equal(c.delivererId, 'u1')
  assert.equal(c.delivererName, 'Luis')
  assert.equal(c.employeeEmail, 'a@example.com')
  assert.equal(c.hasPublicLink, true)
  assert.equal(editClearsSignatures(c, { comments: 'x' }), false)
  assert.equal(editClearsSignatures(c, { itemIds: [] }), true)
  assert.deepEqual(parseDeliverers({ users: [{ id: 'u1', name: 'Luis', hasSavedSignature: true }, { id: 'b', isBot: true }] }).map((u) => u.id), ['u1'])
  assert.equal(templateTagCount({ tagCount: 0 }), 0)
  assert.equal(parsePublicCustody({ custody: { items: [{ model: 'A' }] } }).items[0].index, 1)
})

test('parseCustody exposes signature URLs and edited fields (revision 3)', () => {
  const custody = parseCustody({ custody: { id: 'x', receiverSignatureUrl: 'https://files.example.com/r.png', items: [{ id: 'r1', editedFields: ['features'] }, { id: 'r2' }] } })
  assert.equal(custody.receiverSignatureUrl, 'https://files.example.com/r.png')
  assert.equal(custody.delivererSignatureUrl, null)
  assert.equal(isEditedField(custody.items[0], 'features'), true)
  assert.deepEqual(custody.items[1].editedFields, [])
  assert.equal(itemEditClearsSignatures({ receiverSigned: true }), true)
  assert.equal(itemEditClearsSignatures({}), false)
})

test('itemFieldPatch builds the PATCH body for an inline cell edit', () => {
  const row = { features: 'Laptop', model: 'X1', editedFields: ['model'] }
  assert.deepEqual(itemFieldPatch(row, 'features', ' 16 GB RAM, 512 GB SSD '), { features: '16 GB RAM, 512 GB SSD' })
  assert.equal(itemFieldPatch(row, 'features', 'Laptop'), null)
  assert.equal(itemFieldPatch(row, 'features', '  '), null)
  assert.deepEqual(itemFieldPatch(row, 'model', ''), { model: null })
  assert.equal(itemFieldPatch(row, 'itemId', 'x'), null)
})
