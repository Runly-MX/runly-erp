import test from 'node:test'
import assert from 'node:assert/strict'
import { inWindow, shelvesFor } from './curated-shelves.js'

const pool = [
  ...['Cena de fin de año', 'Carta a los Reyes Magos', 'Invitación para partir la rosca', 'Posada vecinal'].map((text, i) => ({ key: `n${i}`, text })),
  ...['Invitación de boda', 'Fiesta de cumpleaños', 'Carta de agradecimiento'].map((text, i) => ({ key: `f${i}`, text })),
]

test('windows wrap over the new year', () => {
  assert.equal(inWindow([[11, 1], [1, 10]], new Date(2026, 10, 10)), true)
  assert.equal(inWindow([[11, 1], [1, 10]], new Date(2027, 0, 5)), true)
  assert.equal(inWindow([[11, 1], [1, 10]], new Date(2027, 2, 5)), false)
})

test('the seasonal shelf leads in season and an item sits on one shelf only', () => {
  const shelves = shelvesFor(pool, { date: new Date(2026, 10, 10) })
  assert.equal(shelves[0].id, 'navidad')
  const keys = shelves.flatMap(shelf => shelf.entries.map(entry => entry.key))
  assert.equal(new Set(keys).size, keys.length)
  assert.ok(shelves.some(shelf => shelf.id === 'festividades'))
})

test('out of season only the evergreen shelves remain', () => {
  assert.ok(shelvesFor(pool, { date: new Date(2026, 5, 10) }).every(shelf => !shelf.seasonal))
})
