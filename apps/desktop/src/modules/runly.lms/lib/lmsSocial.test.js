import test from 'node:test'
import assert from 'node:assert/strict'
import { dismissRatePrompt, formatRating, isRatePromptDismissed, normalizePlayerTab, ratingRows, relativeTime } from './lmsLabels.js'

test('formatRating', () => {
  assert.equal(formatRating(4.5), '4.5')
  assert.equal(formatRating('4.25'), '4.3')
  assert.equal(formatRating(5), '5.0')
  assert.equal(formatRating(null), '')
  assert.equal(formatRating(0), '')
})

test('relativeTime', () => {
  const now = new Date(2026, 9, 16, 12, 0)
  assert.equal(relativeTime(new Date(2026, 9, 16, 11, 59, 40), now), 'ahora')
  assert.equal(relativeTime(new Date(2026, 9, 16, 11, 55), now), 'hace 5 min')
  assert.equal(relativeTime(new Date(2026, 9, 16, 8, 30), now), 'hace 3 h')
  assert.equal(relativeTime(new Date(2026, 9, 15, 22, 0), now), 'ayer')
  assert.equal(relativeTime(new Date(2026, 9, 12, 9, 0), now), '12 oct')
  assert.equal(relativeTime(new Date(2025, 0, 3), now), '3 ene 2025')
  assert.equal(relativeTime(null, now), '')
})

test('ratingRows', () => {
  const rows = ratingRows({ 5: 3, 4: 1 }, 4)
  assert.deepEqual(rows.map((r) => r.stars), [5, 4, 3, 2, 1])
  assert.equal(rows[0].pct, 75)
  assert.equal(rows[4].pct, 0)
  assert.equal(ratingRows(null, 0)[0].pct, 0)
})

test('normalizePlayerTab', () => {
  assert.equal(normalizePlayerTab('preguntas'), 'preguntas')
  assert.equal(normalizePlayerTab('x'), 'descripcion')
  assert.equal(normalizePlayerTab('contenido'), 'descripcion')
  assert.equal(normalizePlayerTab('recursos'), 'recursos')
})

test('rate prompt dismissal survives broken storage', () => {
  const data = {}
  const storage = { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v } }
  assert.equal(isRatePromptDismissed('c1', storage), false)
  dismissRatePrompt('c1', storage)
  assert.equal(isRatePromptDismissed('c1', storage), true)
  const broken = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') } }
  assert.equal(isRatePromptDismissed('c1', broken), false)
  assert.doesNotThrow(() => dismissRatePrompt('c1', broken))
  assert.equal(isRatePromptDismissed('c1', undefined), false)
})
