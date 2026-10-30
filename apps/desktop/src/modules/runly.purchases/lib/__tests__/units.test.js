import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ofTotal, pluralUnit, withUnit } from '../units.js'

test('whole words take the plural, abbreviations stay as typed', () => {
  assert.equal(withUnit(15, 'tramo'), '15 tramos')
  assert.equal(withUnit(1, 'tramo'), '1 tramo')
  assert.equal(withUnit(20, 'pza'), '20 pza')
  assert.equal(withUnit(2, 'kg'), '2 kg')
  assert.equal(withUnit(3, 'unidad'), '3 unidades')
  assert.equal(withUnit(2, 'caja'), '2 cajas')
  assert.equal(withUnit(2, 'Pza.'), '2 Pza.')
  assert.equal(pluralUnit('cruz', 2), 'cruces')
  assert.equal(pluralUnit('pieza', 0.5), 'piezas')
  assert.equal(withUnit(4), '4')
  assert.equal(ofTotal(25, 40, 'tramo'), '25 de 40 tramos')
})
