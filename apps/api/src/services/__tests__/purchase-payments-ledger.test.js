import test from 'node:test'
import assert from 'node:assert/strict'
import { centsToDecimal, toCents } from '../purchase-money.js'
import { cacheFieldsFrom, reconcileInvoice, statusForPaid } from '../purchase-payments-ledger.js'
import { dateKey } from '../purchases-shared.js'

test('dinero exacto: centavos enteros, sin aritmética de flotantes', () => {
  assert.equal(toCents('0.1') + toCents('0.2'), toCents('0.3'))
  assert.equal(toCents(1234.5), 123450)
  assert.equal(toCents({ toFixed: () => '99.99' }), 9999)
  assert.equal(toCents('-12.30'), -1230)
  assert.equal(centsToDecimal(123450), '1234.50')
  assert.equal(centsToDecimal(-5), '-0.05')
  assert.throws(() => toCents('1.234'), error => error.code === 'VALIDATION')
  assert.throws(() => toCents('abc'), error => error.code === 'VALIDATION')
  assert.throws(() => toCents(''), error => error.code === 'VALIDATION')
  assert.throws(() => toCents('1000000000000.00'), error => error.code === 'VALIDATION')
})

test('estado de la factura según lo pagado', () => {
  assert.equal(statusForPaid(10000, 0), 'PENDING')
  assert.equal(statusForPaid(10000, 1), 'PARTIALLY_PAID')
  assert.equal(statusForPaid(10000, 10000), 'PAID')
})

test('campos de la factura tras un reverso: los del último pago vigente o el histórico registrado', () => {
  const p1 = { id: 'p1', kind: 'PAYMENT', paidAt: new Date('2026-10-01'), recordedAt: '2026-10-01T10:00:00Z', method: 'CASH', reference: 'A' }
  const p2 = { id: 'p2', kind: 'PAYMENT', paidAt: new Date('2026-10-05'), recordedAt: '2026-10-05T10:00:00Z', method: 'TRANSFER', reference: 'B' }
  assert.deepEqual(cacheFieldsFrom([p1, p2]), { paidAt: p2.paidAt, paymentReference: 'B', paymentMethod: 'TRANSFER' })
  const r2 = { id: 'r2', kind: 'REVERSAL', reversesId: 'p2' }
  assert.deepEqual(cacheFieldsFrom([p1, p2, r2]), { paidAt: p1.paidAt, paymentReference: 'A', paymentMethod: 'CASH' })
  const opening = { id: 'o', kind: 'OPENING', metadata: { legacySnapshot: { paidAt: '2026-01-15', paymentReference: 'LEG', paymentMethod: null } } }
  const fromLegacy = cacheFieldsFrom([opening, p1, { id: 'r1', kind: 'REVERSAL', reversesId: 'p1' }])
  assert.equal(fromLegacy.paymentReference, 'LEG')
  assert.equal(dateKey(fromLegacy.paidAt), '2026-01-15')
  assert.deepEqual(cacheFieldsFrom([p1, { id: 'r1', kind: 'REVERSAL', reversesId: 'p1' }]), { paidAt: null, paymentReference: null, paymentMethod: null })
})

test('conciliación: clasifica y reporta excepciones sin corregir nada', () => {
  const inv = (status, total, paidAmount) => ({ status, total, paidAmount })
  assert.equal(reconcileInvoice(inv('PENDING', '100.00', '0')).classification, 'NO_PAYMENTS')
  const legacy = reconcileInvoice(inv('PARTIALLY_PAID', '100.00', '40.00'))
  assert.deepEqual([legacy.classification, legacy.backfillCents, legacy.issues], ['LEGACY_UNRECORDED', 4000, []])
  assert.equal(reconcileInvoice(inv('PAID', '100.00', '100.00'), [{ amount: '60.00' }, { amount: '40.00' }]).classification, 'RECORDED')
  assert.equal(reconcileInvoice(inv('PAID', '100.00', '100.00'), [{ amount: '60.00' }]).classification, 'LEDGER_MISMATCH')
  const bad = reconcileInvoice(inv('PAID', '100.00', '70.00'))
  assert.deepEqual([bad.classification, bad.issues, bad.backfillCents], ['LEGACY_UNRECORDED', ['PAID_STATUS_BELOW_TOTAL'], 0])
  assert.deepEqual(reconcileInvoice(inv('CANCELLED', '100.00', '10.00')).issues, ['CANCELLED_WITH_PAYMENT'])
  assert.deepEqual(reconcileInvoice(inv('PARTIALLY_PAID', '100.00', '150.00')).issues, ['PAID_EXCEEDS_TOTAL', 'PARTIAL_STATUS_MISMATCH'])
})
