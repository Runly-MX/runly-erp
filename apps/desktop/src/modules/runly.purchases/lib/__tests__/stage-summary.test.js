import { test } from 'node:test'
import assert from 'node:assert/strict'
import { columnsBreakpoint, stageSummary } from '../stage-summary.js'

const map = (...states) => states.map((state, i) => ({ type: `S${i}`, label: `Etapa${i}`, state }))

test('current or blocked stage names its position', () => {
  assert.deepEqual(stageSummary(map('skipped', 'done', 'current', 'pending')), { text: 'Etapa 3 de 4: Etapa2', tone: 'current' })
  assert.deepEqual(stageSummary(map('done', 'blocked', 'pending')), { text: 'Etapa 2 de 3: Etapa1 · bloqueada', tone: 'blocked' })
})

test('pending stages without a current one are never read as complete', () => {
  assert.deepEqual(stageSummary(map('done', 'skipped', 'pending', 'pending')), { text: 'Etapa 3 de 4: Etapa2 · pendiente', tone: 'pending' })
  assert.equal(stageSummary(map('pending', 'pending')).tone, 'pending')
})

test('complete only when the last stage (close) is done; skipped ones are counted apart', () => {
  assert.deepEqual(stageSummary(map('skipped', 'done', 'done')), { text: 'Proceso completo · 2 de 3 etapas completadas, 1 no aplica', tone: 'done' })
  assert.deepEqual(stageSummary(map('done', 'done')), { text: 'Proceso completo · 2 de 2 etapas completadas', tone: 'done' })
})

test('done and skipped without a closed last stage means stopped, not complete', () => {
  assert.deepEqual(stageSummary(map('done', 'skipped', 'skipped')), { text: 'Proceso detenido · 1 de 3 etapas completadas, 2 no aplican', tone: 'skipped' })
  assert.equal(stageSummary(map('skipped', 'skipped')).text, 'Proceso detenido · 0 de 2 etapas completadas, 2 no aplican')
})

test('columns appear later as the flow grows', () => {
  assert.deepEqual([3, 5, 6, 7, 8].map(columnsBreakpoint), ['sm', 'sm', 'md', 'lg', 'lg'])
})
