// runly.lms certificates on the Documents hub: kind contract, link-row sync and
// certificate rendering through hub.engine for Word and PDF sources.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import PizZip from 'pizzip'
import { PDFDocument } from 'pdf-lib'
import { createDocumentEngine } from '../../documents/document-engine.js'
import { createDocumentFileTemplateService } from '../../documents/document-file-template-service.js'
import { createKindRegistry } from '../../documents/kinds/kind-registry.js'
import { LMS_CERTIFICATE_KIND, LMS_CERTIFICATE_SCHEMA, createLmsCertificateDocumentKind } from '../../documents/kinds/lms-certificate-kind.js'
import { createFakeFiles, createFakePrisma, fileOf, table } from '../../documents/__tests__/fake-documents-db.js'
import { createLmsCertService } from '../lms-cert-service.js'
import { CERT_DOCX_IMAGE_TAGS, CERT_DOCX_SCALAR_TAGS, buildSampleCertificateDocx } from '../lms-cert-docx.js'
import { buildMinimalDocx, paragraph } from '../../../services/document-templates/minimal-docx.js'

const COMPANY = '01900000-0000-7000-8000-0000000000c1'
const cert = (extra = {}) => ({
  id: 'c1', companyId: COMPANY, enrollmentId: null, courseId: 'k1', templateId: null, folio: '2026-000001', token: 'a'.repeat(24),
  learnerName: 'Ana', courseTitle: 'Seguridad', hours: 2, issuedAt: new Date('2026-10-16T12:00:00Z'), revokedAt: null, ...extra,
})

function setup({ convert = async () => Buffer.from('%PDF-from-office') } = {}) {
  const prisma = createFakePrisma()
  prisma.lmsCertificateTemplate = table({ enabled: true, source: 'design', placeholders: [], layout: {}, documentTemplateId: null, showLogo: true })
  prisma.lmsCertificateTemplate.findUnique = async ({ where }) => prisma.lmsCertificateTemplate.rows.find((r) => r.id === where.id) ?? null
  prisma.lmsCourse = { count: async () => 0, groupBy: async () => [], findUnique: async () => ({ createdById: null }) }
  prisma.lmsCertificate = { findFirst: async () => prisma.certRow }
  prisma.company = { findUnique: async () => ({ name: 'Acme', brandingConfig: null }) }
  const files = createFakeFiles(prisma)
  const kinds = createKindRegistry()
  kinds.register(createLmsCertificateDocumentKind({ prisma }))
  const converted = []
  const engine = createDocumentEngine({ prisma, files, kinds, convert: async (buffer, name) => { converted.push({ buffer, name }); return convert(buffer) } })
  const fileTemplates = createDocumentFileTemplateService({ prisma, files, kinds })
  const hub = { kinds, files, fileTemplates, engine }
  const service = createLmsCertService({ prisma, hub, files: { findAsset: async () => null, read: async () => null }, appBaseUrl: () => 'https://app.example.com' })
  return { prisma, hub, service, converted }
}

async function uploadDocx(hub, buffer = buildSampleCertificateDocx(), name = 'cert.docx') {
  const { template } = await hub.fileTemplates.upload({ companyId: COMPANY, kind: LMS_CERTIFICATE_KIND, file: fileOf(buffer, name), publish: true })
  return template
}

describe('lms.certificate kind', () => {
  it('exposes the certificate tag contract as its schema', () => {
    const tags = LMS_CERTIFICATE_SCHEMA.map((e) => e.tag)
    for (const tag of [...CERT_DOCX_SCALAR_TAGS, ...CERT_DOCX_IMAGE_TAGS]) assert.ok(tags.includes(tag), tag)
    assert.deepEqual(LMS_CERTIFICATE_SCHEMA.filter((e) => e.type === 'image').map((e) => e.tag), CERT_DOCX_IMAGE_TAGS)
  })

  it('the sample certificate has tags and Word suggestions use the certificate vocabulary', async () => {
    const { hub } = setup()
    const template = await uploadDocx(hub)
    assert.ok(template.version.placeholders.includes('alumno'))
    const form = buildMinimalDocx(paragraph('Nombre del alumno: ______') + paragraph('Folio:'))
    const plain = await uploadDocx(hub, form, 'form.docx')
    const suggestion = await hub.fileTemplates.suggest({ companyId: COMPANY, templateId: plain.id, versionId: plain.version.id })
    assert.equal(suggestion.supported, true)
    assert.ok(suggestion.applied.some((a) => a.tag === 'alumno'))
  })
})

describe('link rows (sync)', () => {
  it('creates one LMS template per hub template, once, and mirrors hub changes', async () => {
    const { hub, service, prisma } = setup()
    const template = await uploadDocx(hub)
    const first = await service.listTemplates(COMPANY)
    assert.equal(first.length, 1)
    assert.equal(first[0].id, template.id)
    assert.equal(first[0].hubManaged, true)
    assert.equal(first[0].source, 'docx')
    assert.ok(first[0].tagCount > 0)
    assert.equal((await service.listTemplates(COMPANY)).length, 1)
    await hub.fileTemplates.remove({ companyId: COMPANY, templateId: template.id })
    const after = await service.listTemplates(COMPANY)
    assert.equal(after[0].enabled, false)
    assert.equal(prisma.lmsCertificateTemplate.rows.length, 1)
  })
})

describe('certificate rendering through the engine', () => {
  it('fills a hub Word template, converts it and returns the PDF', async () => {
    const { hub, service, prisma, converted } = setup()
    const template = await uploadDocx(hub)
    await service.listTemplates(COMPANY)
    prisma.certRow = cert({ templateId: template.id })
    prisma.lmsCertificateTemplate.rows[0].signerName = 'Luis'
    const { buffer } = await service.managerPdf(COMPANY, 'c1')
    assert.equal(buffer.toString(), '%PDF-from-office')
    const xml = new PizZip(converted[0].buffer).file('word/document.xml').asText()
    assert.match(xml, /Ana/)
    assert.match(xml, /Luis/)
    assert.match(xml, /<pic:pic/)
    assert.doesNotMatch(xml.replace(/<[^>]+>/g, ''), /\{\{/)
  })

  it('falls back to the built-in design when Office is not available', async () => {
    const { hub, service, prisma } = setup({ convert: async () => null })
    const template = await uploadDocx(hub)
    await service.listTemplates(COMPANY)
    prisma.certRow = cert({ templateId: template.id })
    const { buffer } = await service.managerPdf(COMPANY, 'c1')
    assert.equal(buffer.subarray(0, 4).toString(), '%PDF')
    assert.notEqual(buffer.toString(), '%PDF-from-office')
  })

  it('draws a hub PDF template with its stored fields, no Office needed', async () => {
    const { hub, service, prisma, converted } = setup()
    const doc = await PDFDocument.create()
    doc.addPage([600, 400])
    const layout = { page: { width: 600, height: 400 }, fields: [{ key: 'alumno', x: 50, y: 100, w: 300, h: 30, fontSize: 18, color: '#111827', align: 'left', bold: false, background: null }] }
    const asset = await hub.files.store({ companyId: COMPANY, buffer: Buffer.from(await doc.save()), fileName: 'cert.pdf', mimeType: 'application/pdf', entityType: 'DocumentTemplate' })
    const template = await prisma.documentTemplate.create({ data: { companyId: COMPANY, key: 'k1', name: 'PDF', sourceType: LMS_CERTIFICATE_KIND, kind: LMS_CERTIFICATE_KIND, format: 'pdf' } })
    const version = await prisma.documentTemplateVersion.create({ data: { templateId: template.id, versionNumber: 1, status: 'published', fileAssetId: asset.id, placeholders: ['alumno'], layout } })
    await prisma.documentTemplate.update({ where: { id: template.id }, data: { publishedVersionId: version.id } })
    await service.listTemplates(COMPANY)
    prisma.certRow = cert({ templateId: template.id })
    const { buffer } = await service.managerPdf(COMPANY, 'c1')
    assert.equal(buffer.subarray(0, 4).toString(), '%PDF')
    assert.equal(converted.length, 0)
    assert.equal(prisma.lmsCertificateTemplate.rows[0].layout.fields.length, 1)
  })

  it('revoked Word certificates skip the engine (built-in design with the REVOCADO stamp)', async () => {
    const { hub, service, prisma, converted } = setup()
    const template = await uploadDocx(hub)
    await service.listTemplates(COMPANY)
    prisma.certRow = cert({ templateId: template.id, revokedAt: new Date() })
    const { buffer } = await service.managerPdf(COMPANY, 'c1')
    assert.equal(converted.length, 0)
    assert.equal(buffer.subarray(0, 4).toString(), '%PDF')
  })
})
