import test from 'node:test'
import assert from 'node:assert/strict'
import { formHeaderModel } from '../form-header.js'

test('crear: migas Inventario > Nuevo activo', () => {
  const m = formHeaderModel({ isEdit: false })
  assert.equal(m.title, 'Nuevo activo')
  assert.deepEqual(m.crumbs.map((c) => c.label), ['Inventario', 'Nuevo activo'])
})

test('editar: nombre y serie en subtítulo, miga con enlace al detalle', () => {
  const m = formHeaderModel({ isEdit: true, id: 'x1', item: { name: 'Laptop', serialNumber: 'SN1', assetTag: null } })
  assert.equal(m.title, 'Editar activo')
  assert.equal(m.subtitle, 'Laptop · Serie SN1')
  assert.equal(m.crumbs[1].to, '/app/m/runly.inventory/inventory/x1')
  assert.equal(m.crumbs[2].label, 'Editar')
})
