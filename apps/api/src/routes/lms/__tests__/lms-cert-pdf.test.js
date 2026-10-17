import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isPdfImage, renderCertificatePdf } from '../lms-cert-pdf.js'

const certificate = { folio: '2026-000001', learnerName: 'Ana Pérez', courseTitle: 'Seguridad industrial', hours: 1.5, issuedAt: new Date('2026-10-16T18:00:00Z'), revokedAt: null }
const template = { title: 'Certificado de finalización', body: '{{alumno}} concluyó {{curso}} ({{horas}} h).', signerName: 'Luis Gómez', signerTitle: 'Director', accentColor: '#1e40af', showLogo: true }
const pages = (buffer) => (buffer.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length

test('renders a single-page PDF for a valid certificate', async () => {
  const pdf = await renderCertificatePdf({ certificate, template, companyName: 'Acme', verifyUrl: 'https://app.example.com/app/p/lms/cert/abc' })
  assert.ok(Buffer.isBuffer(pdf) && pdf.length > 1000)
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF')
  assert.equal(pages(pdf), 1)
})

test('renders a revoked certificate without template, images or QR', async () => {
  const pdf = await renderCertificatePdf({ certificate: { ...certificate, revokedAt: new Date() }, logoBuffer: Buffer.from('<svg/>'), verifyUrl: null })
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF')
  assert.equal(pages(pdf), 1)
})

test('only PNG and JPEG buffers count as images', () => {
  assert.equal(isPdfImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d])), true)
  assert.equal(isPdfImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), true)
  assert.equal(isPdfImage(Buffer.from('RIFF....WEBP')), false)
  assert.equal(isPdfImage(null), false)
})
