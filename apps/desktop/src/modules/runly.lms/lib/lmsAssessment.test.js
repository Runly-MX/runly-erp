import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  activityFormToPayload, activityToForm, activityTypeLabel, assessmentFormToPayload, assessmentToForm, formatPoints, formatTimeLimit,
  isoToLocalInput, localInputToIso, moveActivity, validateActivityForm, validateAssessmentForm,
} from './lmsAssessment.js'

test('activity type label follows what the activity accepts', () => {
  assert.equal(activityTypeLabel({ kind: 'quiz' }), 'Cuestionario')
  assert.equal(activityTypeLabel({ kind: 'assignment', settings: { allowText: true, allowFiles: false } }), 'Respuesta escrita')
  assert.equal(activityTypeLabel({ kind: 'assignment', settings: { allowText: false, allowFiles: true } }), 'Entrega de archivos')
  assert.equal(activityTypeLabel({ kind: 'assignment', settings: { allowText: true, allowFiles: true } }), 'Actividad práctica')
})

test('points and time labels', () => {
  assert.equal(formatPoints(200), '200 puntos')
  assert.equal(formatPoints(1), '1 punto')
  assert.equal(formatPoints(null), 'Variable')
  assert.equal(formatTimeLimit(null), 'Sin límite')
  assert.equal(formatTimeLimit(60), '1 h')
  assert.equal(formatTimeLimit(90), '1 h 30 min')
})

test('local datetime input round-trips through ISO', () => {
  const local = '2026-12-01T09:30'
  assert.equal(isoToLocalInput(localInputToIso(local)), local)
  assert.equal(localInputToIso(''), null)
  assert.equal(isoToLocalInput(null), '')
})

test('assessment form: limited time, validation and payload', () => {
  const form = assessmentToForm({ title: 'PVR', settings: { timeLimitMinutes: 60, maxSessions: 1 } })
  assert.equal(form.limited, true)
  assert.deepEqual(validateAssessmentForm(form), {})
  assert.equal(assessmentFormToPayload(form).settings.timeLimitMinutes, 60)
  assert.equal(assessmentFormToPayload({ ...form, limited: false }).settings.timeLimitMinutes, null)
  const bad = validateAssessmentForm({ ...form, title: ' ', timeLimitMinutes: '0', maxSessions: '30', opensAt: '2026-12-02T10:00', closesAt: '2026-12-01T10:00' })
  assert.deepEqual(Object.keys(bad).sort(), ['closesAt', 'maxSessions', 'timeLimitMinutes', 'title'])
})

test('activity form: assignment points and files, quiz never reveals answers', () => {
  const task = activityToForm({ kind: 'assignment', title: 'Excel', body: 'Resuelve', settings: { allowText: false, allowFiles: true, maxFiles: 2, maxPoints: 100 } })
  assert.deepEqual(validateActivityForm(task), {})
  assert.deepEqual(activityFormToPayload(task).settings, { allowText: false, allowFiles: true, maxFiles: 2, maxPoints: 100, acceptedTypes: null, maxFileMb: 50 })
  assert.deepEqual(activityFormToPayload({ ...task, acceptedTypes: ['xlsx', 'pptx'], maxFileMb: '20' }).settings.acceptedTypes, ['xlsx', 'pptx'])
  assert.ok(validateActivityForm({ ...task, maxFileMb: '80' }).maxFileMb)
  assert.ok(validateActivityForm({ ...task, allowFiles: false }).allowText)
  assert.ok(validateActivityForm({ ...task, maxPoints: '0' }).maxPoints)
  const quiz = activityToForm({ kind: 'quiz', title: 'Q', settings: {} })
  assert.equal(activityFormToPayload(quiz).settings.showAnswers, 'never')
})

test('moveActivity swaps neighbours and ignores out of range', () => {
  assert.deepEqual(moveActivity(['a', 'b', 'c'], 'b', -1), ['b', 'a', 'c'])
  assert.deepEqual(moveActivity(['a', 'b'], 'a', -1), ['a', 'b'])
})
