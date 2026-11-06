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

test('letter sheet grid places 50 x 25 mm labels in 3 columns', async () => {
  const { sheetGrid } = await import('./studio-bulk.js')
  const grid = sheetGrid({ width: 50, height: 25 })
  assert.deepEqual([grid.columns, grid.rows], [3, 9])
  assert.deepEqual(grid.cell(28), { page: 1, x: 63, y: 10 })
  assert.equal(sheetGrid({ width: 300, height: 25 }), null)
})

test('an image with a photo field takes the row photo, or keeps the placeholder', () => {
  const photo = { id: 'p', type: 'image', fileAssetId: '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b', imageField: 'Foto' }
  const page = { page: { id: 'page-1' }, objects: [photo] }
  assert.deepEqual(designFields(page), ['Foto'])
  assert.equal(fillDocument(page, { foto: '0190A1B2-C3D4-7E5F-8A9B-0C1D2E3F4A5C' }).objects[0].fileAssetId, '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c')
  assert.equal(fillDocument(page, { foto: '' }).objects[0].fileAssetId, photo.fileAssetId)
})
