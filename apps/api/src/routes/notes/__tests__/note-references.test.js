import test from 'node:test'
import assert from 'node:assert/strict'
import { extractEntityReferences } from '../references-service.js'

const U1 = '0195a000-0000-7000-8000-000000000001'
const U2 = '0195a000-0000-7000-8000-000000000002'

test('extracts unique type/id pairs from entity-reference nodes', () => {
  const html =
    `<p>x <span data-type="entity-reference" data-entity-type="contact" data-record-id="${U1}"></span>` +
    `<span data-type="entity-reference" data-record-id="${U2}" data-entity-type="vehicle"></span>` +
    `<span data-type="entity-reference" data-entity-type="contact" data-record-id="${U1}"></span></p>`
  assert.deepEqual(extractEntityReferences(html), [
    { entityType: 'contact', recordId: U1 },
    { entityType: 'vehicle', recordId: U2 },
  ])
})

test('ignores unknown types, malformed ids and non-strings', () => {
  assert.deepEqual(extractEntityReferences(null), [])
  assert.deepEqual(
    extractEntityReferences('<span data-type="entity-reference" data-entity-type="nope" data-record-id="' + U1 + '"></span>'),
    [],
  )
  assert.deepEqual(
    extractEntityReferences('<span data-type="entity-reference" data-entity-type="contact" data-record-id="abc"></span>'),
    [],
  )
})

test('caps the number of references per note', () => {
  const many = Array.from({ length: 80 }, (_, i) =>
    `<span data-type="entity-reference" data-entity-type="contact" data-record-id="0195a000-0000-7000-8000-${String(i).padStart(12, '0')}"></span>`).join('')
  assert.equal(extractEntityReferences(many).length, 50)
})
