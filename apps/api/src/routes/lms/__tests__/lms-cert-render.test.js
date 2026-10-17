import { test } from 'node:test'
import assert from 'node:assert/strict'
import PizZip from 'pizzip'
import { createLmsCertService } from '../lms-cert-service.js'
import { createLmsRouter } from '../lms-routes.js'
import { buildSampleCertificateDocx } from '../lms-cert-docx.js'

const docxTemplate = { id: 't1', companyId: 'company-1', name: 'Word', source: 'docx', fileAssetId: 'f1', placeholders: ['alumno', 'curso', 'folio', '%qr', 'instructor'], signerName: 'Luis', showLogo: true }
const cert = (extra = {}) => ({ id: 'c1', companyId: 'company-1', enrollmentId: 'e1', courseId: 'k1', templateId: 't1', folio: '2026-000001', token: 'a'.repeat(24), learnerName: 'Ana', courseTitle: 'Seguridad', hours: 2, issuedAt: new Date('2026-10-16T12:00:00Z'), revokedAt: null, ...extra })

function setup({ convertPdf, row = cert() }) {
  const converted = []
  const prisma = {
    lmsCertificate: { findFirst: async () => row },
    lmsCertificateTemplate: { findUnique: async () => docxTemplate },
    company: { findUnique: async () => ({ name: 'Acme', brandingConfig: null }) },
  }
  const files = { findAsset: async () => ({ id: 'f1', originalName: 'cert.docx' }), read: async () => buildSampleCertificateDocx() }
  const service = createLmsCertService({
    prisma, files, appBaseUrl: () => 'https://app.example.com',
    convertPdf: async (buffer, name) => { converted.push({ buffer, name }); return convertPdf(buffer) },
  })
  return { service, converted }
}

const isPdfkit = (buffer) => buffer.subarray(0, 4).toString() === '%PDF' && /\/Type \/Page\b/.test(buffer.toString('latin1'))

test('docx template: filled file goes to Office and its PDF is returned', async () => {
  const { service, converted } = setup({ convertPdf: async () => Buffer.from('%PDF-from-office') })
  const { buffer, filename } = await service.managerPdf('company-1', 'c1')
  assert.equal(buffer.toString(), '%PDF-from-office')
  assert.equal(filename, 'certificado-2026-000001.pdf')
  assert.equal(converted[0].name, 'certificado-2026-000001.docx')
  const xml = new PizZip(converted[0].buffer).file('word/document.xml').asText()
  assert.match(xml, /Ana/)
  assert.match(xml, /Luis/)
  assert.doesNotMatch(xml.replace(/<[^>]+>/g, ''), /\{\{/)
  assert.match(xml, /<pic:pic/) // QR image placed
})

test('docx template falls back to the built-in design when Office is not available', async () => {
  const { service, converted } = setup({ convertPdf: async () => null })
  const { buffer } = await service.managerPdf('company-1', 'c1')
  assert.equal(converted.length, 1)
  assert.ok(isPdfkit(buffer))
})

test('revoked certificates always use the built-in design (REVOCADO stamp)', async () => {
  const { service, converted } = setup({ convertPdf: async () => Buffer.from('%PDF-from-office'), row: cert({ revokedAt: new Date() }) })
  const { buffer } = await service.managerPdf('company-1', 'c1')
  assert.equal(converted.length, 0)
  assert.ok(isPdfkit(buffer))
})

test('routes: list exposes officeAvailable and the sample is a .docx', async () => {
  const requirePermission = () => async (c, next) => { c.set('companyId', 'company-1'); await next() }
  const certService = { listTemplates: async () => [], officeAvailable: () => false }
  const app = createLmsRouter({ requirePermission, service: {}, learnService: {}, media: {}, evalServices: { quiz: {}, review: {}, assignment: {} }, socialService: {}, certService })
  const list = await (await app.request('http://localhost/lms/certificate-templates')).json()
  assert.equal(list.officeAvailable, false)
  assert.ok(list.placeholders.images.includes('qr'))
  const sample = await app.request('http://localhost/lms/certificate-templates/sample.docx')
  assert.equal(sample.status, 200)
  assert.match(sample.headers.get('content-disposition'), /\.docx/)
  assert.equal(Buffer.from(await sample.arrayBuffer()).subarray(0, 2).toString(), 'PK')
})
