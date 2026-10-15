import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planPurchaseLinkChanges, requestedPurchaseLinks, withoutPurchaseLinkFields, composeAfterWrite } from '../inventory-purchase-links.js'

const current = { order: { relationId: 'r1', documentId: 'o1' }, invoice: null }

test('requestedPurchaseLinks: undefined is untouched, empty clears', () => {
  assert.deepEqual(requestedPurchaseLinks({ name: 'x' }), {})
  assert.deepEqual(requestedPurchaseLinks({ purchaseOrderId: '', purchaseInvoiceId: 'i1' }), { order: null, invoice: 'i1' })
  assert.deepEqual(withoutPurchaseLinkFields({ name: 'x', purchaseOrderId: 'o1' }), { name: 'x' })
})

test('planPurchaseLinkChanges: same value is a no-op', () => {
  assert.deepEqual(planPurchaseLinkChanges(current, { order: 'o1', invoice: null }), { remove: [], add: [] })
})

test('planPurchaseLinkChanges: changing replaces the displayed link, clearing removes it', () => {
  assert.deepEqual(planPurchaseLinkChanges(current, { order: 'o2' }), { remove: ['r1'], add: [{ kind: 'order', documentId: 'o2' }] })
  assert.deepEqual(planPurchaseLinkChanges(current, { order: null }), { remove: ['r1'], add: [] })
  assert.deepEqual(planPurchaseLinkChanges(current, { invoice: 'i1' }), { remove: [], add: [{ kind: 'invoice', documentId: 'i1' }] })
})

test('composeAfterWrite runs hooks in order and returns null when empty', async () => {
  assert.equal(composeAfterWrite(null, undefined), null)
  const calls = []
  await composeAfterWrite(async () => calls.push('a'), null, async () => calls.push('b'))({}, { id: 1 })
  assert.deepEqual(calls, ['a', 'b'])
})

test('planPurchaseLinkChanges: replacing or clearing removes every link of the kind (legacy duplicates)', () => {
  const dup = { order: { relationId: 'r1', relationIds: ['r1', 'r2'], documentId: 'o1' }, invoice: null }
  assert.deepEqual(planPurchaseLinkChanges(dup, { order: 'o3' }), { remove: ['r1', 'r2'], add: [{ kind: 'order', documentId: 'o3' }] })
  assert.deepEqual(planPurchaseLinkChanges(dup, { order: null }), { remove: ['r1', 'r2'], add: [] })
  assert.deepEqual(planPurchaseLinkChanges(dup, { order: 'o1' }), { remove: ['r2'], add: [] })
})
