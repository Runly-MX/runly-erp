// Word (.docx) certificate templates: upload, replace, suggested tags and the
// stored file. Files live in the private bucket as runly.lms FileAssets
// (entityId = companyId, owning template in metadata.sourceEntityId), the same
// layout as inventory custody templates.
import crypto from 'node:crypto'
import { TemplateError } from '../../services/document-templates/template-tags.js'
import { LmsError } from './lms-error.js'
import { DOCX_MIME, inspectCertDocx } from './lms-cert-docx.js'
import { suggestCertificateTags } from './lms-cert-docx-suggest.js'

const MODULE_KEY = 'runly.lms'
const ENTITY_TYPE = 'LmsCertificateTemplate'
const SIGNED_URL_SECONDS = 3600

const asLmsError = (err) => (err instanceof TemplateError ? new LmsError(err.message, 400) : err)

// Storage access. Reads fall back to a signed URL + fetch when the router has
// no admin client (public verification router).
export function createLmsCertFiles({ prisma, supabaseAdmin = null, bucket = 'runly-files', signFile = null, fetchImpl = (...args) => globalThis.fetch(...args) }) {
  const storage = (name = bucket) => {
    if (!supabaseAdmin?.storage) throw new LmsError('El almacenamiento de archivos no está disponible.', 503)
    return supabaseAdmin.storage.from(name)
  }

  async function store({ companyId, actorId = null, buffer, fileName, sourceEntityId = null }) {
    const objectKey = `modules/runly-lms/lmscertificatetemplate/${companyId}/${Date.now()}-${crypto.randomBytes(5).toString('hex')}.docx`
    const { error } = await storage().upload(objectKey, buffer, { contentType: DOCX_MIME, upsert: false })
    if (error) throw new LmsError('No se pudo guardar el archivo.', 500)
    return prisma.fileAsset.create({
      data: {
        bucket, objectKey, originalName: String(fileName).slice(0, 255), mimeType: DOCX_MIME, sizeBytes: buffer.length,
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

// Validates an uploaded File (multipart) and returns { buffer, fileName, tags, warnings }.
export async function readDocxUpload(file) {
  if (!file || typeof file.arrayBuffer !== 'function' || !file.size) throw new LmsError('Adjunta un archivo de Word (.docx).', 400)
  if (file.size > 10 * 1024 * 1024) throw new LmsError('La plantilla supera 10 MB.', 400)
  const buffer = Buffer.from(await file.arrayBuffer())
  try {
    return { buffer, fileName: String(file.name || 'plantilla.docx'), ...inspectCertDocx(buffer, file.name) }
  } catch (err) { throw asLmsError(err) }
}

// files: createLmsCertFiles(); serialize(row) -> API shape.
export function createLmsCertTemplateFiles({ prisma, files, serialize }) {
  async function findDocxTemplate(companyId, id) {
    const row = await prisma.lmsCertificateTemplate.findFirst({ where: { id, companyId } })
    if (!row) throw new LmsError('La plantilla de certificado no existe.', 404)
    if (row.source !== 'docx') throw new LmsError('Esta plantilla usa el diseño integrado, no un archivo de Word.', 400)
    return row
  }

  async function upload(companyId, actorId, { file, name }) {
    const upload = await readDocxUpload(file)
    const cleanName = String(name ?? '').trim().slice(0, 120) || upload.fileName.replace(/\.docx$/i, '').slice(0, 120) || 'Plantilla de Word'
    const asset = await files.store({ companyId, actorId, buffer: upload.buffer, fileName: upload.fileName })
    const row = await prisma.lmsCertificateTemplate.create({
      data: { companyId, createdById: actorId, name: cleanName, source: 'docx', fileAssetId: asset.id, placeholders: upload.tags, body: null },
    })
    await prisma.fileAsset.update({ where: { id: asset.id }, data: { metadata: { ...(asset.metadata ?? {}), sourceEntityId: row.id } } })
    return { template: await serialize(row, 0), warnings: upload.warnings }
  }

  // Keeps id, name, settings and the courses that use it; issued certificates
  // render with the new file from now on (their data snapshots do not change).
  async function replaceFile(companyId, actorId, id, { file }) {
    const current = await findDocxTemplate(companyId, id)
    const upload = await readDocxUpload(file)
    const asset = await files.store({ companyId, actorId, buffer: upload.buffer, fileName: upload.fileName, sourceEntityId: current.id })
    const row = await prisma.lmsCertificateTemplate.update({ where: { id: current.id }, data: { fileAssetId: asset.id, placeholders: upload.tags } })
    return { template: await serialize(row), warnings: upload.warnings }
  }

  async function currentAsset(companyId, row) {
    const asset = await files.findAsset(companyId, row.fileAssetId)
    if (!asset) throw new LmsError('El archivo de la plantilla ya no existe.', 404)
    return asset
  }

  // The template's own file with suggested tags placed; nothing is saved.
  async function suggest(companyId, id) {
    const row = await findDocxTemplate(companyId, id)
    const asset = await currentAsset(companyId, row)
    let result
    try { result = suggestCertificateTags(await files.read(asset)) } catch (err) { throw asLmsError(err) }
    const baseName = String(asset.originalName ?? row.name).replace(/\.docx$/i, '')
    return {
      applied: result.applied,
      missing: result.missing,
      unplaced: result.unplaced,
      fileName: `${baseName} (con etiquetas).docx`,
      contentBase64: result.buffer.toString('base64'),
    }
  }

  async function fileUrl(companyId, id) {
    const row = await findDocxTemplate(companyId, id)
    const asset = await currentAsset(companyId, row)
    return { ...(await files.signedUrl(asset)), fileName: asset.originalName }
  }

  return { upload, replaceFile, suggest, fileUrl }
}
