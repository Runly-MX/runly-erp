import test from 'node:test'
import assert from 'node:assert/strict'
import { validateGeometry } from '../../../../../shared/studio/vector.js'
import { validateDocument } from '../../../../../shared/studio/document.js'
import { code128Symbols, codeGeometry, codeObject } from './studio-codes.js'
import { designFields, fillDocument } from './studio-bulk.js'

test('Code 128 B symbols carry start, checksum and stop', () => {
  // "RUNLY": R=50 U=53 N=46 L=44 Y=57; (104+50+106+138+176+285) % 103 = 35
  assert.deepEqual(code128Symbols('RUNLY'), [104, 50, 53, 46, 44, 57, 35, 106])
})

test('QR and barcode geometry passes the vector contract', () => {
  for (const [kind, value] of [['qr', 'https://app.example.com/app/p/inv/' + 'x'.repeat(200)], ['code128', 'A-000123-LAPTOP']]) {
    const geometry = codeGeometry(kind, value)
    assert.deepEqual(validateGeometry(geometry), geometry)
  }
  assert.throws(() => codeGeometry('code128', 'x'.repeat(61)), /hasta 60/)
})

test('code fields are listed and regenerated per row', () => {
  const object = { id: 'q', type: 'vector', x: 0, y: 0, rotation: 0, ...codeObject('qr', '{{Enlace público}}') }
  const doc = validateDocument({ schemaVersion: 7, unit: 'px', page: { id: 'page-1', width: 600, height: 300, background: '#ffffff' }, objects: [object] })
  assert.deepEqual(designFields(doc), ['Enlace público'])
  const filled = fillDocument(doc, { 'enlace publico': 'https://app.example.com/app/p/inv/abc' })
  assert.equal(filled.objects[0].code.value, 'https://app.example.com/app/p/inv/abc')
  assert.notDeepEqual(filled.objects[0].geometry, doc.objects[0].geometry)
})
