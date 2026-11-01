import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyCommerceError, createAttemptTracker, newAttemptKey } from '../commerceCommand.js'
import {
  combinationExists, detectFieldConflicts, findIdentifierDuplicates, missingCombinations, parseTaxRate, parseWholeQuantity, slugify,
} from '../catalogRules.js'

test('attempt keys satisfy the contract and survive a retry of the same body', () => {
  const key = newAttemptKey('cat-alloc')
  assert.match(key, /^[\x21-\x7e]{16,128}$/)
  const tracker = createAttemptTracker('cat-alloc')
  const body = { outletId: 'a', quantity: 3, reason: 'x' }
  const first = tracker.keyFor(body)
  assert.equal(tracker.keyFor({ reason: 'x', quantity: 3, outletId: 'a' }), first, 'key order does not matter')
  assert.notEqual(tracker.keyFor({ ...body, quantity: 4 }), first, 'an edited form is a new attempt')
  tracker.reset()
  assert.notEqual(tracker.keyFor(body), first, 'a confirmed attempt is never reused')
})

test('errors map to the state the UI shows', () => {
  assert.equal(classifyCommerceError(new TypeError('Failed to fetch')).kind, 'lost')
  assert.equal(classifyCommerceError({ status: 503 }).retrySameKey, true)
  assert.equal(classifyCommerceError({ status: 403, code: 'FORBIDDEN', message: 'x' }).kind, 'forbidden')
  assert.equal(classifyCommerceError({ status: 409, code: 'INSUFFICIENT_STOCK' }).kind, 'stock')
  assert.equal(classifyCommerceError({ status: 409, code: 'IDEMPOTENCY_CONFLICT' }).kind, 'conflict')
  assert.equal(classifyCommerceError({ status: 409, code: 'CONFIGURATION_REQUIRED' }).kind, 'config')
  assert.equal(classifyCommerceError({ status: 400, code: 'VALIDATION_ERROR', message: 'Cantidad fuera de rango.' }).message, 'Cantidad fuera de rango.')
  assert.equal(classifyCommerceError({ status: 400, message: 'Too small: expected number' }).message, 'Revisa los datos e inténtalo de nuevo.')
  assert.equal(classifyCommerceError({ status: 404, message: 'Not found' }).message, 'El registro ya no existe o fue eliminado.')
})

test('missing combinations never repeat an existing variant', () => {
  const options = [{ name: 'Talla', values: [{ value: 'S' }, { value: 'M' }] }, { name: 'Color', values: [{ value: 'Rojo' }] }]
  const variants = [{ option_values: { Talla: 'S', Color: 'Rojo' } }]
  assert.deepEqual(missingCombinations(options, variants), [{ Talla: 'M', Color: 'Rojo' }])
  assert.deepEqual(missingCombinations([{ name: 'Talla', values: [] }], []), [])
  assert.equal(combinationExists({ Color: 'Rojo', Talla: 'S' }, variants, ['Talla', 'Color']), true)
})

test('duplicate codes: SKU ignores case, barcode keeps leading zeros', () => {
  const rows = [
    { id: 'a', label: 'Chica', sku: 'CAFE-s', barcode: '000123' },
    { id: 'b', label: 'Grande', sku: 'cafe-S', barcode: '123' },
  ]
  const dup = findIdentifierDuplicates({ sku: null, barcode: '123' }, rows)
  assert.deepEqual(dup.a, { sku: 'Grande' })
  assert.deepEqual(dup.b, { sku: 'Chica', barcode: 'el producto' })
})

test('field conflicts only when someone else changed a field we are writing', () => {
  const base = { name: 'Café', price: 10 }
  assert.deepEqual(detectFieldConflicts(base, { name: 'Café', price: 12 }, { name: 'Té' }, ['name']), [])
  assert.deepEqual(detectFieldConflicts(base, { name: 'Café negro', price: 10 }, { name: 'Té' }, ['name']), ['name'])
  assert.deepEqual(detectFieldConflicts(base, { name: 'Té' }, { name: 'Té' }, ['name']), [], 'same final value is not a conflict')
})

test('input parsing follows the contract formats', () => {
  assert.equal(slugify('Café Americano 12 oz'), 'cafe-americano-12-oz')
  assert.equal(parseWholeQuantity('5'), 5)
  assert.equal(parseWholeQuantity('0'), null)
  assert.equal(parseWholeQuantity('2.5'), null)
  assert.equal(parseTaxRate('16'), '16')
  assert.equal(parseTaxRate('8,5'), '8.5')
  assert.equal(parseTaxRate('101'), null)
  assert.equal(parseTaxRate('1.23456'), null)
})
