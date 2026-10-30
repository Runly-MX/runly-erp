import test from 'node:test'
import assert from 'node:assert/strict'
import { correctionPlan, validateCorrection } from '../purchase-corrections-rules.js'
import { planReceiptReversal } from '../purchase-receipt-reversals-service.js'

const order = (status, extra = {}) => ({ id: 'o1', status, number: 'OC-1', supplierReference: null, notes: null, expectedDate: null, paymentTerms: '30 días', ...extra })
const invoice = (status, extra = {}) => ({ id: 'i1', status, number: 'A-100', notes: null, dueDate: null, fiscalUuid: 'abc', ...extra })
const fields = plan => plan.fields.map(f => f.field)

test('matriz de órdenes: campos por estado y condición de pagos', () => {
  assert.deepEqual(correctionPlan('orders', order('DRAFT')).fields, [])
  assert.deepEqual(fields(correctionPlan('orders', order('ISSUED'))), ['number', 'supplierReference', 'notes', 'expectedDate', 'paymentTerms'])
  assert.deepEqual(fields(correctionPlan('orders', order('RECEIVED'))), ['number', 'supplierReference', 'notes', 'paymentTerms'])
  assert.deepEqual(fields(correctionPlan('orders', order('ISSUED'), { hasPayments: true })), ['number', 'supplierReference', 'notes', 'expectedDate'])
  assert.deepEqual(fields(correctionPlan('orders', order('CANCELLED'))), ['notes'])
})

test('matriz de facturas: vencimiento solo con saldo, UUID nunca', () => {
  assert.deepEqual(fields(correctionPlan('invoices', invoice('PENDING'))), ['number', 'notes', 'dueDate'])
  assert.deepEqual(fields(correctionPlan('invoices', invoice('PAID'))), ['number', 'notes'])
  assert.deepEqual(fields(correctionPlan('invoices', invoice('CANCELLED'))), ['notes'])
  assert.throws(() => validateCorrection('invoices', invoice('PENDING'), { fiscalUuid: 'x' }), e => e.code === 'FIELD_NOT_CORRECTABLE' && /CFDI/.test(e.message))
  assert.throws(() => validateCorrection('invoices', invoice('PAID'), { total: 1 }), e => e.code === 'FIELD_NOT_CORRECTABLE')
  assert.throws(() => validateCorrection('invoices', invoice('PAID'), { dueDate: '2026-12-01' }), e => e.code === 'FIELD_LOCKED_IN_STATUS')
})

test('validación: cambios reales, folio no vacío, borrador y nada que corregir', () => {
  const ok = validateCorrection('orders', order('ISSUED'), { number: ' OC-1A ', notes: 'Ver anexo', expectedDate: '2026-11-20' })
  assert.deepEqual(ok.number, { before: 'OC-1', after: 'OC-1A', data: 'OC-1A' })
  assert.equal(ok.expectedDate.after, '2026-11-20')
  assert.throws(() => validateCorrection('orders', order('ISSUED'), { number: '  ' }), e => e.code === 'VALIDATION')
  assert.throws(() => validateCorrection('orders', order('ISSUED'), { number: 'OC-1' }), e => e.code === 'NO_CHANGES')
  assert.throws(() => validateCorrection('orders', order('DRAFT'), { notes: 'x' }), e => e.code === 'INVALID_TRANSITION')
  assert.throws(() => validateCorrection('orders', order('ISSUED'), {}), e => e.code === 'VALIDATION')
  assert.throws(() => validateCorrection('orders', order('ISSUED'), { supplierId: 's2' }), e => e.code === 'FIELD_NOT_CORRECTABLE')
})

test('reverso de recepción: total, parcial, excedente y estado de la orden', () => {
  const orderLines = [
    { id: 'l1', quantity: 4, receivedQuantity: 4, itemKind: 'GOODS', description: 'Laptop' },
    { id: 'l2', quantity: 1, receivedQuantity: 0, itemKind: 'SERVICE', description: 'Instalación' },
  ]
  const receiptLines = [{ id: 'r1', orderLineId: 'l1', quantity: 3 }]
  const total = planReceiptReversal({ receiptLines, orderLines })
  assert.deepEqual(total.lines, [{ receiptLineId: 'r1', orderLineId: 'l1', quantity: 3, receivedQuantity: 1 }])
  assert.equal(total.orderStatus, 'PARTIALLY_RECEIVED')
  const partial = planReceiptReversal({ receiptLines, orderLines, requested: [{ receiptLineId: 'r1', quantity: 1 }] })
  assert.deepEqual([partial.lines[0].quantity, partial.orderStatus], [1, 'PARTIALLY_RECEIVED'])
  assert.throws(() => planReceiptReversal({ receiptLines, orderLines, requested: [{ receiptLineId: 'r1', quantity: 4 }] }), e => e.code === 'VALIDATION')
  assert.throws(() => planReceiptReversal({ receiptLines, reversed: new Map([['r1', 3]]), orderLines }), e => e.code === 'NOTHING_TO_REVERSE')
  const all = planReceiptReversal({ receiptLines: [{ id: 'r1', orderLineId: 'l1', quantity: 4 }], orderLines })
  assert.equal(all.orderStatus, 'ISSUED')
  assert.throws(() => planReceiptReversal({ receiptLines, orderLines: [{ ...orderLines[0], receivedQuantity: 2 }] }), e => e.code === 'RECEIPTS_INCONSISTENT')
})
