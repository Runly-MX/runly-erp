import { test } from 'node:test'
import assert from 'node:assert/strict'
import PizZip from 'pizzip'
import { buildMinimalDocx, paragraph } from '../../../services/document-templates/minimal-docx.js'
import { createLmsCertTemplateFiles, wantsAutoTag } from '../lms-cert-templates.js'
import { buildSampleCertificateDocx } from '../lms-cert-docx.js'

const docText = (buffer) => new PizZip(buffer).file('word/document.xml').asText().replace(/<[^>]+>/g, '')
const untagged = () => buildMinimalDocx([
  paragraph('Se otorga el presente certificado a ____________________ por haber concluido el curso ____________'),
  paragraph('Fecha: [FECHA]   Folio: __________'),
].join(''))
const fileOf = (buffer, name) => ({ name, size: buffer.length, arrayBuffer: async () => buffer })

function harness() {
  const stored = []
  const rows = []
  const prisma = {
    lmsCertificateTemplate: { create: async ({ data }) => { const row = { id: `t${rows.length + 1}`, ...data }; rows.push(row); return row } },
    fileAsset: { update: async () => ({}) },
  }
  const files = { store: async (args) => { stored.push(args); return { id: `f${stored.length}`, metadata: {} } } }
  const serialize = async (row) => ({ id: row.id, source: row.source, placeholders: row.placeholders, warnings: row.placeholders.length ? [] : ['sin etiquetas'] })
  return { stored, rows, svc: createLmsCertTemplateFiles({ prisma, files, serialize, extractText: async () => ({ page: null, items: [] }) }) }
}

test('upload of an untagged .docx saves the tagged copy and reports recognized/missing fields', async () => {
  const { stored, rows, svc } = harness()
  const result = await svc.upload('c1', 'u1', { file: fileOf(untagged(), 'Constancia.docx'), name: 'Constancia' })
  assert.equal(result.autoTag.saved, true)
  for (const tag of ['alumno', 'curso', 'fecha', 'folio']) assert.ok(result.autoTag.applied.some((a) => a.tag === tag), tag)
  assert.deepEqual(result.autoTag.missing, ['%qr'])
  assert.equal(stored[0].fileName, 'Constancia (con etiquetas).docx')
  assert.match(docText(stored[0].buffer), /certificado a \{\{alumno\}\}/)
  assert.ok(rows[0].placeholders.includes('alumno'))
  assert.equal(rows[0].name, 'Constancia')
})

test('tagged files stay untouched; autoTag=false opts out; nothing recognized keeps the original', async () => {
  const sample = buildSampleCertificateDocx()
  let h = harness()
  let result = await h.svc.upload('c1', 'u1', { file: fileOf(sample, 'ejemplo.docx') })
  assert.equal(result.autoTag, null)
  assert.deepEqual(h.stored[0].buffer, sample)

  h = harness()
  result = await h.svc.upload('c1', 'u1', { file: fileOf(untagged(), 'x.docx'), autoTag: false })
  assert.equal(result.autoTag, null)
  assert.deepEqual(h.rows[0].placeholders, [])

  h = harness()
  const plain = buildMinimalDocx(paragraph('Texto sin campos'))
  result = await h.svc.upload('c1', 'u1', { file: fileOf(plain, 'x.docx') })
  assert.equal(result.autoTag.saved, false)
  assert.equal(h.stored[0].fileName, 'x.docx')

  assert.equal(wantsAutoTag(null), true)
  assert.equal(wantsAutoTag('false'), false)
  assert.equal(wantsAutoTag('0'), false)
  assert.equal(wantsAutoTag('true'), true)
})
