import test from 'node:test'
import assert from 'node:assert/strict'
import { buildReportFile, createCommunicationHandlers } from '../communication-services.js'

class ServiceError extends Error {
  constructor(message, status = 400, code = 'x') { super(message); this.status = status; this.code = code }
}

test('CSV reports escape quotes, keep accents and neutralise formulas', async () => {
  const file = await buildReportFile({
    source: 'contacts', format: 'csv', name: 'Clientes: "mayo"',
    rows: [{ name: 'Ana, "la jefa"', type: 'customer', email: '=HYPERLINK("x")', phone: null }],
  })
  const text = file.content.toString('utf8')
  assert.equal(file.name, 'Clientes mayo.csv')
  assert.ok(text.startsWith('﻿Nombre,Tipo,Correo,Teléfono\r\n'))
  assert.ok(text.includes('"Ana, ""la jefa""",Cliente,"\'=HYPERLINK(""x"")",'))
})

test('Excel reports produce a workbook with the header row', async () => {
  const file = await buildReportFile({ source: 'items', format: 'xlsx', rows: [{ name: 'Taladro', assetTag: 'A-1', status: 'available' }] })
  assert.equal(file.mimeType, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  assert.equal(file.content.subarray(0, 2).toString(), 'PK')
})

test('report.generate stores the file for the company and returns its id', async () => {
  const uploads = []
  const handlers = createCommunicationHandlers({
    prisma: {}, ServiceError,
    filesService: { uploadForCompany: async (input) => { uploads.push(input); return { id: 'f1', originalName: input.file.name, mimeType: input.file.type, sizeBytes: input.file.size } } },
    searchHandlers: { 'runly.contacts:contacts.search': async (_ctx, args) => ({ items: [{ name: 'Ana', type: 'person' }], total: args.limit }) },
  })
  const result = await handlers['runly.files:report.generate']({ companyId: 'c1', moduleKey: 'system.automations' }, { source: 'contacts', format: 'csv' })
  assert.equal(result.id, 'f1')
  assert.equal(uploads[0].companyId, 'c1')
  assert.equal(uploads[0].fields.shareWithCompany, true)
})

test('email.send reaches company members and the external address, with the attachment', async () => {
  const sent = []
  const handlers = createCommunicationHandlers({
    prisma: { userProfile: { findMany: async () => [{ email: 'Ana@Example.com' }, { email: null }] } }, ServiceError,
    mailer: { sendEmail: async (mail) => { sent.push(mail) } },
    filesService: { readForCompany: async () => ({ name: 'r.csv', mimeType: 'text/csv', content: Buffer.from('a') }) },
    searchHandlers: {},
  })
  const result = await handlers['runly.notifications:email.send']({ companyId: 'c1' }, { userIds: ['u1'], to: 'otro@example.com', subject: 'Hola', body: '<b>x</b>', fileId: 'f1' })
  assert.deepEqual(result, { sent: 2, failed: 0 })
  assert.deepEqual(sent.map((mail) => mail.to).sort(), ['ana@example.com', 'otro@example.com'])
  assert.equal(sent[0].attachments[0].filename, 'r.csv')
  assert.ok(sent[0].html.includes('&lt;b&gt;x&lt;/b&gt;'))
})

test('email.send explains missing recipients and total delivery failures', async () => {
  const failing = createCommunicationHandlers({ prisma: { userProfile: { findMany: async () => [] } }, ServiceError, mailer: { sendEmail: async () => { throw new Error('SMTP no configurado') } }, searchHandlers: {} })
  await assert.rejects(failing['runly.notifications:email.send']({ companyId: 'c1' }, { userIds: ['u1'], subject: 'a', body: 'b' }), /destinatario/)
  await assert.rejects(failing['runly.notifications:email.send']({ companyId: 'c1' }, { to: 'a@b.com', subject: 'a', body: 'b' }), /SMTP no configurado/)
})
