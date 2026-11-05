import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matchesSearch } from '../lib/search-text.js'

test('search ignores accents and case, every word must match', () => {
  assert.equal(matchesSearch('Teléfono CISCO', 'telefono'), true)
  assert.equal(matchesSearch('Telefono', 'TELÉFONO'), true)
  assert.equal(matchesSearch(['Multímetro', null, 'Fluke'], 'multimetro fluke'), true)
  assert.equal(matchesSearch('Multímetro', 'multimetro dell'), false)
  assert.equal(matchesSearch('Cualquier cosa', '  '), true)
})
