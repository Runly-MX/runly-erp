import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  canIssueCertificate, certErrorMessage, certificateFileName, formatHours, formatLongDate, insertPlaceholder,
  toAbsoluteUrl, toBlob, verificationLink,
} from './lmsCert.js'

test('insertPlaceholder replaces the selection and moves the caret', () => {
  assert.deepEqual(insertPlaceholder('Hola  bien', 'alumno', 5, 5), { text: 'Hola {{alumno}} bien', caret: 15 })
  assert.deepEqual(insertPlaceholder('Hola X', 'curso', 5, 6), { text: 'Hola {{curso}}', caret: 14 })
  assert.equal(insertPlaceholder('abc', 'folio').text, 'abc{{folio}}')
})

test('canIssueCertificate only for completed enrollments without a valid certificate', () => {
  assert.equal(canIssueCertificate({ status: 'completed', certificate: null }), true)
  assert.equal(canIssueCertificate({ status: 'completed', certificate: { id: 'c', revokedAt: '2026-10-01' } }), true)
  assert.equal(canIssueCertificate({ status: 'completed', certificate: { id: 'c', revokedAt: null } }), false)
  assert.equal(canIssueCertificate({ status: 'active', certificate: null }), false)
})

test('formatting helpers', () => {
  assert.equal(formatLongDate('2026-10-16T12:00:00'), '16 de octubre de 2026')
  assert.equal(formatLongDate('nope'), '')
  assert.equal(formatHours(1.5), '1,5 h')
  assert.equal(formatHours(4), '4 h')
  assert.equal(formatHours(null), '')
  assert.equal(certificateFileName({ folio: '2026-000123' }), 'certificado-2026-000123.pdf')
})

test('error codes map to Spanish messages', () => {
  assert.match(certErrorMessage({ details: { code: 'IN_USE' } }), /asignada/)
  assert.equal(certErrorMessage({ message: 'x' }), 'x')
})

test('urls: absolute passthrough, relative prefixed, verify fallback by token', () => {
  assert.equal(toAbsoluteUrl('/lms/x.pdf', 'http://api:4010/'), 'http://api:4010/lms/x.pdf')
  assert.equal(toAbsoluteUrl('https://a.example.com/p', 'http://api'), 'https://a.example.com/p')
  assert.equal(verificationLink({ verifyUrl: '/app/p/lms/cert/abc' }, 'https://app.example.com'), 'https://app.example.com/app/p/lms/cert/abc')
  assert.equal(verificationLink({ token: 'tok' }, 'https://app.example.com'), 'https://app.example.com/app/p/lms/cert/tok')
})

test('toBlob accepts Blob, withMeta, Response and rejects failed responses', async () => {
  const blob = new Blob(['%PDF'], { type: 'application/pdf' })
  assert.equal(await toBlob(blob), blob)
  assert.equal(await toBlob({ blob, headers: {} }), blob)
  const ok = await toBlob(new Response(blob))
  assert.equal(await ok.text(), '%PDF')
  const failed = new Response(JSON.stringify({ message: 'No', code: 'NOT_COMPLETED' }), { status: 409 })
  await assert.rejects(toBlob(failed), (error) => error.status === 409 && error.details.code === 'NOT_COMPLETED')
  await assert.rejects(toBlob({}), /archivo/)
})

test('docx template helpers', async () => {
  const { docxTagLabel, docxTagText, docxSuggestionFile, isDocxFile, isDocxTemplate, CERT_DOCX_REFERENCE } = await import('./lmsCert.js')
  assert.equal(docxTagText('%qr'), '{{%qr}}')
  assert.equal(docxTagLabel('calificacion'), 'Calificación')
  assert.equal(docxTagLabel('otro'), 'otro')
  assert.equal(isDocxFile({ name: 'Cert.DOCX' }), true)
  assert.equal(isDocxFile({ name: 'cert.pdf' }), false)
  assert.equal(isDocxTemplate({ source: 'docx' }), true)
  assert.equal(CERT_DOCX_REFERENCE.length, 11)
  const file = docxSuggestionFile({ fileName: 'a.docx', contentBase64: Buffer.from('PK').toString('base64') })
  assert.equal(file.name, 'a.docx')
  assert.equal(await file.text(), 'PK')
})

test('uploaded template formats', async () => {
  const { fileFormat, formatInfo, isFileTemplate, isPdfTemplate, isTaggedTemplate } = await import('./lmsCert.js')
  assert.equal(fileFormat({ name: 'Constancia.PPTX' }), 'pptx')
  assert.equal(fileFormat('cert.pdf'), 'pdf')
  assert.equal(fileFormat({ name: 'cert.doc' }), null)
  assert.equal(formatInfo('pptx').app, 'PowerPoint')
  assert.ok(isTaggedTemplate({ source: 'pptx' }) && !isTaggedTemplate({ source: 'pdf' }))
  assert.ok(isFileTemplate({ source: 'pdf' }) && isPdfTemplate({ source: 'pdf' }) && !isFileTemplate({ source: 'design' }))
})
