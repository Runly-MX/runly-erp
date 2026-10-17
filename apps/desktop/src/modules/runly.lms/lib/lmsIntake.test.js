import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  addCustomField, certTagFor, guestAnswerRows, guestsCsv, parseInviteText, presetEnabled, slugifyFieldKey, togglePreset, validateIntakeForm,
} from './lmsIntake.js'

test('field list editing: presets in catalog order, custom keys fixed and unique, max 5', () => {
  let fields = togglePreset([], 'puesto', true)
  fields = togglePreset(fields, 'numero_empleado', true)
  assert.deepEqual(fields.map((f) => f.key), ['numero_empleado', 'puesto'])
  fields = addCustomField(fields, 'Talla').fields
  fields = addCustomField(fields, 'talla').fields
  assert.deepEqual(fields.slice(2).map((f) => f.key), ['talla', 'talla_2'])
  fields = togglePreset(fields, 'puesto', false)
  assert.equal(presetEnabled(fields, 'puesto'), false)
  for (const label of ['a', 'b', 'c']) fields = addCustomField(fields, label).fields
  assert.match(addCustomField(fields, 'f').error, /Máximo 5/)
  assert.equal(slugifyFieldKey('Área técnica'), 'area_tecnica')
  assert.equal(certTagFor('empresa'), 'empresa_alumno')
  assert.equal(certTagFor('talla'), 'campo_talla')
  assert.equal(certTagFor('correo'), null)
})

test('intake form validation mirrors the API and skips the invited email', () => {
  const fields = [
    { key: 'correo', type: 'email', required: true, label: 'Correo' },
    { key: 'telefono', type: 'phone', required: false, label: 'Teléfono' },
    { key: 'edad', type: 'number', required: false, label: 'Edad' },
  ]
  const bad = validateIntakeForm({ name: 'A', answers: { correo: 'x', telefono: '12', edad: 'diez' } }, fields)
  assert.deepEqual(Object.keys(bad.errors).sort(), ['correo', 'edad', 'name', 'telefono'])
  const ok = validateIntakeForm({ name: ' Ana  Ruiz ', answers: { correo: 'A@X.MX', edad: '30' } }, fields)
  assert.deepEqual(ok, { values: { name: 'Ana Ruiz', answers: { correo: 'a@x.mx', edad: '30' } }, errors: {} })
  assert.deepEqual(validateIntakeForm({ name: 'Ana' }, fields, { skip: ['correo'] }).errors, {})
})

test('invite text: one per line, several formats, invalid lines reported', () => {
  const { invites, invalid } = parseInviteText('ana@x.mx\nLeo Ruiz <LEO@x.mx>\nbo@x.mx, Bo Díaz\nMaría; maria@x.mx\nsin correo\nana@x.mx')
  assert.deepEqual(invites, [
    { email: 'ana@x.mx' }, { email: 'leo@x.mx', name: 'Leo Ruiz' }, { email: 'bo@x.mx', name: 'Bo Díaz' }, { email: 'maria@x.mx', name: 'María' },
  ])
  assert.deepEqual(invalid, ['sin correo'])
})

test('guest answers rows and CSV export', () => {
  const fields = [{ key: 'empresa', label: 'Empresa' }, { key: 'talla', label: 'Talla' }]
  assert.deepEqual(guestAnswerRows({ talla: 'M', viejo: 'x' }, fields), [{ key: 'talla', label: 'Talla', value: 'M' }, { key: 'viejo', label: 'viejo', value: 'x' }])
  const csv = guestsCsv([
    { learner: { kind: 'guest', displayName: 'Ana', email: 'a@x.mx', guestProfile: { empresa: '=HACK()', talla: 'M, L' } }, progressPct: 50, status: 'active', startedAt: '2026-10-01T10:00:00Z' },
    { learner: { kind: 'user', displayName: 'Interno' }, progressPct: 100, status: 'completed' },
  ], fields)
  const lines = csv.replace('﻿', '').trim().split('\r\n')
  assert.equal(lines.length, 2)
  assert.equal(lines[0], 'Nombre,Correo,Empresa,Talla,Avance (%),Estado,Inicio,Completado,Folio de certificado')
  assert.equal(lines[1], `Ana,a@x.mx,'=HACK(),"M, L",50,En curso,2026-10-01,,`)
})
