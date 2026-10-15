import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createCompanyDeletionNotifier } from '../company-deletion-notice.js'
import { buildCompanyDeletionEmail } from '../email-templates.js'

const prisma = {
  membership: {
    findMany: async () => [
      { user: { email: 'A@example.test' } }, { user: { email: 'a@example.test' } },
      { user: { email: 'b@example.test' } }, { user: { email: '' } },
    ],
  },
}

test('notice goes once to each distinct member and falls back to instance SMTP', async () => {
  const sent = []
  const createSmtp = ({ companyId }) => ({
    sendEmail: async mail => {
      if (companyId) throw new Error('SMTP no configurado')
      sent.push(mail.to)
    },
  })
  const result = await createCompanyDeletionNotifier({ prisma, createSmtp }).notify({
    companyId: 'c1', companyName: 'Acme', purgeAfter: new Date('2030-01-01T12:00:00Z'), requestedByName: 'Admin',
  })
  assert.deepEqual(result, { sent: 2, failed: 0 })
  assert.deepEqual(sent, ['a@example.test', 'b@example.test'])
})

test('notice failures are counted and never thrown', async () => {
  const createSmtp = () => ({ sendEmail: async () => { throw new Error('down') } })
  const result = await createCompanyDeletionNotifier({ prisma, createSmtp }).notify({ companyId: 'c1', companyName: 'Acme' })
  assert.deepEqual(result, { sent: 0, failed: 2 })
})

test('deletion email escapes the company name', () => {
  const mail = buildCompanyDeletionEmail({ companyName: '<b>X</b>', purgeAfter: '2030-01-01T12:00:00Z' })
  assert.equal(mail.html.includes('<b>X</b>'), false)
  assert.match(mail.subject, /será eliminada/)
})
