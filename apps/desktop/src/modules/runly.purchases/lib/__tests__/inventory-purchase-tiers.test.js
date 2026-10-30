import { test } from 'node:test'
import assert from 'node:assert/strict'
import { legacyPurchaseData, possibleDuplicates, splitPurchaseDocs } from '../../components/inventory-purchase-tiers.js'

const timeline = [
  { stage: 'CASE', docs: [{ id: 'c1', type: 'purchase_case', status: 'IN_PROGRESS' }] },
  { stage: 'PURCHASE_ORDER', docs: [{ id: 'o1', type: 'purchase_order', number: 'OC-1', status: 'ISSUED', supplierName: 'Aceros del Bajío' }, { id: 'o0', type: 'purchase_order', number: 'OC-0', status: 'CANCELLED' }] },
  { stage: 'INVOICE', docs: [{ id: 'f1', type: 'purchase_invoice', number: 'FAC-1', status: 'PAID' }] },
  { stage: 'PAYMENT', docs: [{ id: 'f1', type: 'purchase_invoice', number: 'FAC-1', status: 'PAID' }] },
]

test('current vs historical documents, each once, in flow order', () => {
  const { current, historical } = splitPurchaseDocs(timeline)
  assert.deepEqual(current.map((d) => d.id), ['c1', 'o1', 'f1'])
  assert.deepEqual(historical.map((d) => d.id), ['o0'])
})

test('inherited data and possible duplicates compared with current documents (nothing removed)', () => {
  const legacy = legacyPurchaseData({ purchaseDate: '2024-03-01T00:00:00Z', purchasePrice: 1200, vendorName: 'Aceros del Bajío', invoiceNumber: 'A-77' })
  assert.deepEqual(legacy.map((l) => l.key), ['purchaseDate', 'purchasePrice', 'vendorName', 'invoiceNumber'])
  const { current } = splitPurchaseDocs(timeline)
  const dups = possibleDuplicates([
    { fieldId: 'x1', field: { label: 'Orden de Compra' }, value: 'OC-1' },
    { fieldId: 'x2', field: { label: 'Factura' }, value: 'A-99' },
    { fieldId: 'x3', field: { label: 'Proveedor original' }, value: 'aceros del bajio' },
    { fieldId: 'x4', field: { label: 'Color' }, value: 'Rojo' },
    { fieldId: 'x5', field: { label: 'Costo' }, value: '1200' },
  ], current, legacy)
  assert.deepEqual(dups.map((d) => [d.label, d.concept, d.matches]), [
    ['Orden de Compra', 'order', true], ['Factura', 'invoice', false], ['Proveedor original', 'supplier', true], ['Costo', 'price', true],
  ])
})
