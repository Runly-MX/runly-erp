import test from 'node:test'
import assert from 'node:assert/strict'
import { describeRecord } from './studio-records.js'

test('inventory leads with asset number and serial, then name, brand and model', () => {
  const row = { 'Número de activo': 'A-1', 'Número de serie': 'SN9', Nombre: 'Laptop', Marca: 'HP', Modelo: 'ProBook', Ubicación: 'Bodega' }
  assert.deepEqual(describeRecord('inventory', row), { title: 'A-1 · SN9', detail: 'Laptop · HP · ProBook', extra: 'Bodega' })
  assert.equal(describeRecord('inventory', { Nombre: 'Mesa' }).title, 'Mesa')
})

test('unknown sources fall back to the first columns', () => {
  assert.deepEqual(describeRecord('x', { a: '1', b: '2', c: '' }), { title: '1', detail: '2', extra: '' })
})
