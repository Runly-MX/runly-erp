import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nextStep } from '../next-step.js'

const TODAY = '2026-10-30'
const acts = (...keys) => keys.map((key) => ({ key }))

test('order waiting for goods names what is missing, with the unit, and offers the receipt only when allowed', () => {
  const doc = {
    status: 'PARTIALLY_RECEIVED', lines: [{ id: 'l2', unit: 'tramo' }],
    receipt: { state: 'PARTIAL', pendingLines: [{ id: 'l2', description: 'Ángulo', pending: 15 }] },
  }
  const can = nextStep('orders', doc, acts('receive', 'close'), { today: TODAY })
  assert.equal(can.title, 'Recibir 15 tramo de Ángulo'); assert.equal(can.cta, 'receive'); assert.match(can.detail, /Cerrar con faltantes/)
  const cannot = nextStep('orders', doc, acts(), { today: TODAY })
  assert.equal(cannot.tone, 'waiting'); assert.equal(cannot.cta, null)
})

test('order: approval, policy block before issuing, invoices and closing', () => {
  const pending = { status: 'PENDING_APPROVAL', approvals: [{ status: 'PENDING', reason: 'Más de 50,000', createdAt: '2026-10-27T10:00:00Z' }] }
  assert.deepEqual([nextStep('orders', pending, acts('approve', 'reject'), { today: TODAY })].map((s) => [s.cta, s.secondary, s.detail]),
    [['approve', 'reject', 'Más de 50,000. Espera desde hace 3 días.']])
  assert.equal(nextStep('orders', pending, acts(), { today: TODAY }).tone, 'waiting')
  const blocked = nextStep('orders', { status: 'APPROVED', policyCheck: { action: 'issue', blocked: true, reasons: ['Faltan 3 cotizaciones'] } }, acts('issue'), { today: TODAY })
  assert.equal(blocked.tone, 'blocked'); assert.deepEqual(blocked.items, ['Faltan 3 cotizaciones']); assert.equal(blocked.cta, null)
  const services = { status: 'ISSUED', receipt: { state: 'NOT_APPLICABLE' }, invoices: [] }
  assert.equal(nextStep('orders', services, acts('invoice'), { today: TODAY }).cta, 'invoice')
  const billed = { status: 'RECEIVED', receipt: { state: 'COMPLETE' }, invoices: [{ id: 'f1', number: 'FAC-1', status: 'PENDING' }, { id: 'f2', number: 'FAC-2', status: 'CANCELLED' }] }
  const waitingPay = nextStep('orders', billed, acts('close'), { today: TODAY })
  assert.equal(waitingPay.title, 'Factura pendiente de pago'); assert.deepEqual(waitingPay.links.map((l) => l.label), ['FAC-1'])
  const paid = { ...billed, invoices: [{ id: 'f1', status: 'PAID' }] }
  assert.equal(nextStep('orders', paid, acts('close'), { today: TODAY }).cta, 'close')
})

test('invoice: payment with due date, overdue urgency, policy block, paid', () => {
  const open = { status: 'PARTIALLY_PAID', total: 12180, paidAmount: 7000, balance: 5180, currency: 'MXN', dueDate: '2026-11-02' }
  const s = nextStep('invoices', open, acts('pay'), { today: TODAY })
  assert.equal(s.title, 'Pagar $5,180.00 antes del 02 nov 2026'); assert.equal(s.tone, 'action'); assert.equal(s.cta, 'pay')
  assert.equal(nextStep('invoices', { ...open, dueDate: '2026-10-25' }, acts('pay'), { today: TODAY }).tone, 'urgent')
  assert.equal(nextStep('invoices', open, acts(), { today: TODAY }).cta, null)
  assert.equal(nextStep('invoices', { ...open, policyCheck: { action: 'pay', blocked: true, reasons: ['Falta la recepción'] } }, acts('pay'), { today: TODAY }).tone, 'blocked')
  assert.equal(nextStep('invoices', { status: 'PAID', paidAt: '2026-10-28' }, acts(), { today: TODAY }).title, 'Pagada por completo')
})

test('cancelled and read-only documents never offer a step', () => {
  assert.equal(nextStep('orders', { status: 'CANCELLED' }, acts('receive')).tone, 'info')
  const ro = nextStep('invoices', { status: 'PENDING', capabilityEnabled: false }, acts('pay'))
  assert.equal(ro.title, 'Solo lectura'); assert.equal(ro.cta, null)
})
