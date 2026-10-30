import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getDocumentActions } from '../document-actions.js'
import { resolveScreen } from '../../../../app/module-screen-resolver.js'

const all = () => true
const caps = (on) => (key) => on.includes(key)

test('issued order offers receive and invoice only when those capabilities are on', () => {
  const doc = { id: 'o1', status: 'ISSUED' }
  const keys = getDocumentActions('orders', doc, { has: caps(['receipts', 'invoices']), can: all }).map((a) => a.key)
  assert.ok(keys.includes('receive') && keys.includes('invoice'))
  const bare = getDocumentActions('orders', doc, { has: caps([]), can: all }).map((a) => a.key)
  assert.ok(!bare.includes('receive') && !bare.includes('invoice'))
})

test('pay needs the payments capability and permission', () => {
  const doc = { id: 'f1', status: 'PENDING' }
  assert.ok(getDocumentActions('invoices', doc, { has: caps(['payments']), can: all }).some((a) => a.key === 'pay'))
  assert.ok(!getDocumentActions('invoices', doc, { has: caps(['payments']), can: (k) => k !== 'purchases.payment.manage' }).some((a) => a.key === 'pay'))
})

test('resolver maps every purchases path to its screen', () => {
  const map = Object.fromEntries(['/purchases', '/purchases/list', '/purchases/new', '/purchases/:id', '/purchases/approvals', '/purchases/suppliers', '/purchases/suppliers/:id', '/purchases/settings']
    .map((k) => [`runly.purchases:${k}`, k]))
  const r = (p) => resolveScreen(map, 'runly.purchases', p, null)
  assert.equal(r('/'), '/purchases')
  assert.equal(r('/purchases/payments'), '/purchases/list')
  assert.equal(r('/purchases/orders/new'), '/purchases/new')
  assert.equal(r('/purchases/invoices/abc/edit'), '/purchases/new')
  assert.equal(r('/purchases/cases/abc'), '/purchases/:id')
  assert.equal(r('/purchases/receipts/abc'), '/purchases/:id')
  assert.equal(r('/purchases/suppliers/abc'), '/purchases/suppliers/:id')
})

test('a document whose capability is off offers no action (read-only history)', () => {
  assert.deepEqual(getDocumentActions('orders', { id: 'o1', status: 'DRAFT', capabilityEnabled: false }, { has: all, can: all }), [])
})

test('closing an order with goods still pending is a reasoned close short', () => {
  const doc = { id: 'o1', status: 'PARTIALLY_RECEIVED', receipt: { pendingLines: [{ id: 'l1', pending: 1 }] } }
  const close = getDocumentActions('orders', doc, { has: caps(['receipts']), can: all }).find((a) => a.key === 'close')
  assert.equal(close.label, 'Cerrar con faltantes')
  assert.deepEqual([close.confirm.commentRequired, close.confirm.payload], [true, { closeShort: true }])
  const plain = getDocumentActions('orders', doc, { has: caps([]), can: all }).find((a) => a.key === 'close')
  assert.equal(plain.label, 'Cerrar orden')
})

test('correct data needs the API plan and the correct permission; receipt reversal needs its permission', () => {
  const order = { id: 'o1', status: 'CLOSED', correction: { fields: [{ field: 'number' }] } }
  assert.ok(getDocumentActions('orders', order, { has: all, can: all }).some((a) => a.key === 'correct'))
  assert.ok(!getDocumentActions('orders', order, { has: all, can: (k) => k !== 'purchases.order.correct' }).some((a) => a.key === 'correct'))
  assert.ok(!getDocumentActions('orders', { ...order, correction: { fields: [] } }, { has: all, can: all }).some((a) => a.key === 'correct'))
  const receipt = { id: 'r1', status: 'COMPLETED', reversal: { available: true, fullyReversed: false } }
  assert.ok(getDocumentActions('receipts', receipt, { has: all, can: all }).some((a) => a.key === 'reverseReceipt'))
  assert.ok(!getDocumentActions('receipts', { ...receipt, reversal: { available: true, fullyReversed: true } }, { has: all, can: all }).some((a) => a.key === 'reverseReceipt'))
  assert.ok(!getDocumentActions('receipts', receipt, { has: all, can: (k) => k !== 'purchases.receipt.reverse' }).some((a) => a.key === 'reverseReceipt'))
})

test('an approver without edit permission decides through the approval, an editor through the transition', () => {
  const doc = { id: 'o2', status: 'PENDING_APPROVAL' }
  const approverOnly = getDocumentActions('orders', doc, { has: caps(['approvals']), can: (k) => k === 'purchases.approval.decide' })
  assert.deepEqual(approverOnly.map((a) => [a.key, a.via]), [['approve', 'approval'], ['reject', 'approval']])
  const editor = getDocumentActions('invoices', doc, { has: caps(['approvals']), can: all }).filter((a) => ['approve', 'reject'].includes(a.key))
  assert.ok(editor.length === 2 && editor.every((a) => !a.via))
})

test('pay blocked by the API policy evaluation is offered disabled, never hidden; missing permission still hides it', () => {
  const doc = { id: 'f9', status: 'PENDING', policyCheck: { action: 'pay', blocked: true, reasons: ['Las compras de bienes requieren recepción'] } }
  const pay = getDocumentActions('invoices', doc, { has: caps(['payments']), can: all }).find((a) => a.key === 'pay')
  assert.equal(pay.disabled, true); assert.match(pay.disabledReason, /requieren recepción/)
  const unblocked = getDocumentActions('invoices', { ...doc, policyCheck: { action: 'pay', blocked: false, reasons: [] } }, { has: caps(['payments']), can: all }).find((a) => a.key === 'pay')
  assert.ok(unblocked && !unblocked.disabled)
  assert.ok(!getDocumentActions('invoices', doc, { has: caps(['payments']), can: (k) => k !== 'purchases.payment.manage' }).some((a) => a.key === 'pay'))
})

test('case close follows the API closure check: disabled with reasons until ready', () => {
  const open = { id: 'c1', status: 'IN_PROGRESS', closure: { ready: false, openDocuments: [{ reason: 'Orden OC-1 sigue abierta' }], blockers: [] } }
  const close = getDocumentActions('cases', open, { has: all, can: all }).find((a) => a.key === 'close')
  assert.equal(close.disabled, true); assert.match(close.disabledReason, /OC-1 sigue abierta/)
  const ready = getDocumentActions('cases', { ...open, closure: { ready: true, openDocuments: [], blockers: [] } }, { has: all, can: all }).find((a) => a.key === 'close')
  assert.ok(!ready.disabled)
})
