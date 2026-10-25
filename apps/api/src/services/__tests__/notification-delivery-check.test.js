import test from 'node:test'
import assert from 'node:assert/strict'
import { explainDeliveryError, createDeliveryCheckService, DeliveryCheckError } from '../notification-delivery-check-service.js'

test('technical errors become plain Spanish with what to do', () => {
  assert.match(explainDeliveryError('email', 'Invalid login: 535 5.7.8 Authentication failed'), /usuario o la contraseña/)
  assert.match(explainDeliveryError('email', 'connect ECONNREFUSED 127.0.0.1:587'), /No se pudo conectar/)
  assert.match(explainDeliveryError('email', 'SMTP no configurado (empresa, sitio web ni plataforma)'), /administrador debe registrar/)
  assert.match(explainDeliveryError('web_push', 'Received unexpected response code (HTTP 410)', 410), /ya no está registrado/)
  assert.match(explainDeliveryError('web_push', 'x', 403), /rechazó las claves/)
  assert.match(explainDeliveryError('fcm', 'FCM no configurado en el servidor.'), /no están configuradas/)
  assert.match(explainDeliveryError('email', 'algo raro'), /^No se pudo entregar: algo raro/)
})

function fakes({ subs = [], tokens = [], pushResult = { ok: true }, mailError = null } = {}) {
  const calls = { mail: [], disabled: [] }
  const prisma = {
    userProfile: { findUnique: async () => ({ email: 'ana@example.com' }) },
    pushSubscription: { findMany: async () => subs, update: async ({ where }) => calls.disabled.push(where.id) },
    fcmDeviceToken: { findMany: async () => tokens, update: async () => {} },
    notificationDelivery: {
      groupBy: async () => [{ channel: 'email', status: 'sent', _count: { _all: 4 } }, { channel: 'email', status: 'failed', _count: { _all: 1 } }],
      findMany: async () => [{ channel: 'email', lastError: 'ECONNREFUSED', attempts: 3, createdAt: new Date(), notification: { eventType: 'chat.message.new', title: 'Hola' } }],
    },
  }
  const mailer = { sendEmail: async (m) => { if (mailError) throw new Error(mailError); calls.mail.push(m) }, isConfigured: async () => true, resolve: async () => ({ source: 'platform' }) }
  const webPush = { sendToSubscription: async () => pushResult, getVapidConfig: async () => ({ configured: true }) }
  const fcm = { sendToToken: async () => ({ ok: false, error: 'FCM no configurado en el servidor.' }) }
  return { prisma, mailer, webPush, fcm, calls }
}

test('email test sends to the person and reports failures explained', async () => {
  const ok = fakes()
  const done = await createDeliveryCheckService(ok).test({ companyId: 'c', profileId: 'p', channel: 'email' })
  assert.equal(done.ok, true)
  assert.equal(ok.calls.mail[0].to, 'ana@example.com')
  const bad = fakes({ mailError: 'connect ECONNREFUSED' })
  assert.match((await createDeliveryCheckService(bad).test({ companyId: 'c', profileId: 'p', channel: 'email' })).detail, /No se pudo conectar/)
})

test('push tests say when there are no devices and disable dead subscriptions', async () => {
  const none = await createDeliveryCheckService(fakes()).test({ companyId: 'c', profileId: 'p', channel: 'web_push' })
  assert.equal(none.ok, false)
  assert.match(none.detail, /no tiene navegadores/)
  const dead = fakes({ subs: [{ id: 's1', endpoint: 'https://push.example/x', p256dh: 'a', auth: 'b' }], pushResult: { ok: false, statusCode: 410, permanentFailure: true, error: 'gone (HTTP 410)' } })
  const result = await createDeliveryCheckService(dead).test({ companyId: 'c', profileId: 'p', channel: 'web_push' })
  assert.equal(result.ok, false)
  assert.deepEqual(dead.calls.disabled, ['s1'])
  const phone = await createDeliveryCheckService(fakes({ tokens: [{ id: 't', token: 'tok' }] })).test({ companyId: 'c', profileId: 'p', channel: 'fcm' })
  assert.match(phone.detail, /no están configuradas/)
})

test('an unknown channel is refused and health summarises counts and failures', async () => {
  const service = createDeliveryCheckService(fakes())
  await assert.rejects(() => service.test({ companyId: 'c', profileId: 'p', channel: 'sms' }), DeliveryCheckError)
  const health = await service.health({ companyId: 'c' })
  assert.deepEqual(health.channels[0], { channel: 'email', label: 'Correo', sent: 4, failed: 1, queued: 0 })
  assert.match(health.failures[0].explanation, /No se pudo conectar/)
  assert.equal(health.configured.email, true)
  assert.equal(JSON.stringify(health).includes('ECONNREFUSED'), false)
})
