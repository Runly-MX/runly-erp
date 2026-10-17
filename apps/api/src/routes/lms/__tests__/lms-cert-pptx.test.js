import { test } from 'node:test'
import assert from 'node:assert/strict'
import PizZip from 'pizzip'
import { EMU_PER_PT, buildMinimalPptx, textBox } from '../../../services/document-templates/minimal-pptx.js'
import { inspectPptx, pptxImageBoxes } from '../../../services/document-templates/pptx-template.js'
import { buildCertDocxData, qrPng, unknownCertTags } from '../lms-cert-docx.js'
import { buildSampleCertificatePptx, inspectCertPptx, renderCertificatePptx } from '../lms-cert-pptx.js'
import { sampleTag, suggestCertificatePptxTags } from '../lms-cert-pptx-suggest.js'

const pt = (v) => Math.round(v * EMU_PER_PT)
const at = (x, y, w, h) => ({ x: pt(x), y: pt(y), cx: pt(w), cy: pt(h) })
const slide = (buffer) => new PizZip(buffer).file('ppt/slides/slide1.xml').asText()
const slideTextOf = (buffer) => slide(buffer).replace(/<\/a:p>/g, '\n').replace(/<[^>]+>/g, '')
const ALL = ['alumno', 'curso', 'fecha', 'horas', 'folio', 'empresa', 'instructor', 'calificacion', '%qr', '%firma', '%logo']

test('pptx sample: one 16:9 slide with every tag, no warnings', () => {
  const sample = buildSampleCertificatePptx()
  const { tags, warnings } = inspectCertPptx(sample, 'ejemplo.pptx')
  for (const tag of ALL) assert.ok(tags.includes(tag), tag)
  assert.deepEqual(warnings, [])
  assert.match(new PizZip(sample).file('ppt/presentation.xml').asText(), /<p:sldSz cx="12192000" cy="6858000"\/>/)
  assert.deepEqual(pptxImageBoxes(sample).qr, [128, 128])
  assert.throws(() => inspectCertPptx(sample, 'ejemplo.docx'), /\.pptx/)
  assert.throws(() => inspectCertPptx(Buffer.from('nope'), 'x.pptx'), /PowerPoint/)
})

test('pptx render: tags filled, QR placed as a picture, missing images vanish', async () => {
  const images = { qr: await qrPng('https://app.example.com/app/p/lms/cert/x'), firma: null, logo: null }
  const certificate = { learnerName: 'José Muñoz', courseTitle: 'Seguridad', hours: 2, folio: '2026-000001', issuedAt: new Date('2026-10-16T12:00:00Z') }
  const data = buildCertDocxData({ certificate, companyName: 'Acme', instructor: 'Luis', calificacion: '95', images })
  const out = renderCertificatePptx(buildSampleCertificatePptx(), data, images)
  const xml = slide(out)
  assert.match(xml, /José Muñoz/)
  assert.match(xml, /Folio 2026-000001/)
  assert.doesNotMatch(slideTextOf(out), /\{\{/)
  assert.equal((xml.match(/<p:pic>/g) ?? []).length, 3) // QR + two 1x1 blanks
  const ids = [...xml.matchAll(/<p:cNvPr id="(\d+)"/g)].map((m) => m[1])
  assert.equal(new Set(ids).size, ids.length)
  // The QR fills its 96 pt text box (128 px) at the box position.
  assert.match(xml, new RegExp(`<a:off x="${pt(820)}" y="${pt(372)}"/><a:ext cx="${128 * 9525}" cy="${128 * 9525}"/>`))
})

test('pptx suggestion: sample words, brackets, blanks, labels and signature line', () => {
  const blank = buildMinimalPptx([
    textBox('CONSTANCIA DE PARTICIPACIÓN', at(80, 40, 800, 40)),
    textBox('NOMBRE DEL ALUMNO', at(80, 150, 800, 40)),
    textBox('por haber concluido el curso ______________', at(80, 200, 800, 24)),
    textBox('Duración: ______ horas', at(80, 230, 300, 20)),
    textBox('[FECHA]', at(400, 230, 200, 20)),
    textBox('[LOGO]', at(400, 10, 160, 40)),
    textBox('Folio:', at(700, 480, 200, 20)),
    textBox('____________________', at(120, 430, 240, 16)),
    textBox('Firma del instructor', at(120, 450, 240, 16)),
    textBox('Sello [QR] aquí', at(600, 400, 200, 20)),
  ].join(''))
  const result = suggestCertificatePptxTags(blank)
  const tags = result.applied.map((a) => a.tag)
  for (const tag of ['alumno', 'curso', 'horas', 'fecha', '%logo', 'folio', '%firma', '%qr']) assert.ok(tags.includes(tag), `missing ${tag}`)
  assert.deepEqual(result.missing, [])
  assert.ok(result.unplaced.some((text) => /\[QR\] comparte/.test(text)))
  const text = slideTextOf(result.buffer)
  assert.match(text, /^\{\{alumno\}\}$/m)
  assert.match(text, /por haber concluido el curso \{\{curso\}\}/)
  assert.match(text, /Duración: \{\{horas\}\} horas/)
  assert.match(text, /^Folio: \{\{folio\}\}$/m)
  assert.match(text, /^CONSTANCIA DE PARTICIPACIÓN$/m)
  // The signature gets its own box right above the line; the QR one bottom-right.
  assert.match(slide(result.buffer), new RegExp(`<a:off x="${pt(120)}" y="${pt(430 - 56)}"/>[\\s\\S]*?\\{\\{%firma\\}\\}`))
  const { tags: found } = inspectPptx(result.buffer)
  assert.deepEqual(unknownCertTags(found), [])
  assert.throws(() => suggestCertificatePptxTags(buildSampleCertificatePptx()), /ya tiene etiquetas/)
})

test('pptx sample words', () => {
  assert.equal(sampleTag('Nombre del participante'), 'alumno')
  assert.equal(sampleTag('NOMBRE DEL CURSO'), 'curso')
  assert.equal(sampleTag('FECHA'), 'fecha')
  assert.equal(sampleTag('Fecha'), null) // a caption, not sample text
  assert.equal(sampleTag('CERTIFICADO'), null)
})

test('service: pptx templates go to Office as .pptx; routes serve the sample', async () => {
  const { createLmsCertService } = await import('../lms-cert-service.js')
  const { createLmsRouter } = await import('../lms-routes.js')
  const template = { id: 't1', companyId: 'company-1', source: 'pptx', fileAssetId: 'f1', placeholders: ['alumno', '%qr'], showLogo: false }
  const row = { id: 'c1', companyId: 'company-1', templateId: 't1', folio: '2026-000002', token: 'b'.repeat(24), learnerName: 'Ana', courseTitle: 'X', hours: 1, issuedAt: new Date(), revokedAt: null }
  const converted = []
  const service = createLmsCertService({
    prisma: { lmsCertificate: { findFirst: async () => row }, lmsCertificateTemplate: { findUnique: async () => template }, company: { findUnique: async () => ({ name: 'Acme' }) } },
    files: { findAsset: async () => ({ id: 'f1' }), read: async () => buildSampleCertificatePptx() }, appBaseUrl: () => 'https://app.example.com',
    convertPdf: async (buffer, name) => { converted.push({ buffer, name }); return Buffer.from('%PDF-office') },
  })
  assert.equal((await service.managerPdf('company-1', 'c1')).buffer.toString(), '%PDF-office')
  assert.equal(converted[0].name, 'certificado-2026-000002.pptx')
  assert.match(slide(converted[0].buffer), /Ana/)
  const requirePermission = () => async (c, next) => { c.set('companyId', 'company-1'); await next() }
  const app = createLmsRouter({ requirePermission, service: {}, learnService: {}, media: {}, evalServices: { quiz: {}, review: {}, assignment: {} }, socialService: {}, certService: {} })
  const sample = await app.request('http://localhost/lms/certificate-templates/sample.pptx')
  assert.equal(sample.status, 200)
  assert.match(sample.headers.get('content-disposition'), /\.pptx/)
  assert.ok(inspectCertPptx(Buffer.from(await sample.arrayBuffer()), 'x.pptx').tags.includes('%qr'))
})
