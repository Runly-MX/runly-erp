import { test } from 'node:test'
import assert from 'node:assert/strict'
import { projectStatus, taskStage, projectDescription, eventDescription } from '../migrate-projects.mjs'

test('project status: completed/cancelled/disabled map, anything else is active', () => {
  assert.equal(projectStatus({ status: 'COMPLETADO' }), 'COMPLETED')
  assert.equal(projectStatus({ status: 'cancelado' }), 'ARCHIVED')
  assert.equal(projectStatus({ status: 'EN_PROGRESO', enabled: false }), 'ARCHIVED')
  assert.equal(projectStatus({ status: 'LO_QUE_SEA' }), 'ACTIVE')
})

test('task stage: cancelled lands in done, unknown in todo', () => {
  assert.equal(taskStage('PENDIENTE'), 'todo')
  assert.equal(taskStage('EN_PROGRESO'), 'doing')
  assert.equal(taskStage('COMPLETADO'), 'done')
  assert.equal(taskStage('CANCELADO'), 'done')
  assert.equal(taskStage(null), 'todo')
})

test('descriptions keep the sinabe facts', () => {
  const text = projectDescription({ description: 'Alcance', code: 'P-1', provider: 'Acme', budgetTotal: 1000 })
  assert.match(text, /Alcance/); assert.match(text, /Código: P-1/); assert.match(text, /Proveedor: Acme/); assert.match(text, /Presupuesto/)
  assert.equal(projectDescription({}), null)
  const ev = eventDescription({ type: 'MAINTENANCE', status: 'COMPLETED', provider: 'Acme', completedDate: new Date('2025-03-02T18:00:00Z') }, 'America/Mexico_City')
  assert.match(ev, /Mantenimiento/); assert.match(ev, /Completado: 2025-03-02/)
})

import { noteFor } from '../migrate-purchases.mjs'

test('purchase notes: drop the text when it only repeats the code', () => {
  assert.equal(noteFor('FAC-2024-001', 'FAC-2024-001'), null)
  assert.equal(noteFor('  fac-2024-001 ', 'FAC-2024-001'), null)
  assert.equal(noteFor('Laptops sala 2', 'FAC-2024-001'), 'Laptops sala 2')
  assert.equal(noteFor(null, 'PO-1'), null)
})
