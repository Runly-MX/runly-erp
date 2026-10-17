import { test } from 'node:test'
import assert from 'node:assert/strict'
import { inflateSync } from 'node:zlib'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { extractPdfTextItems } from '../../../services/document-templates/pdf-text-items.js'
import { buildCertDocxData, qrPng } from '../lms-cert-docx.js'
import { groupLines, normalizeCertLayout, suggestLayoutFromItems, xAt } from '../lms-cert-pdf-layout.js'
import { encodableText, inspectCertPdf, renderCertificateOnPdf } from '../lms-cert-pdf-template.js'
import { createLmsCertService } from '../lms-cert-service.js'

const PAGE = { width: 792, height: 612 }

async function basePdf({ pages = 1, text = null } = {}) {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 0; i < pages; i += 1) {
    const page = doc.addPage([PAGE.width, PAGE.height])
    if (text) page.drawText(text, { x: 246, y: 380, size: 28, font })
  }
  return Buffer.from(await doc.save())
}

// The stamp is rotated (pdfjs text items skip it here): look for its hex text in the content streams.
const STAMP_HEX = Buffer.from('REVOCADO').toString('hex').toUpperCase()
function hasStamp(pdf) {
  const raw = pdf.toString('latin1')
  return [...raw.matchAll(/stream\r?\n/g)].some((m) => {
    const start = m.index + m[0].length
    try { return inflateSync(Buffer.from(raw.slice(start, raw.indexOf('endstream', start)), 'latin1')).toString('latin1').includes(STAMP_HEX) } catch { return false }
  })
}

const field = (key, extra = {}) => ({ key, x: 100, y: 100, w: 200, h: 30, ...extra })

test('layout validation: keys, duplicates, bounds, colors and defaults', () => {
  const ok = normalizeCertLayout({ fields: [field('alumno', { fontSize: 24, align: 'center', bold: true }), field('qr', { y: 400, w: 80, h: 80, fontSize: 99 })] }, PAGE)
  assert.deepEqual(ok.page, PAGE)
  assert.deepEqual(ok.fields[0], { key: 'alumno', x: 100, y: 100, w: 200, h: 30, fontSize: 24, color: '#111827', align: 'center', bold: true, background: null })
  assert.deepEqual(ok.fields[1], { key: 'qr', x: 100, y: 400, w: 80, h: 80 }) // image fields keep geometry only
  assert.throws(() => normalizeCertLayout({ fields: [field('nombre')] }, PAGE), /desconocido/)
  assert.throws(() => normalizeCertLayout({ fields: [field('curso'), field('curso')] }, PAGE), /repetido/)
  assert.throws(() => normalizeCertLayout({ fields: [field('curso', { x: 700 })] }, PAGE), /fuera de la página/)
  assert.throws(() => normalizeCertLayout({ fields: [field('curso', { y: -5 })] }, PAGE), /fuera de la página/)
  assert.throws(() => normalizeCertLayout({ fields: [field('curso', { w: 'x' })] }, PAGE), /número/)
  assert.throws(() => normalizeCertLayout({ fields: [field('curso', { color: 'red' })] }, PAGE), /hexadecimal/)
  assert.throws(() => normalizeCertLayout({ fields: [field('curso', { fontSize: 300 })] }, PAGE), /entre 4 y 144/)
  assert.throws(() => normalizeCertLayout({ fields: [] }, null), /tamaño de página/)
  assert.throws(() => normalizeCertLayout({}, PAGE), /lista de campos/)
})

test('text matcher: lines, sample words, labels, blanks, signature and default QR', () => {
  const items = [
    { str: 'CONSTANCIA', x: 300, y: 60, w: 192, h: 30 },
    { str: 'NOMBRE DEL ', x: 246, y: 200, w: 160, h: 28 }, { str: 'ALUMNO', x: 406, y: 200, w: 140, h: 28 },
    { str: 'Curso:', x: 100, y: 300, w: 40, h: 12 }, { str: '______________', x: 145, y: 300, w: 200, h: 12 },
    { str: '[FECHA]', x: 100, y: 340, w: 60, h: 12 },
    { str: '____________', x: 100, y: 480, w: 180, h: 12 }, { str: 'Firma del instructor', x: 120, y: 496, w: 120, h: 10 },
    { str: 'Folio:', x: 600, y: 540, w: 30, h: 10 },
  ]
  const lines = groupLines(items)
  assert.equal(lines[1].text, 'NOMBRE DEL ALUMNO')
  assert.equal(Math.round(xAt(lines[2], 'Curso: '.length)), 145)
  const result = suggestLayoutFromItems(items, PAGE)
  const byKey = Object.fromEntries(result.fields.map((f) => [f.key, f]))
  assert.deepEqual(Object.keys(byKey).sort(), ['alumno', 'curso', 'fecha', 'firma', 'folio', 'qr'])
  assert.equal(byKey.alumno.align, 'center')
  assert.equal(byKey.alumno.background, '#ffffff')
  assert.equal(byKey.alumno.fontSize, 28)
  assert.ok(byKey.alumno.bold)
  assert.equal(Math.round(byKey.curso.x), 145)
  assert.ok(byKey.curso.y + byKey.curso.h <= 312) // sits on the underscore line
  assert.equal(byKey.fecha.x, 100)
  assert.ok(byKey.folio.x > 630)
  assert.ok(byKey.firma.y + byKey.firma.h <= 492)
  assert.deepEqual(result.defaulted, ['qr'])
  assert.deepEqual(result.missing, [])
  // Every proposal passes validation.
  assert.equal(normalizeCertLayout(result, PAGE).fields.length, 6)
})

test('pdf inspect: page size and multi-page warning', async () => {
  const one = await inspectCertPdf(await basePdf(), 'cert.pdf')
  assert.deepEqual(one.page, PAGE)
  assert.deepEqual(one.warnings, [])
  assert.match((await inspectCertPdf(await basePdf({ pages: 2 }), 'cert.pdf')).warnings[0], /solo se usa la primera/)
  await assert.rejects(() => inspectCertPdf(Buffer.from('%PDF-1.4 roto'), 'cert.pdf'), /PDF válido/)
  await assert.rejects(() => inspectCertPdf(Buffer.from('x'), 'cert.docx'), /PDF/)
})

const certificate = { folio: '2026-000007', learnerName: 'José Muñoz Íñiguez', courseTitle: 'Señalización', hours: 1.5, issuedAt: new Date('2026-10-16T12:00:00Z') }
const layout = { page: PAGE, fields: [
  { key: 'alumno', x: 80, y: 200, w: 632, h: 40, fontSize: 30, color: '#111827', align: 'center', bold: true, background: '#ffffff' },
  { key: 'curso', x: 80, y: 260, w: 120, h: 20, fontSize: 30, color: '#4f46e5', align: 'left', bold: false, background: null },
  { key: 'qr', x: 680, y: 500, w: 80, h: 80 }, { key: 'firma', x: 100, y: 480, w: 160, h: 60 },
] }

test('pdf render: accents, shrink-to-fit, with and without images, revoked stamp', async () => {
  const images = { qr: await qrPng('https://app.example.com/app/p/lms/cert/x'), firma: null, logo: null }
  const data = buildCertDocxData({ certificate, companyName: 'Acme', images })
  const plain = await renderCertificateOnPdf({ buffer: await basePdf({ text: 'NOMBRE DEL ALUMNO' }), layout, data, images: {}, issuedAt: certificate.issuedAt })
  assert.equal(plain.subarray(0, 4).toString(), '%PDF')
  const withImages = await renderCertificateOnPdf({ buffer: await basePdf(), layout, data, images, issuedAt: certificate.issuedAt })
  assert.equal(withImages.subarray(0, 4).toString(), '%PDF')
  assert.ok(withImages.length > plain.length + 200) // the QR image is embedded
  const text = (await extractPdfTextItems(withImages)).items.map((i) => i.str).join(' ')
  assert.match(text, /José Muñoz Íñiguez/)
  assert.match(text, /Señalización/)
  assert.equal(hasStamp(withImages), false)
  const curso = (await extractPdfTextItems(withImages)).items.find((i) => i.str === 'Señalización')
  assert.ok(curso.w <= 120.5 && curso.h < 30) // shrunk to the box width
  const revoked = await renderCertificateOnPdf({ buffer: await basePdf(), layout, data, images, revoked: true })
  assert.ok(hasStamp(revoked))
})

test('characters outside WinAnsi lose their accent or become "?"', async () => {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  assert.equal(encodableText(font, 'Ñandú ¿sí?'), 'Ñandú ¿sí?')
  assert.equal(encodableText(font, 'Łódź 東'), '?ódz ?')
})

test('service: PDF templates render with pdf-lib (no Office), revoked included; preview takes an unsaved layout', async () => {
  const template = { id: 't1', companyId: 'company-1', name: 'PDF', source: 'pdf', fileAssetId: 'f1', placeholders: [], layout, showLogo: false }
  let row = { id: 'c1', companyId: 'company-1', enrollmentId: 'e1', courseId: 'k1', templateId: 't1', token: 'a'.repeat(24), revokedAt: null, ...certificate }
  const prisma = {
    lmsCertificate: { findFirst: async () => row },
    lmsCertificateTemplate: { findUnique: async () => template, findFirst: async () => template },
    company: { findUnique: async () => ({ name: 'Acme', brandingConfig: null }) },
  }
  const base = await basePdf()
  let converted = 0
  const service = createLmsCertService({
    prisma, files: { findAsset: async () => ({ id: 'f1' }), read: async () => base }, appBaseUrl: () => 'https://app.example.com',
    convertPdf: async () => { converted += 1; return null },
  })
  const issued = await service.managerPdf('company-1', 'c1')
  assert.match((await extractPdfTextItems(issued.buffer)).items.map((i) => i.str).join(' '), /José Muñoz Íñiguez/)
  row = { ...row, revokedAt: new Date() }
  const stamped = (await service.managerPdf('company-1', 'c1')).buffer
  assert.ok(hasStamp(stamped))
  assert.match((await extractPdfTextItems(stamped)).items.map((i) => i.str).join(' '), /José Muñoz Íñiguez/)
  assert.equal(converted, 0)
  const preview = await service.previewPdf('company-1', 't1', { layout: { fields: [{ key: 'curso', x: 10, y: 10, w: 300, h: 30, fontSize: 18 }] } })
  const previewText = (await extractPdfTextItems(preview.buffer)).items.map((i) => i.str).join(' ')
  assert.match(previewText, /Nombre del curso/)
  assert.doesNotMatch(previewText, /Nombre del alumno/)
  await assert.rejects(() => service.previewPdf('company-1', 't1', { layout: { fields: [{ key: 'curso', x: 10, y: 10, w: 3000, h: 30 }] } }), /fuera de la página/)
})
