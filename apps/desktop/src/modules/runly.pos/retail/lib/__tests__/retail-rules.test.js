import test from 'node:test'
import assert from 'node:assert/strict'
import { activeLines, changePreview, grossPrice, itemCount, orderKey, productInitials, quantitiesByProduct, selectionKey, tenderSuggestions, toMoneyString } from '../retailRules.js'
import { classifyPosError } from '../retailErrors.js'

test('cash preview: owed 100, received 200 → change 100 (applied stays 100)', () => {
  assert.equal(changePreview('100.00', '200.00'), '100.00')
  assert.equal(changePreview('100.00', '100.00'), '0.00')
  assert.equal(changePreview('100.00', '50.00'), null, 'not enough cash has no change')
  assert.equal(changePreview(0.1 + 0.2, 1), '0.70', 'cents, not float noise')
})

test('money strings follow the contract format', () => {
  assert.equal(toMoneyString(100), '100.00')
  assert.equal(toMoneyString('82.5'), '82.50')
  assert.equal(toMoneyString(-1), null)
})

test('quick tender buttons start with the exact amount', () => {
  assert.deepEqual(tenderSuggestions('100.00'), ['100.00', '200.00', '500.00', '1000.00'])
  assert.equal(tenderSuggestions('37.50')[0], '37.50')
  assert.equal(tenderSuggestions('37.50')[1], '40.00')
  assert.deepEqual(tenderSuggestions('0'), [])
})

test('cart counts only active lines', () => {
  const order = { lines: [{ quantity: '2.000', voided: false }, { quantity: '1.000', voided: true }, { quantity: '1.000', voided: false }] }
  assert.equal(activeLines(order).length, 2)
  assert.equal(itemCount(order), 3)
})

test('saved selection and current order are scoped per user, company and terminal', () => {
  assert.notEqual(selectionKey('u1', 'c1'), selectionKey('u1', 'c2'))
  assert.notEqual(selectionKey('u1', 'c1'), selectionKey('u2', 'c1'))
  assert.notEqual(orderKey('c1', 't1'), orderKey('c1', 't2'))
})

test('POS errors map to the states the cashier sees', () => {
  assert.equal(classifyPosError(new TypeError('Failed to fetch')).kind, 'lost')
  assert.equal(classifyPosError({ status: 409, code: 'ORDER_VERSION_CONFLICT', message: 'x' }).kind, 'conflict')
  assert.equal(classifyPosError({ status: 409, code: 'INSUFFICIENT_STOCK' }).kind, 'stock')
  assert.match(classifyPosError({ status: 409, code: 'REFUND_REQUIRED' }).message, /Devuelve/)
  assert.equal(classifyPosError({ status: 409, code: 'INVALID_TRANSITION', message: 'La sesión de caja está cerrada.' }).message, 'La sesión de caja está cerrada.')
  assert.equal(classifyPosError({ status: 403, code: 'FORBIDDEN' }).kind, 'forbidden')
})

test('card counter: units per product across variants, voided lines ignored', () => {
  const order = { lines: [
    { productId: 'p1', variantId: 'v1', quantity: '2.000' },
    { productId: 'p1', variantId: 'v2', quantity: '1' },
    { productId: 'p2', quantity: '3', voided: true },
  ] }
  assert.deepEqual(quantitiesByProduct(order), { p1: 3 })
  assert.deepEqual(quantitiesByProduct(null), {})
})

test('initials skip words that start with a digit', () => {
  assert.equal(productInitials('Huevo 12 piezas'), 'HP')
  assert.equal(productInitials('Coca-Cola 600 ml'), 'CM')
  assert.equal(productInitials('500 g'), 'G')
  assert.equal(productInitials(''), '#')
})

test('tiles and lines show the price the customer pays', () => {
  assert.equal(grossPrice('20.00', '16.0000', false), '23.20')
  assert.equal(grossPrice('20.00', '16.0000', true), '20.00')
  assert.equal(grossPrice('20.00', '0', false), '20.00')
  assert.equal(grossPrice(null, '16', false), null)
})
