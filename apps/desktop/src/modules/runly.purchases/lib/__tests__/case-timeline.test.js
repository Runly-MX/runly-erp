import { test } from 'node:test'
import assert from 'node:assert/strict'
import { caseTimeline, receiptMovements } from '../case-timeline.js'

test('case timeline: every document and event, newest first, linked to its document', () => {
  const events = caseTimeline({
    id: 'c1', status: 'CLOSED', createdAt: '2026-10-15T09:00:00Z', closedAt: '2026-10-30T10:00:00Z', title: 'Acero línea 2',
    requests: [{ id: 'r1', number: 'SOL-81', createdAt: '2026-10-15T10:00:00Z' }],
    approvals: [{ id: 'a1', ownerType: 'PURCHASE_ORDER', ownerId: 'o1', status: 'APPROVED', createdAt: '2026-10-18T10:00:00Z', decidedAt: '2026-10-19T10:00:00Z', reason: 'Más de 50,000' }],
    orders: [{ id: 'o1', number: 'OC-205', createdAt: '2026-10-17T10:00:00Z', issuedAt: '2026-10-20T10:00:00Z', total: 100, currency: 'MXN' }],
    receipts: [{ id: 'rc1', number: 'REC-44', orderId: 'o1', receivedAt: '2026-10-25' }],
    invoices: [{ id: 'f1', number: 'FAC-1', createdAt: '2026-10-26T10:00:00Z', total: 100, currency: 'MXN' }],
    payments: [{ id: 'p1', invoiceId: 'f1', kind: 'PAYMENT', amount: 100, currency: 'MXN', recordedAt: '2026-10-28T10:00:00Z' },
      { id: 'p2', invoiceId: 'f1', kind: 'REVERSAL', amount: -100, currency: 'MXN', recordedAt: '2026-10-29T10:00:00Z', reason: 'Duplicado' }],
  })
  assert.deepEqual(events.map((e) => e.title), [
    'Expediente cerrado', 'Reverso de pago $100.00 · FAC-1', 'Pago $100.00 · FAC-1', 'Factura FAC-1 registrada', 'Recepción REC-44',
    'Orden OC-205 emitida', 'Aprobación concedida para la orden OC-205', 'Aprobación solicitada para la orden OC-205', 'Orden OC-205 creada', 'Solicitud SOL-81', 'Expediente abierto',
  ])
  assert.deepEqual([events[1].kind, events[1].docId, events[1].tone, events[1].detail], ['invoices', 'f1', 'warning', 'Motivo: Duplicado'])
})

test('cancelled case and documents missing (no permission) simply do not appear', () => {
  const events = caseTimeline({ id: 'c2', status: 'CANCELLED', createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-02T00:00:00Z' })
  assert.deepEqual(events.map((e) => [e.title, e.tone]), [['Expediente cancelado', 'danger'], ['Expediente abierto', 'neutral']])
})

test('order movements: receipts and reversals with plural units', () => {
  const events = receiptMovements({
    lines: [{ id: 'l1', description: 'Ángulo', unit: 'tramo' }],
    receipts: [{ id: 'r1', number: 'REC-1', receivedAt: '2026-10-20', lines: [{ orderLineId: 'l1', quantity: 10 }] }],
    receiptReversals: [{ id: 'v1', receiptId: 'r1', createdAt: '2026-10-21T10:00:00Z', reason: 'Material equivocado', lines: [{ orderLineId: 'l1', quantity: 10 }] }],
  })
  assert.deepEqual(events.map((e) => [e.title, e.detail]), [
    ['Reverso de REC-1', 'Motivo: Material equivocado · Ángulo: 10 tramos'],
    ['Recepción REC-1', 'Ángulo: 10 tramos'],
  ])
})
