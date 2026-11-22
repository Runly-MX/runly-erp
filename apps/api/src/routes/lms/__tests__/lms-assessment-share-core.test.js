import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  availability, consentRecord, noticeVersion, normalizeAssessmentShareInput, normalizeAssessmentShareSettings, registrationBlocker,
} from '../lms-assessment-share-core.js'

test('defaults: open link, one registration per email, email required, no consent', () => {
  const s = normalizeAssessmentShareSettings(null)
  assert.equal(s.accessMode, 'open')
  assert.equal(s.dedupeByEmail, true)
  assert.deepEqual(s.intakeFields.map((f) => [f.key, f.required]), [['correo', true]])
  assert.deepEqual(s.consent, { required: false, noticeText: '', version: null })
})

test('dedupe forces a required email; without dedupe the email follows the configuration', () => {
  const on = normalizeAssessmentShareInput({ intakeFields: [{ key: 'telefono', required: true }, { key: 'ciudad' }] }).settings
  assert.deepEqual(on.intakeFields.map((f) => [f.key, f.required]), [['correo', true], ['telefono', true], ['ciudad', false]])
  const off = normalizeAssessmentShareInput({ dedupeByEmail: false, intakeFields: [{ key: 'ciudad', required: true }] }).settings
  assert.deepEqual(off.intakeFields.map((f) => f.key), ['ciudad'])
})

test('up to 10 custom fields on evaluations', () => {
  const custom = Array.from({ length: 10 }, (_, i) => ({ label: `Campo ${i + 1}` }))
  assert.equal(normalizeAssessmentShareInput({ intakeFields: custom }).settings.intakeFields.length, 11)
  assert.throws(() => normalizeAssessmentShareInput({ intakeFields: [...custom, { label: 'Once' }] }), /Máximo 10|Demasiados/)
})

test('consent: required needs a notice; the accepted version is the notice hash with a timestamp', () => {
  assert.throws(() => normalizeAssessmentShareInput({ consent: { required: true, noticeText: '  ' } }), /aviso/)
  const settings = normalizeAssessmentShareSettings(normalizeAssessmentShareInput({ consent: { required: true, noticeText: 'Usamos tus datos para esta evaluación.' } }).settings)
  assert.equal(settings.consent.version, noticeVersion('Usamos tus datos para esta evaluación.'))
  assert.throws(() => consentRecord(settings, {}, new Date()), (e) => e.code === 'CONSENT_REQUIRED')
  assert.throws(() => consentRecord(settings, { consent: { accepted: true, version: 'old' } }, new Date()), (e) => e.code === 'CONSENT_CHANGED')
  const record = consentRecord(settings, { consent: { accepted: true, version: settings.consent.version } }, new Date('2026-12-01T10:00:00Z'))
  assert.deepEqual(record, { version: settings.consent.version, acceptedAt: '2026-12-01T10:00:00.000Z', text: 'Usamos tus datos para esta evaluación.' })
  assert.equal(consentRecord(normalizeAssessmentShareSettings({}), {}, new Date()), null, 'no notice, nothing stored')
})

test('registration window: upcoming and closed refuse, open accepts', () => {
  const s = { opensAt: '2026-12-01T15:00:00.000Z', closesAt: '2026-12-02T15:00:00.000Z' }
  assert.equal(availability(s, new Date('2026-12-01T14:59:00Z')), 'upcoming')
  assert.equal(registrationBlocker(s, new Date('2026-12-01T14:59:00Z')).code, 'NOT_OPEN')
  assert.equal(registrationBlocker(s, new Date('2026-12-01T15:00:00Z')), null)
  assert.equal(registrationBlocker(s, new Date('2026-12-02T15:00:01Z')).code, 'CLOSED')
  assert.equal(availability({}, new Date()), 'open')
})
