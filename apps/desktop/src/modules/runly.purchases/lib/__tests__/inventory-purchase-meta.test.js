import test from 'node:test'
import assert from 'node:assert/strict'
import { hasStageDocs } from '../../components/InventoryPurchaseMeta.js'

test('hasStageDocs detecta si el activo ya tiene orden o factura', () => {
  const stages = [{ docs: [{ type: 'purchase_order' }] }, { docs: [] }]
  assert.equal(hasStageDocs(stages, 'purchase_order'), true)
  assert.equal(hasStageDocs(stages, 'purchase_invoice'), false)
  assert.equal(hasStageDocs(undefined, 'purchase_order'), false)
})
