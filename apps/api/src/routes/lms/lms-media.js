// Direct uploads: the browser PUTs straight to Storage with a signed upload URL
// (videos and submissions exceed the 10 MB /files/upload limit), then confirms.
// A purpose sets the allowed types, size, entity tag and storage folder.
import crypto from 'node:crypto'
import { LmsError, VIDEO_MAX_BYTES } from './lms-core.js'
import { SUBMISSION_MAX_BYTES, SUBMISSION_MIME } from './lms-eval-core.js'
import { createLmsHls } from './lms-hls.js'

export const VIDEO_TOO_BIG = 'El video supera 50 MB. Para videos más largos usa una lección de tipo enlace (YouTube o Vimeo).'

export const VIDEO_UPLOAD = {
  entityType: 'LmsLesson',
  folder: 'lmslesson',
  mime: [/^video\/[a-z0-9.+-]+$/],
  maxBytes: VIDEO_MAX_BYTES,
  typeError: 'Solo se pueden subir videos.',
  tooBig: VIDEO_TOO_BIG,
  defaultExt: 'mp4',
  prepareError: 'No se pudo preparar la subida del video.',
}

export const SUBMISSION_UPLOAD = {
  entityType: 'LmsSubmission',
  folder: 'lmssubmission',
  mime: SUBMISSION_MIME,
  maxBytes: SUBMISSION_MAX_BYTES,
  typeError: 'Ese tipo de archivo no se puede entregar. Usa PDF, imágenes, documentos de Office, texto, ZIP, audio o video.',
  tooBig: 'El archivo supera 50 MB.',
  defaultExt: 'bin',
  prepareError: 'No se pudo preparar la subida del archivo.',
}

export function validateUpload({ fileName, mimeType, sizeBytes } = {}, purpose = VIDEO_UPLOAD) {
  const name = String(fileName ?? '').trim()
  const type = String(mimeType ?? '').trim().toLowerCase()
  const size = Number(sizeBytes)
  if (!name || name.length > 255) throw new LmsError('El nombre del archivo es inválido.', 400)
  if (!purpose.mime.some((pattern) => pattern.test(type))) throw new LmsError(purpose.typeError, 400)
  if (!Number.isFinite(size) || size <= 0) throw new LmsError('El tamaño del archivo es inválido.', 400)
  if (size > purpose.maxBytes) throw new LmsError(purpose.tooBig, 413, 'TOO_LARGE')
  return { name, type, size: Math.round(size) }
}

export const validateVideoUpload = (body) => validateUpload(body, VIDEO_UPLOAD)

export function createLmsMedia({ prisma, supabaseAdmin, bucket }) {
  const hls = createLmsHls({ prisma, supabaseAdmin, bucket })

  // extraMetadata: kept on the asset (guests have no profile, so their uploads
  // carry `guestLearnerId` as the owner).
  async function presign(companyId, actorId, body, purpose = VIDEO_UPLOAD, extraMetadata = null) {
    const { name, type, size } = validateUpload(body, purpose)
    const ext = (name.includes('.') ? name.split('.').pop() : purpose.defaultExt).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || purpose.defaultExt
    const objectKey = `modules/runly-lms/${purpose.folder}/${companyId}/${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`
    const { data, error } = await supabaseAdmin.storage.from(bucket).createSignedUploadUrl(objectKey, { expiresIn: 600 })
    if (error || !data?.signedUrl) {
      console.error('[runly.lms] createSignedUploadUrl failed', { bucket, objectKey, error: error?.message })
      throw new LmsError(purpose.prepareError, 502)
    }
    const asset = await prisma.fileAsset.create({
      data: {
        bucket,
        objectKey,
        originalName: name,
        mimeType: type,
        sizeBytes: size,
        visibility: 'PRIVATE',
        moduleKey: 'runly.lms',
        entityType: purpose.entityType,
        entityId: companyId,
        accessScope: 'COMPANY',
        uploadedById: actorId,
        metadata: { ...(extraMetadata ?? {}), companyId, pending: true },
      },
    })
    return { fileId: asset.id, uploadUrl: data.signedUrl, token: data.token }
  }

  // owner: { entityType, uploadedById, guestLearnerId? } limits confirmation to
  // the uploader (learners; guests by metadata.guestLearnerId).
  async function confirm(companyId, fileId, owner = null) {
    const asset = await prisma.fileAsset.findFirst({ where: { id: fileId, moduleKey: 'runly.lms', enabled: true } })
    if (!asset || asset.metadata?.companyId !== companyId) throw new LmsError('El archivo no existe.', 404)
    if (owner && (asset.entityType !== owner.entityType || asset.uploadedById !== owner.uploadedById)) throw new LmsError('El archivo no existe.', 404)
    if (owner?.guestLearnerId && asset.metadata?.guestLearnerId !== owner.guestLearnerId) throw new LmsError('El archivo no existe.', 404)
    // HLS packages are lesson media only; learners never confirm one.
    if (asset.metadata?.hls) {
      if (owner) throw new LmsError('El archivo no existe.', 404)
      return hls.confirmPackage(asset)
    }
    const { data, error } = await supabaseAdmin.storage.from(asset.bucket).createSignedUrl(asset.objectKey, 60)
    if (error || !data?.signedUrl) throw new LmsError('El archivo no terminó de subirse.', 409, 'NOT_UPLOADED')
    if (asset.metadata?.pending) {
      const { pending, ...metadata } = asset.metadata
      await prisma.fileAsset.update({ where: { id: asset.id }, data: { metadata } })
    }
    return { fileId: asset.id, fileName: asset.originalName }
  }

  return { presign, confirm, presignHls: hls.presign, manifestFor: hls.manifestFor }
}
