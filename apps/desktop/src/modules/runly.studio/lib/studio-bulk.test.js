import test from 'node:test'
import assert from 'node:assert/strict'
import { autoMapping, designFields, fillDocument, rowValues } from './studio-bulk.js'

const text = (id, value) => ({ id, type: 'text', text: value })
const doc = {
  page: { id: 'page-1', width: 800, height: 600 },
  objects: [text('a', 'Hola {{ Nombre }}, {{puesto}}'), { id: 'r', type: 'rectangle' }],
  additionalPages: [{ page: { id: 'page-2', width: 800, height: 600 }, objects: [text('b', '{{nombre}} · {{Área}}')] }],
}

test('detects unique fields across pages', () => {
  assert.deepEqual(designFields(doc), ['Nombre', 'puesto', 'Área'])
})

test('maps headers by normalized name and fills every page', () => {
  const mapping = autoMapping(designFields(doc), ['NOMBRE', 'Area', 'Otro'])
  assert.deepEqual(mapping, { Nombre: 'NOMBRE', puesto: '', 'Área': 'Area' })
  const filled = fillDocument(doc, rowValues({ NOMBRE: 'Ana', Area: 'Ventas' }, mapping))
  assert.equal(filled.objects[0].text, 'Hola Ana, ')
  assert.equal(filled.additionalPages[0].objects[0].text, 'Ana · Ventas')
  assert.equal(doc.objects[0].text, 'Hola {{ Nombre }}, {{puesto}}')
})
