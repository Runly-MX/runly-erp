import test from 'node:test'
import assert from 'node:assert/strict'
import { createCompanyMailer, describeMailError } from '../smtp-service.js'

test('describeMailError explains common SMTP failures without secrets', () => {
  const auth = describeMailError(Object.assign(new Error('Invalid login: 535 5.7.8 bad credentials'), { code: 'EAUTH', responseCode: 535, mailSource: 'platform' }))
  assert.match(auth.text, /plataforma/)
  assert.match(auth.text, /usuario o la contraseña/)
  assert.match(auth.text, /EAUTH 535/)
  assert.match(describeMailError({ code: 'ETIMEDOUT', mailSource: 'company' }).text, /no se pudo conectar/)
  assert.match(describeMailError({ code: 'EENVELOPE', responseCode: 553 }).text, /remitente o el destinatario/)
  assert.doesNotMatch(auth.text, /bad credentials/)
})

test('a failed send carries which SMTP was used', async () => {
  const failing = { isConfigured: async () => true, sendEmail: async () => { throw Object.assign(new Error('boom'), { code: 'EAUTH' }) } }
  const mailer = createCompanyMailer({ prisma: null, websiteFactory: () => ({ isConfigured: async () => false }), platformFactory: () => failing })
  await assert.rejects(() => mailer.sendEmail({ companyId: 'c1', to: 'a@example.com' }), (error) => error.mailSource === 'platform')
})

function fakeMailer(configured, sent) {
  return { isConfigured: async () => configured, sendEmail: async (mail) => { sent.push(mail) } }
}

test('company mail uses the company (website or Ajustes) SMTP first', async () => {
  const sent = { company: [], platform: [] }
  const mailer = createCompanyMailer({ prisma: null, websiteFactory: () => fakeMailer(true, sent.company), platformFactory: () => fakeMailer(true, sent.platform) })
  await mailer.sendEmail({ companyId: 'c1', to: 'a@example.com', subject: 's' })
  assert.equal(sent.company.length, 1)
  assert.equal(sent.platform.length, 0)
  assert.equal((await mailer.resolve('c1')).source, 'company')
})

test('falls back to the platform SMTP when the company has none', async () => {
  const sent = { company: [], platform: [] }
  const mailer = createCompanyMailer({ prisma: null, websiteFactory: () => fakeMailer(false, sent.company), platformFactory: () => fakeMailer(true, sent.platform) })
  await mailer.sendEmail({ companyId: 'c1', to: 'a@example.com', subject: 's' })
  assert.equal(sent.platform.length, 1)
  assert.equal(sent.platform[0].companyId, null)
  assert.equal(await mailer.isConfigured('c1'), true)
})

test('reports not configured and throws when nothing is set up', async () => {
  const mailer = createCompanyMailer({ prisma: null, websiteFactory: () => fakeMailer(false, []), platformFactory: () => fakeMailer(false, []) })
  assert.equal(await mailer.isConfigured('c1'), false)
  await assert.rejects(() => mailer.sendEmail({ companyId: 'c1', to: 'a@example.com' }), /no configurado/)
})
