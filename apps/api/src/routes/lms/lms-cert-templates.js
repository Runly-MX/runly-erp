// Uploaded certificate templates (Word .docx, PowerPoint .pptx, PDF): upload,
// replace, suggested tags (docx/pptx), the PDF field layout and the stored
// file. Files live in the private bucket as runly.lms FileAssets
// (entityId = companyId, owning template in metadata.sourceEntityId), the same
// layout as inventory custody templates.
import crypto from 'node:crypto'
import { extractPdfTextItems } from '../../services/document-templates/pdf-text-items.js'
import { TemplateError } from '../../services/document-templates/template-tags.js'
import { LmsError } from './lms-error.js'
import { DOCX_MIME, inspectCertDocx } from './lms-cert-docx.js'
import { suggestCertificateTags } from './lms-cert-docx-suggest.js'
import { PPTX_MIME, inspectCertPptx } from './lms-cert-pptx.js'
import { suggestCertificatePptxTags } from './lms-cert-pptx-suggest.js'
import { PDF_MIME, inspectCertPdf } from './lms-cert-pdf-template.js'
import { normalizeCertLayout, readLayout, suggestLayoutFromItems } from './lms-cert-pdf-layout.js'

const MODULE_KEY = 'runly.lms'
const ENTITY_TYPE = 'LmsCertificateTemplate'
const SIGNED_URL_SECONDS = 3600
const MAX_BYTES = 10 * 1024 * 1024

export const CERT_FILE_FORMATS = {
  docx: { mime: DOCX_MIME, noun: 'archivo de Word (.docx)', app: 'Word', inspect: inspectCertDocx, suggest: suggestCertificateTags },
  pptx: { mime: PPTX_MIME, noun: 'presentación de PowerPoint (.pptx)', app: 'PowerPoint', inspect: inspectCertPptx, suggest: suggestCertificatePptxTags },
  pdf: { mime: PDF_MIME, noun: 'archivo PDF', app: 'PDF', inspect: inspectCertPdf, suggest: null },
}
export const isFileSource = (source) => Object.prototype.hasOwnProperty.call(CERT_FILE_FORMATS, source)
export const formatOfFileName = (name) => /\.(docx|pptx|pdf)$/i.exec(String(name ?? ''))?.[1].toLowerCase() ?? null

const asLmsError = (err) => (err instanceof TemplateError ? new LmsError(err.message, 400) : err)

// Storage access. Reads fall back to a signed URL + fetch when the router has
// no admin client (public verification router).
export function createLmsCertFiles({ prisma, supabaseAdmin = null, bucket = 'runly-files', signFile = null, fetchImpl = (...args) => globalThis.fetch(...args) }) {
  const storage = (name = bucket) => {
    if (!supabaseAdmin?.storage) throw new LmsError('El almacenamiento de archivos no está disponible.', 503)
    return supabaseAdmin.storage.from(name)
  }

  async function store({ companyId, actorId = null, buffer, fileName, sourceEntityId = null, format = 'docx' }) {
    const mime = CERT_FILE_FORMATS[format]?.mime ?? DOCX_MIME
    const objectKey = `modules/runly-lms/lmscertificatetemplate/${companyId}/${Date.now()}-${crypto.randomBytes(5).toString('hex')}.${format}`
    const { error } = await storage().upload(objectKey, buffer, { contentType: mime, upsert: false })
    if (error) throw new LmsError('No se pudo guardar el archivo.', 500)
    return prisma.fileAsset.create({
      data: {
        bucket, objectKey, originalName: String(fileName).slice(0, 255), mimeType: mime, sizeBytes: buffer.length,
        visibility: 'PRIVATE', moduleKey: MODULE_KEY, entityType: ENTITY_TYPE, entityId: companyId, accessScope: 'COMPANY',
        uploadedById: actorId, metadata: { companyId, sourceEntityId },
      },
    })
  }

  async function findAsset(companyId, fileId) {
    if (!fileId) return null
    const asset = await prisma.fileAsset.findFirst({ where: { id: fileId, moduleKey: MODULE_KEY, enabled: true } })
    return asset && asset.metadata?.companyId === companyId ? asset : null
  }

  async function read(asset) {
    if (supabaseAdmin?.storage) {
      const { data, error } = await storage(asset.bucket).download(asset.objectKey)
      if (error || !data) throw new LmsError('No se pudo leer el archivo de la plantilla.', 500)
      return Buffer.from(await data.arrayBuffer())
    }
    const url = signFile ? await signFile(asset.id, 'full').catch(() => null) : null
    if (!url) throw new LmsError('No se pudo leer el archivo de la plantilla.', 500)
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) throw new LmsError('No se pudo leer el archivo de la plantilla.', 500)
    return Buffer.from(await res.arrayBuffer())
  }

  async function signedUrl(asset) {
    const { data, error } = await storage(asset.bucket).createSignedUrl(asset.objectKey, SIGNED_URL_SECONDS, { download: asset.originalName })
    if (error || !data?.signedUrl) throw new LmsError('No se pudo generar el enlace de descarga.', 500)
    return { url: data.signedUrl, expiresIn: SIGNED_URL_SECONDS }
  }

  return { store, findAsset, read, signedUrl }
}

// Office (Collabora) saved a template file in place: re-scan its tags, as
// replaceFile does, so placeholders and warnings match the edited file. Only
// the template's current Word/PowerPoint file counts. A file the scanner can't
// read leaves no tags, so the list flags it as «Sin etiquetas».
export function createCertTemplateOfficeRescan({ prisma }) {
  return async function rescan({ file, companyId, bytes }) {
    if (file?.moduleKey !== MODULE_KEY || file.entityType !== ENTITY_TYPE || !bytes?.length) return null
    const row = await prisma.lmsCertificateTemplate.findFirst({ where: { companyId, fileAssetId: file.id } })
    if (!row || !['docx', 'pptx'].includes(row.source)) return null
    let tags = []
    try { tags = (await CERT_FILE_FORMATS[row.source].inspect(Buffer.from(bytes), `plantilla.${row.source}`)).tags ?? [] } catch { tags = [] }
    return prisma.lmsCertificateTemplate.update({ where: { id: row.id }, data: { placeholders: tags } })
  }
}

// Validates an uploaded File (multipart). expected: a format the file must have.
// Returns { buffer, fileName, format, tags, warnings, page? }.
export async function readTemplateUpload(file, expected = null) {
  const accepted = expected ? CERT_FILE_FORMATS[expected].noun : 'archivo de Word, PowerPoint o PDF'
  if (!file || typeof file.arrayBuffer !== 'function' || !file.size) throw new LmsError(`Adjunta un ${accepted}.`, 400)
  if (file.size > MAX_BYTES) throw new LmsError('La plantilla supera 10 MB.', 400)
  const fileName = String(file.name || `plantilla.${expected ?? 'docx'}`)
  const format = formatOfFileName(fileName)
  if (!format || (expected && format !== expected)) throw new LmsError(`La plantilla debe ser un ${accepted}.`, 400)
  const buffer = Buffer.from(await file.arrayBuffer())
  try {
    const inspected = await CERT_FILE_FORMATS[format].inspect(buffer, fileName)
    return { buffer, fileName, format, tags: inspected.tags ?? [], warnings: inspected.warnings ?? [], page: inspected.page ?? null }
  } catch (err) { throw asLmsError(err) }
}

const cleanName = (name, fileName, format) => String(name ?? '').trim().slice(0, 120)
  || fileName.replace(/\.(docx|pptx|pdf)$/i, '').slice(0, 120) || `Plantilla de ${CERT_FILE_FORMATS[format].app}`

// files: createLmsCertFiles(); serialize(row) -> API shape; extractText (tests).
export function createLmsCertTemplateFiles({ prisma, files, serialize, extractText = extractPdfTextItems }) {
  async function findFileTemplate(companyId, id, formats = Object.keys(CERT_FILE_FORMATS)) {
    const row = await prisma.lmsCertificateTemplate.findFirst({ where: { id, companyId } })
    if (!row) throw new LmsError('La plantilla de certificado no existe.', 404)
    if (!formats.includes(row.source)) {
      const wanted = formats.map((f) => CERT_FILE_FORMATS[f].app).join(' o ')
      throw new LmsError(isFileSource(row.source) ? `Esta acción solo aplica a plantillas de ${wanted}.` : 'Esta plantilla usa el diseño integrado, no un archivo.', 400)
    }
    return row
  }

  async function currentAsset(companyId, row) {
    const asset = await files.findAsset(companyId, row.fileAssetId)
    if (!asset) throw new LmsError('El archivo de la plantilla ya no existe.', 404)
    return asset
  }

  // Detected fields of a PDF in the template's page frame (best effort when soft).
  async function detectLayout(buffer, page, { soft = false } = {}) {
    try {
      const { page: textPage, items } = await extractText(buffer)
      const sx = textPage?.width ? page.width / textPage.width : 1, sy = textPage?.height ? page.height / textPage.height : 1
      const scaled = items.map((i) => ({ ...i, x: i.x * sx, y: i.y * sy, w: i.w * sx, h: i.h * sy }))
      return suggestLayoutFromItems(scaled, page)
    } catch (err) {
      if (soft) return null
      throw asLmsError(err)
    }
  }

  async function initialLayout(upload, previous = null) {
    const prev = readLayout(previous)
    const same = prev.page && Math.abs(prev.page.width - upload.page.width) < 1 && Math.abs(prev.page.height - upload.page.height) < 1
    if (same && prev.fields.length) return { page: upload.page, fields: prev.fields }
    const detected = await detectLayout(upload.buffer, upload.page, { soft: true })
    return { page: upload.page, fields: detected?.fields ?? [] }
  }

  async function upload(companyId, actorId, { file, name, format = null }) {
    const up = await readTemplateUpload(file, format)
    const asset = await files.store({ companyId, actorId, buffer: up.buffer, fileName: up.fileName, format: up.format })
    const layout = up.format === 'pdf' ? await initialLayout(up) : {}
    const row = await prisma.lmsCertificateTemplate.create({
      data: { companyId, createdById: actorId, name: cleanName(name, up.fileName, up.format), source: up.format, fileAssetId: asset.id, placeholders: up.tags, layout, body: null },
    })
    await prisma.fileAsset.update({ where: { id: asset.id }, data: { metadata: { ...(asset.metadata ?? {}), sourceEntityId: row.id } } })
    const template = await serialize(row, 0)
    return { template, warnings: [...up.warnings, ...template.warnings.filter((w) => !up.warnings.includes(w))] }
  }

  // Same format only. Keeps id, name, settings and the courses that use it;
  // issued certificates render with the new file from now on.
  async function replaceFile(companyId, actorId, id, { file }) {
    const current = await findFileTemplate(companyId, id)
    const up = await readTemplateUpload(file, current.source)
    const asset = await files.store({ companyId, actorId, buffer: up.buffer, fileName: up.fileName, sourceEntityId: current.id, format: up.format })
    const data = { fileAssetId: asset.id, placeholders: up.tags }
    if (up.format === 'pdf') data.layout = await initialLayout(up, current.layout)
    const row = await prisma.lmsCertificateTemplate.update({ where: { id: current.id }, data })
    const template = await serialize(row)
    return { template, warnings: [...up.warnings, ...template.warnings.filter((w) => !up.warnings.includes(w))] }
  }

  // The template's own file with suggested tags placed; nothing is saved.
  async function suggest(companyId, id) {
    const row = await findFileTemplate(companyId, id, ['docx', 'pptx'])
    const asset = await currentAsset(companyId, row)
    let result
    try { result = CERT_FILE_FORMATS[row.source].suggest(await files.read(asset)) } catch (err) { throw asLmsError(err) }
    const baseName = String(asset.originalName ?? row.name).replace(/\.(docx|pptx)$/i, '')
    return {
      applied: result.applied,
      missing: result.missing,
      unplaced: result.unplaced,
      fileName: `${baseName} (con etiquetas).${row.source}`,
      contentBase64: result.buffer.toString('base64'),
    }
  }

  async function fileUrl(companyId, id) {
    const row = await findFileTemplate(companyId, id)
    const asset = await currentAsset(companyId, row)
    return { ...(await files.signedUrl(asset)), fileName: asset.originalName }
  }

  async function saveLayout(companyId, id, body) {
    const row = await findFileTemplate(companyId, id, ['pdf'])
    const layout = normalizeCertLayout(body, readLayout(row.layout).page)
    return serialize(await prisma.lmsCertificateTemplate.update({ where: { id: row.id }, data: { layout } }))
  }

  // Proposed fields from the PDF text; nothing is saved.
  async function suggestLayout(companyId, id) {
    const row = await findFileTemplate(companyId, id, ['pdf'])
    const page = readLayout(row.layout).page
    if (!page) throw new LmsError('La plantilla no tiene el tamaño de página; vuelve a subir el PDF.', 400)
    return detectLayout(await files.read(await currentAsset(companyId, row)), page)
  }

  return { upload, replaceFile, suggest, fileUrl, saveLayout, suggestLayout, findFileTemplate }
}
