import test from 'node:test'
import assert from 'node:assert/strict'
import { approvalText, createPurchaseApprovalChatService } from '../purchase-approval-chat-service.js'
import { buildActions } from '../../routes/chat/chat-integrations-service.js'

test('the card text names the document, case, total and reason', () => {
  const text = approvalText({ approval: { ownerType: 'PURCHASE_ORDER', reason: 'Supera el límite' }, purchaseCase: { number: 'C-12', title: 'Laptops', estimatedTotal: 25000, currency: 'MXN' } })
  assert.equal(text, 'Orden de compra C-12: Laptops\nTotal estimado: 25,000 MXN\nMotivo: Supera el límite')
  assert.equal(approvalText({ approval: { ownerType: 'X' }, purchaseCase: null }), 'Documento de compra')
})

test('a purchase approval id gives decision buttons with the purchases decisions', () => {
  const id = '01a17493-5775-724e-8166-d18392675a09'
  assert.deepEqual(buildActions({ purchaseApprovalId: id }).map((a) => [a.id, a.kind, a.decision]), [['approve', 'purchase_approval', 'APPROVED'], ['reject', 'purchase_approval', 'REJECTED']])
  assert.deepEqual(buildActions({ purchaseApprovalId: 'x', buttons: [] }), [])
})

test('the channel is checked before it is saved, and clearing it removes the setting', async () => {
  const saved = []
  const prisma = {
    runlyModule: { findFirst: async () => ({ id: 'm1' }) },
    companyModule: { findFirst: async () => ({ id: 'cm1', enabled: true, config: { approvalChannel: 'viejo', other: 1 } }), update: async ({ data }) => saved.push(data.config) },
  }
  const chat = { resolveChannel: async (companyId, name) => { if (name === 'nope') { const e = new Error('No encontré el canal "nope".'); e.status = 404; throw e } return { id: 'c1' } } }
  const service = createPurchaseApprovalChatService({ prisma, chat })
  await assert.rejects(() => service.setChannel('co', 'nope'), (e) => e.status === 400 && /No encontré/.test(e.message))
  assert.deepEqual(await service.setChannel('co', ' aprobaciones '), { channel: 'aprobaciones' })
  assert.deepEqual(await service.setChannel('co', ''), { channel: null })
  assert.deepEqual(saved, [{ approvalChannel: 'aprobaciones', other: 1 }, { other: 1 }])
})
