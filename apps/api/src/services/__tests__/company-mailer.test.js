import test from 'node:test'
import assert from 'node:assert/strict'
import { createCompanyMailer } from '../smtp-service.js'

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
