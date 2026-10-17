// Lesson video uploads: the browser PUTs straight to Storage with a signed
// upload URL (videos exceed the 10 MB /files/upload limit), then confirms.
import crypto from 'node:crypto'
import { LmsError, VIDEO_MAX_BYTES } from './lms-core.js'

export const VIDEO_TOO_BIG = 'El video supera 50 MB. Para videos más largos usa una lección de tipo enlace (YouTube o Vimeo).'

export function validateVideoUpload({ fileName, mimeType, sizeBytes } = {}) {
  const name = String(fileName ?? '').trim()
  const type = String(mimeType ?? '').trim().toLowerCase()
  const size = Number(sizeBytes)
  if (!name || name.length > 255) throw new LmsError('El nombre del archivo es inválido.', 400)
  if (!/^video\/[a-z0-9.+-]+$/.test(type)) throw new LmsError('Solo se pueden subir videos.', 400)
  if (!Number.isFinite(size) || size <= 0) throw new LmsError('El tamaño del archivo es inválido.', 400)
  if (size > VIDEO_MAX_BYTES) throw new LmsError(VIDEO_TOO_BIG, 413, 'TOO_LARGE')
  return { name, type, size: Math.round(size) }
}

export function createLmsMedia({ prisma, supabaseAdmin, bucket }) {
  async function presign(companyId, actorId, body) {
    const { name, type, size } = validateVideoUpload(body)
    const ext = (name.includes('.') ? name.split('.').pop() : 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'mp4'
    const objectKey = `modules/runly-lms/lmslesson/${companyId}/${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`
    const { data, error } = await supabaseAdmin.storage.from(bucket).createSignedUploadUrl(objectKey, { expiresIn: 600 })
    if (error || !data?.signedUrl) {
      console.error('[runly.lms] createSignedUploadUrl failed', { bucket, objectKey, error: error?.message })
      throw new LmsError('No se pudo preparar la subida del video.', 502)
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
        entityType: 'LmsLesson',
        entityId: companyId,
        accessScope: 'COMPANY',
        uploadedById: actorId,
        metadata: { companyId, pending: true },
      },
    })
    return { fileId: asset.id, uploadUrl: data.signedUrl, token: data.token }
  }

  async function confirm(companyId, fileId) {
    const asset = await prisma.fileAsset.findFirst({ where: { id: fileId, moduleKey: 'runly.lms', enabled: true } })
    if (!asset || asset.metadata?.companyId !== companyId) throw new LmsError('El archivo no existe.', 404)
    const { data, error } = await supabaseAdmin.storage.from(asset.bucket).createSignedUrl(asset.objectKey, 60)
    if (error || !data?.signedUrl) throw new LmsError('El archivo no terminó de subirse.', 409, 'NOT_UPLOADED')
    if (asset.metadata?.pending) {
      const { pending, ...metadata } = asset.metadata
      await prisma.fileAsset.update({ where: { id: asset.id }, data: { metadata } })
    }
    return { fileId: asset.id, fileName: asset.originalName }
  }

  return { presign, confirm }
}
