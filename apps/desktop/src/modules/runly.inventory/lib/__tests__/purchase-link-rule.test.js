import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planPurchaseLinkRule } from '../purchase-links.js'

const order = { id: 'o1', number: 'OC-1' }

test('invoice with an order fills the order field', () => {
  assert.deepEqual(planPurchaseLinkRule({ invoice: { id: 'i1', order }, orderId: '' }), { type: 'fill-order', order })
  assert.deepEqual(planPurchaseLinkRule({ invoice: { id: 'i1', order }, orderId: 'o2' }), { type: 'fill-order', order })
  assert.deepEqual(planPurchaseLinkRule({ invoice: { id: 'i1', order }, orderId: 'o1' }), { type: 'none' })
})

test('unrelated order and invoice ask to relate; unknown or missing never act', () => {
  assert.deepEqual(planPurchaseLinkRule({ invoice: { id: 'i1', order: null }, orderId: 'o1' }), { type: 'ask-relate' })
  assert.deepEqual(planPurchaseLinkRule({ invoice: { id: 'i1', order: null }, orderId: '' }), { type: 'none' })
  assert.deepEqual(planPurchaseLinkRule({ invoice: { id: 'i1' }, orderId: 'o1' }), { type: 'none' })
  assert.deepEqual(planPurchaseLinkRule({ invoice: null, orderId: 'o1' }), { type: 'none' })
})
