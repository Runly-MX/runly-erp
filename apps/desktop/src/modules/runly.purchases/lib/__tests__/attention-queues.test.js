import { test } from 'node:test'
import assert from 'node:assert/strict'
import { attentionQueues, deliveryText, dueText, waitingText } from '../attention-queues.js'

const TODAY = '2026-10-30'
const data = {
  metrics: { pendingApprovals: 3, pendingReceipts: 1, overdueInvoices: 1, payableInvoices: 2 },
  attention: {
    approvals: [{ id: 'a1', ownerType: 'PURCHASE_INVOICE', ownerId: 'i9', ownerNumber: 'FAC-9', ownerTotal: 120, reason: 'Supera el monto', createdAt: '2026-10-26T10:00:00Z' }],
    awaitingReceipt: [{ id: 'o1', number: 'OC-1', total: 50, expectedDate: '2026-11-04' }],
    overdueInvoices: [{ id: 'i1', number: 'FAC-1', total: 100, paidAmount: 40, dueDate: '2026-10-25' }],
    payable: [{ id: 'i2', number: 'FAC-2', total: 80, paidAmount: 0, dueDate: null }],
  },
}
const all = () => true

test('every queue for a full-access user, in work order, with server counts', () => {
  const queues = attentionQueues({ has: all, can: all, data, today: TODAY })
  assert.deepEqual(queues.map((q) => [q.key, q.label, q.count]), [['approvals', 'Aprobar', 3], ['receipts', 'Por recibir', 1], ['overdue', 'Vencidas', 1], ['payable', 'Por vencer', 2]])
  const approval = queues[0].rows[0]
  assert.equal(approval.kind, 'invoices'); assert.equal(approval.targetId, 'i9'); assert.equal(approval.when.text, 'Espera 4 días')
  assert.equal(queues[2].rows[0].amount, 60, 'overdue shows the balance, not the face total')
  assert.equal(queues[3].rows[0].when.text, 'Sin vencimiento')
})

test('a queue needs both its capability and the permission to act', () => {
  const noApprove = attentionQueues({ has: all, can: (k) => k !== 'purchases.approval.decide', data, today: TODAY })
  assert.ok(!noApprove.some((q) => q.key === 'approvals'))
  const noPayments = attentionQueues({ has: (c) => c !== 'payments', can: all, data, today: TODAY })
  assert.deepEqual(noPayments.map((q) => q.key), ['approvals', 'receipts', 'overdue'])
  const reader = attentionQueues({ has: all, can: (k) => k === 'purchases.invoice.read', data, today: TODAY })
  assert.deepEqual(reader.map((q) => q.key), ['overdue'])
  const simple = attentionQueues({ has: (c) => c === 'invoices', can: all, data, today: TODAY })
  assert.deepEqual(simple.map((q) => q.key), ['overdue'])
})

test('null counts from the API (no read permission) fall back to the rows shown', () => {
  const queues = attentionQueues({ has: all, can: all, data: { ...data, metrics: {} }, today: TODAY })
  assert.equal(queues.find((q) => q.key === 'approvals').count, 1)
})

test('date wording', () => {
  assert.deepEqual(waitingText('2026-10-30T08:00:00Z', TODAY), { text: 'Desde hoy', tone: 'neutral' })
  assert.deepEqual(waitingText('2026-10-29', TODAY), { text: 'Espera 1 día', tone: 'neutral' })
  assert.deepEqual(dueText('2026-10-29', TODAY), { text: 'Venció hace 1 día', tone: 'danger' })
  assert.deepEqual(dueText('2026-10-30', TODAY), { text: 'Vence hoy', tone: 'warning' })
  assert.deepEqual(dueText('2026-11-20', TODAY), { text: 'Vence en 21 días', tone: 'neutral' })
  assert.deepEqual(deliveryText('2026-10-28', TODAY), { text: 'Entrega atrasada 2 días', tone: 'danger' })
  assert.deepEqual(deliveryText(null, TODAY), { text: 'Sin fecha de entrega', tone: 'neutral' })
})
