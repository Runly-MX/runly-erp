import { test } from 'node:test'
import assert from 'node:assert/strict'
import PizZip from 'pizzip'
import { buildMinimalDocx, paragraph, table } from '../../../services/document-templates/minimal-docx.js'
import { inspectDocx } from '../../../services/document-templates/docx-template.js'
import {
  averageGrade, buildCertDocxData, buildSampleCertificateDocx, certTemplateWarnings, imageSizer, inspectCertDocx, isOfficeAvailable,
  renderCertificateDocx, unknownCertTags,
} from '../lms-cert-docx.js'
import { createCertTemplateOfficeRescan } from '../lms-cert-templates.js'
import { labelBefore, placeholderTag, replaceTextRange, suggestCertificateTags } from '../lms-cert-docx-suggest.js'

const docText = (buffer) => new PizZip(buffer).file('word/document.xml').asText().replace(/<[^>]+>/g, '')
const tagsOf = (result) => result.applied.map((a) => a.tag)

test('suggestion: certificate wording, brackets, guillemets and underscore lines', () => {
  const blank = buildMinimalDocx([
    paragraph('CONSTANCIA DE CAPACITACIÓN'),
    paragraph('Se otorga el presente certificado a ____________________ por haber concluido el curso ____________'),
    paragraph('con una duración de ______ horas, el día [FECHA].'),
    paragraph('Calificación: «Calificación final»   Instructor: [Nombre del instructor]   [LOGO]'),
    paragraph('Folio: __________'),
    paragraph('__________________________'),
    paragraph('Firma del instructor'),
    paragraph('[Sello de la dependencia]'),
  ].join(''))
  const result = suggestCertificateTags(blank)
  const tags = tagsOf(result)
  for (const tag of ['alumno', 'curso', 'horas', 'fecha', 'calificacion', 'instructor', 'folio', '%firma', '%logo']) assert.ok(tags.includes(tag), `missing ${tag}`)
  assert.deepEqual(result.missing, ['%qr'])
  assert.ok(result.unplaced.includes('[Sello de la dependencia]'))
  const text = docText(result.buffer)
  assert.match(text, /certificado a \{\{alumno\}\} por haber concluido el curso \{\{curso\}\}/)
  assert.match(text, /duración de \{\{horas\}\} horas, el día \{\{fecha\}\}\./)
  assert.match(text, /\{\{%firma\}\}_{10,}Firma del instructor/)
  // The copy compiles and only uses known tags.
  const { tags: found } = inspectDocx(result.buffer)
  assert.deepEqual(unknownCertTags(found), [])
})

test('suggestion: label cells in tables and placeholders split across runs', () => {
  const split = '<w:p><w:r><w:t>Otorga a </w:t></w:r><w:r><w:t>[NOM</w:t></w:r><w:r><w:t>BRE]</w:t></w:r></w:p>'
  const blank = buildMinimalDocx([
    split,
    table([['Participante', ''], ['Capacitación', ''], ['Duración', ''], ['Fecha de emisión', '']], { headerRow: false }),
    table([[''], ['Firma']], { headerRow: false }),
  ].join(''))
  const result = suggestCertificateTags(blank)
  const tags = tagsOf(result)
  for (const tag of ['alumno', 'curso', 'horas', 'fecha', '%firma']) assert.ok(tags.includes(tag), `missing ${tag}`)
  assert.match(docText(result.buffer), /Otorga a \{\{alumno\}\}/)
  assert.deepEqual(result.missing, ['folio', '%qr'])
})

test('suggestion helpers and refusal of tagged files', () => {
  assert.equal(labelBefore('por haber acreditado satisfactoriamente el curso'), 'curso')
  assert.equal(labelBefore('La empresa Acme otorga el presente reconocimiento a'), 'alumno')
  assert.equal(labelBefore('Lugar de trabajo'), null)
  assert.equal(placeholderTag('NOMBRE DEL PARTICIPANTE'), 'alumno')
  assert.equal(placeholderTag('Nombre_del_curso'), 'curso')
  assert.equal(placeholderTag('Código QR'), '%qr')
  assert.equal(placeholderTag('123'), null)
  const p = '<w:p><w:r><w:t>ab</w:t></w:r><w:r><w:t>cd</w:t></w:r></w:p>'
  assert.equal(replaceTextRange(p, 1, 3, 'X').replace(/<[^>]+>/g, ''), 'aXd')
  assert.throws(() => suggestCertificateTags(buildMinimalDocx(paragraph('{{alumno}}'))), /ya tiene etiquetas/)
})

test('tag validation: unknown tags, missing QR and empty files', () => {
  assert.deepEqual(unknownCertTags(['alumno', '%qr', '%firma', 'nombre', '%foto', '#items']), ['nombre', '%foto', '#items'])
  assert.deepEqual(certTemplateWarnings(['alumno', '%qr']), [])
  assert.deepEqual(certTemplateWarnings(['alumno', 'nombre']), ['Etiqueta desconocida: {{nombre}}', 'La plantilla no incluye {{%qr}}; el certificado no tendrá el código QR de verificación.'])
  assert.match(certTemplateWarnings([])[0], /no contiene etiquetas/)
  const sample = buildSampleCertificateDocx()
  const inspected = inspectCertDocx(sample, 'ejemplo.docx')
  assert.deepEqual(inspected.warnings, [])
  for (const tag of ['alumno', 'curso', 'fecha', 'horas', 'folio', 'empresa', 'instructor', 'calificacion', '%qr', '%firma', '%logo']) assert.ok(inspected.tags.includes(tag), tag)
  assert.match(new PizZip(sample).file('word/document.xml').asText(), /w:orient="landscape"/)
  assert.throws(() => inspectCertDocx(sample, 'ejemplo.pdf'), /\.docx/)
  assert.throws(() => inspectCertDocx(Buffer.from('nope'), 'x.docx'), /Word/)
  assert.throws(() => inspectCertDocx(buildMinimalDocx(paragraph('{{#curso}} sin cerrar')), 'x.docx'))
})

test('render fills scalars and drops absent images; sizes keep aspect ratio', () => {
  const certificate = { folio: '2026-000007', learnerName: 'Ana Pérez', courseTitle: 'Seguridad', hours: 1.5, issuedAt: new Date(2026, 9, 16, 12) }
  const data = buildCertDocxData({ certificate, companyName: 'Acme', instructor: 'Luis', calificacion: '95' })
  assert.equal(data.qr, '')
  const filled = docText(renderCertificateDocx(buildSampleCertificateDocx(), data, {}))
  for (const value of ['Ana Pérez', 'Seguridad', '16 de octubre de 2026', '1.5', 'Folio 2026-000007', 'Acme', 'Luis', '95']) assert.ok(filled.includes(value), value)
  assert.doesNotMatch(filled, /\{\{/)
  const png = Buffer.alloc(24)
  png.set([0x89, 0x50, 0x4e, 0x47])
  png.writeUInt32BE(400, 16)
  png.writeUInt32BE(100, 20)
  assert.deepEqual(imageSizer({ firma: png })('firma'), [200, 50])
  assert.deepEqual(imageSizer({})('qr'), [110, 110])
  assert.equal(averageGrade([{ lessonId: 'a', score: 80 }, { lessonId: 'a', score: 90 }], [{ lessonId: 'b', score: 100 }]), '95')
  assert.equal(averageGrade(), '')
  assert.equal(isOfficeAvailable({}), false)
})

test('an Office save re-scans the current template tags; other files are ignored', async () => {
  const template = { id: 't1', source: 'docx', fileAssetId: 'f1', placeholders: ['viejo'] }
  const prisma = { lmsCertificateTemplate: {
    findFirst: async ({ where }) => (where.fileAssetId === template.fileAssetId && where.companyId === 'c1' ? { ...template } : null),
    update: async ({ data }) => Object.assign(template, data),
  } }
  const rescan = createCertTemplateOfficeRescan({ prisma })
  const file = { id: 'f1', moduleKey: 'runly.lms', entityType: 'LmsCertificateTemplate' }
  await rescan({ file, companyId: 'c1', bytes: buildSampleCertificateDocx() })
  assert.ok(template.placeholders.includes('%qr') && !template.placeholders.includes('viejo'))
  assert.equal(await rescan({ file: { ...file, entityType: 'LmsSubmission' }, companyId: 'c1', bytes: Buffer.from('x') }), null)
  await rescan({ file, companyId: 'c1', bytes: buildMinimalDocx(paragraph('{{#curso}} sin cerrar')) })
  assert.deepEqual(template.placeholders, [])
})
