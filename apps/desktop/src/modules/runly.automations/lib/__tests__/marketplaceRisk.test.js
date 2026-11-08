import test from 'node:test'
import assert from 'node:assert/strict'
import { consentFor, pendingLabel, riskSections, stepSummary } from '../marketplaceRisk.js'

const report = {
  trigger: 'webhook', services: ['runly.notifications:notifications.send'], httpHosts: ['api.externo.example'],
  errors: [], needsConfiguration: [{ code: 'AUTOMATION_ARG_REQUIRED', path: 'automations[0].steps[0].args.userIds', message: 'x' }],
  notes: [{ code: 'webhook_url_on_activation', message: 'La URL se crea al activarla.' }],
  removed: { people: 2, externalEmails: 1, chatChannels: 0, fileIds: 0, contactIds: 0, templateIds: 0, recordIds: 0 },
  fileRisk: { externalEmailCount: 1, hasChatChannels: false, hasAttachments: true, hasApprovals: true },
}

test('risk sections come from the server report only', () => {
  const risk = riskSections(report)
  assert.equal(risk.services[0].label, 'Enviar notificaciones')
  assert.deepEqual(risk.httpHosts, ['api.externo.example'])
  assert.deepEqual(risk.removed.map((r) => r.text), ['2 personas', '1 correo externo'])
  assert.deepEqual(risk.flags, ['Usa archivos adjuntos', 'Pide aprobaciones a personas'])
  assert.deepEqual(risk.pending, ['Bloque 1: falta elegir destinatarios'])
  assert.equal(risk.blocked, false)
  assert.equal(riskSections({ ...report, errors: [{ code: 'AUTOMATION_HTTP_HOST_NOT_ALLOWED', message: 'no' }] }).blocked, true)
  assert.equal(pendingLabel({ path: 'trigger' }), 'Un bloque: falta completar datos')
})

test('the step summary never shows literal values, URL paths or bodies', () => {
  const secret = 'sk_live_SECRET_TOKEN_123'
  const definition = { steps: [
    { service: 'runly.notifications:notifications.send', args: { title: { from: 'template', template: secret } } },
    { type: 'http', method: 'POST', url: `https://api.externo.example/hook?token=${secret}`, body: { auth: { from: 'value', value: secret } } },
  ] }
  const text = JSON.stringify(stepSummary(definition))
  assert.ok(!text.includes(secret)); assert.ok(!text.includes('/hook'))
  assert.deepEqual(stepSummary(definition).map((s) => s.text), ['Bloque 1: Enviar notificaciones', 'Bloque 2: llamar a api.externo.example'])
})

test('consent is exactly the prepared digest and service list', () => {
  const prepared = { definitionDigest: 'a'.repeat(64), services: ['s1', 's2'], report }
  const consent = consentFor(prepared)
  assert.deepEqual(consent, { definitionDigest: 'a'.repeat(64), services: ['s1', 's2'], acceptRisks: true })
  assert.notEqual(consent.services, prepared.services)
})
