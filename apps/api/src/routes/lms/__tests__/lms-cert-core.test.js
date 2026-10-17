import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_CERT_BODY, DEFAULT_CERT_TITLE, certificateHours, formatFolio, formatHours, formatIssueDate, newToken,
  nextSequence, normalizeTemplateInput, renderTemplateText,
} from '../lms-cert-core.js'
import { LmsError } from '../lms-error.js'

test('normalizeTemplateInput: create defaults, required fields and limits', () => {
  const data = normalizeTemplateInput({ name: ' Básica ' })
  assert.equal(data.name, 'Básica')
  assert.equal(data.title, DEFAULT_CERT_TITLE)
  assert.equal(data.body, DEFAULT_CERT_BODY)
  assert.equal(data.showLogo, true)
  assert.equal(data.accentColor, null)
  assert.throws(() => normalizeTemplateInput({}), LmsError)
  assert.throws(() => normalizeTemplateInput({ name: 'A', title: '  ' }), /título/)
  assert.throws(() => normalizeTemplateInput({ name: 'A', body: 'x'.repeat(2001) }), /largo/)
  assert.equal(normalizeTemplateInput({ name: 'A', body: 'x'.repeat(2000) }).body.length, 2000)
})

test('normalizeTemplateInput: hex color, partial updates and ids', () => {
  assert.equal(normalizeTemplateInput({ name: 'A', accentColor: '#1E40AF' }).accentColor, '#1e40af')
  assert.equal(normalizeTemplateInput({ name: 'A', accentColor: '#abc' }).accentColor, '#aabbcc')
  assert.equal(normalizeTemplateInput({ name: 'A', accentColor: '' }).accentColor, null)
  assert.throws(() => normalizeTemplateInput({ name: 'A', accentColor: 'red' }), /color/)
  assert.deepEqual(normalizeTemplateInput({ showLogo: false }, { partial: true }), { showLogo: false })
  assert.deepEqual(normalizeTemplateInput({ enabled: true, signerName: ' Ana ' }, { partial: true }), { enabled: true, signerName: 'Ana' })
  assert.throws(() => normalizeTemplateInput({ name: '' }, { partial: true }), LmsError)
  assert.throws(() => normalizeTemplateInput({ signatureFileId: 'nope' }, { partial: true }), LmsError)
  assert.equal(normalizeTemplateInput({ signatureFileId: null }, { partial: true }).signatureFileId, null)
})

test('renderTemplateText replaces known placeholders and keeps unknown ones', () => {
  const vars = { alumno: 'Ana Pérez', curso: 'Seguridad', fecha: '16 de octubre de 2026', horas: '1.5', folio: '2026-000001', empresa: 'Acme' }
  assert.equal(
    renderTemplateText('{{alumno}} terminó {{ curso }} ({{horas}} h) el {{fecha}}, folio {{folio}}, {{empresa}}. {{otro}}', vars),
    'Ana Pérez terminó Seguridad (1.5 h) el 16 de octubre de 2026, folio 2026-000001, Acme. {{otro}}',
  )
  assert.equal(renderTemplateText('<b>{{alumno}}</b>', { alumno: '<i>x</i>' }), '<b><i>x</i></b>')
  assert.equal(renderTemplateText(null, vars), '')
})

test('folio formatting and next sequence per year', () => {
  assert.equal(formatFolio(2026, 123), '2026-000123')
  assert.equal(nextSequence(null, 2026), 1)
  assert.equal(nextSequence('2026-000123', 2026), 124)
  assert.equal(nextSequence('2025-000999', 2026), 1)
  assert.equal(nextSequence('basura', 2026), 1)
})

test('certificateHours rounds to 0.5 with a 0.5 minimum when there is content', () => {
  assert.equal(certificateHours({ estimatedMinutes: 90 }), 1.5)
  assert.equal(certificateHours({ estimatedMinutes: 100 }), 1.5)
  assert.equal(certificateHours({ estimatedMinutes: 110 }), 2)
  assert.equal(certificateHours({ estimatedMinutes: 5 }), 0.5)
  assert.equal(certificateHours({ estimatedMinutes: null, lessonDurationsSeconds: [1800, 1800, null] }), 1)
  assert.equal(certificateHours({ estimatedMinutes: null, lessonDurationsSeconds: [60] }), 0.5)
  assert.equal(certificateHours({ estimatedMinutes: null, lessonDurationsSeconds: [] }), 0)
  assert.equal(certificateHours({ estimatedMinutes: 0, lessonDurationsSeconds: [] }), 0)
  assert.equal(formatHours(1.5), '1.5')
  assert.equal(formatHours(2), '2')
})

test('newToken is 24 url-safe chars and unique', () => {
  const a = newToken()
  assert.match(a, /^[A-Za-z0-9_-]{24}$/)
  assert.notEqual(a, newToken())
})

test('formatIssueDate uses Spanish month names', () => {
  assert.equal(formatIssueDate(new Date(2026, 9, 16, 12)), '16 de octubre de 2026')
  assert.equal(formatIssueDate(new Date(2027, 0, 1, 12)), '1 de enero de 2027')
})
