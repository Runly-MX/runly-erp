import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EMPTY_SERVICE, blockedMinutes, sameForm, serviceToPayload, validateService } from './serviceForm.js'

test('appointments need a resource, sessions do not (engine rule)', () => {
  const base = { ...EMPTY_SERVICE, name: 'Consulta' }
  assert.ok(validateService(base).resources)
  assert.equal(validateService({ ...base, resourceIds: ['r1'] }).resources, undefined)
  assert.deepEqual(validateService({ ...base, kind: 'session' }), {})
})

test('party range and payload by mode', () => {
  const form = { ...EMPTY_SERVICE, name: ' Yoga ', kind: 'session', minParty: '3', maxParty: '2' }
  assert.equal(validateService(form).maxParty, 'No puede ser menor al mínimo.')
  const created = serviceToPayload({ ...form, maxParty: '4' }, { editing: false })
  assert.equal(created.name, 'Yoga')
  assert.equal(created.kind, 'session')
  assert.equal(created.capacity, 10)
  assert.equal('enabled' in created, false)
  const edited = serviceToPayload({ ...EMPTY_SERVICE, name: 'x' }, { editing: true })
  assert.equal('kind' in edited, false)
  assert.equal('capacity' in edited, false)
})

test('blocked minutes and dirty check ignore resource order', () => {
  assert.equal(blockedMinutes({ durationMinutes: '60', bufferBeforeMinutes: '10', bufferAfterMinutes: '' }), 70)
  assert.ok(sameForm({ ...EMPTY_SERVICE, resourceIds: ['a', 'b'] }, { ...EMPTY_SERVICE, resourceIds: ['b', 'a'] }))
  assert.equal(sameForm(EMPTY_SERVICE, { ...EMPTY_SERVICE, name: 'x' }), false)
})
