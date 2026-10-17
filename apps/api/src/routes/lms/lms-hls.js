// HLS video packages for lessons: videos over the 50 MB Storage object limit are
// remuxed in the browser into ~6 s .ts segments plus an index.m3u8, each
// uploaded with its own signed URL. One FileAsset (the manifest) represents the
// package; metadata.hls = { dir, segments, durationSeconds, sourceName, sourceBytes }.
import crypto from 'node:crypto'
import { LmsError, VIDEO_MAX_BYTES } from './lms-core.js'

export const HLS_SEGMENT_RE = /^seg_\d{5}\.ts$/
export const HLS_SEGMENT_MAX_BYTES = VIDEO_MAX_BYTES
export const HLS_MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024
export const HLS_MAX_SEGMENTS = 2000
export const HLS_MANIFEST_MAX_BYTES = 1024 * 1024
export const HLS_MIME = 'application/vnd.apple.mpegurl'
export const HLS_SIGN_TTL_SECONDS = 3 * 3600
const INT_MAX = 2147483647
const SIGN_BATCH = 20

const positive = (value) => {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : null
}

// Validates POST /lms/media/hls/presign. Returns the normalized package request.
export function validateHlsPresign(body = {}) {
  const name = String(body.fileName ?? '').trim()
  if (!name || name.length > 255) throw new LmsError('El nombre del archivo es inválido.', 400)
  const segments = Array.isArray(body.segments) ? body.segments : null
  if (!segments?.length) throw new LmsError('El paquete de video no tiene segmentos.', 400)
  if (segments.length > HLS_MAX_SEGMENTS) throw new LmsError(`El paquete de video supera ${HLS_MAX_SEGMENTS} segmentos.`, 413, 'TOO_LARGE')
  const seen = new Set()
  let totalBytes = 0
  const normalized = segments.map((segment) => {
    const segmentName = String(segment?.name ?? '')
    if (!HLS_SEGMENT_RE.test(segmentName)) throw new LmsError('El nombre de un segmento es inválido.', 400)
    if (seen.has(segmentName)) throw new LmsError('Hay segmentos repetidos en el paquete.', 400)
    seen.add(segmentName)
    const size = positive(segment?.sizeBytes)
    if (!size) throw new LmsError('El tamaño de un segmento es inválido.', 400)
    if (size > HLS_SEGMENT_MAX_BYTES) throw new LmsError('Un segmento del video supera 50 MB. Exporta el video como MP4 (H.264) e inténtalo de nuevo.', 413, 'TOO_LARGE')
    totalBytes += size
    return { name: segmentName, sizeBytes: Math.round(size) }
  })
  if (totalBytes > HLS_MAX_TOTAL_BYTES) throw new LmsError('El video supera 2 GB.', 413, 'TOO_LARGE')
  const manifestBytes = positive(body.manifestBytes)
  if (!manifestBytes || manifestBytes > HLS_MANIFEST_MAX_BYTES) throw new LmsError('El manifiesto del video es inválido.', 400)
  const sourceBytes = positive(body.sourceBytes)
  if (sourceBytes && sourceBytes > HLS_MAX_TOTAL_BYTES) throw new LmsError('El video supera 2 GB.', 413, 'TOO_LARGE')
  const durationSeconds = positive(body.durationSeconds)
  return {
    name,
    segments: normalized,
    totalBytes: Math.round(totalBytes),
    manifestBytes: Math.round(manifestBytes),
    sourceBytes: sourceBytes ? Math.round(sourceBytes) : null,
    durationSeconds: durationSeconds ? Math.round(durationSeconds) : null,
  }
}

// Non-comment, non-empty lines of a media playlist (the segment URIs).
export function manifestSegmentNames(manifestText) {
  return [...new Set(String(manifestText).split('\n').map((line) => line.trim()).filter((line) => line && !line.startsWith('#')))]
}

export function manifestDurationSeconds(manifestText) {
  let total = 0
  for (const match of String(manifestText).matchAll(/^#EXTINF:([\d.]+)/gm)) total += Number(match[1]) || 0
  return total > 0 ? Math.round(total) : null
}

// Checks an uploaded manifest against the presigned package.
export function checkPackageManifest(manifestText, presignedNames) {
  if (!String(manifestText).trimStart().startsWith('#EXTM3U')) throw new LmsError('El manifiesto del video es inválido.', 409, 'BAD_MANIFEST')
  const names = manifestSegmentNames(manifestText)
  if (!names.length) throw new LmsError('El manifiesto del video no tiene segmentos.', 409, 'BAD_MANIFEST')
  const allowed = new Set(presignedNames)
  if (names.some((name) => !allowed.has(name))) throw new LmsError('El manifiesto del video no coincide con los segmentos subidos.', 409, 'BAD_MANIFEST')
  return names
}

// Rewrites each segment line to its own absolute signed URL. Same technique as
// signManifestSegments in routes/calls/call-recording-service.js (kept separate
// on purpose: different bucket, TTL and error type).
export async function signHlsManifest({ supabaseAdmin, bucket, dir, manifestText, ttlSeconds = HLS_SIGN_TTL_SECONDS }) {
  const lines = String(manifestText).split('\n')
  const names = manifestSegmentNames(manifestText)
  if (!names.length) return manifestText
  const { data, error } = await supabaseAdmin.storage.from(bucket).createSignedUrls(names.map((name) => `${dir}/${name}`), ttlSeconds)
  if (error || !Array.isArray(data)) throw new LmsError('No se pudo preparar la reproducción del video.', 502)
  const urlByName = new Map(data.filter((item) => item?.signedUrl && item?.path).map((item) => [item.path.slice(dir.length + 1), item.signedUrl]))
  return lines.map((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return line
    return urlByName.get(trimmed) || line
  }).join('\n')
}

async function inBatches(items, size, fn) {
  const out = []
  for (let i = 0; i < items.length; i += size) out.push(...await Promise.all(items.slice(i, i + size).map(fn)))
  return out
}

export function createLmsHls({ prisma, supabaseAdmin, bucket }) {
  async function signUpload(objectKey) {
    const { data, error } = await supabaseAdmin.storage.from(bucket).createSignedUploadUrl(objectKey)
    if (error || !data?.signedUrl) {
      console.error('[runly.lms] createSignedUploadUrl failed', { bucket, objectKey, error: error?.message })
      throw new LmsError('No se pudo preparar la subida del video.', 502)
    }
    return data.signedUrl
  }

  async function presign(companyId, actorId, body) {
    const pkg = validateHlsPresign(body)
    const dir = `modules/runly-lms/lmslesson/${companyId}/${Date.now()}-${crypto.randomBytes(6).toString('hex')}`
    const objectKey = `${dir}/index.m3u8`
    const manifestUploadUrl = await signUpload(objectKey)
    const segmentUploadUrls = await inBatches(pkg.segments, SIGN_BATCH, async (segment) => ({ name: segment.name, uploadUrl: await signUpload(`${dir}/${segment.name}`) }))
    const asset = await prisma.fileAsset.create({
      data: {
        bucket,
        objectKey,
        originalName: pkg.name,
        mimeType: HLS_MIME,
        sizeBytes: Math.min(pkg.totalBytes + pkg.manifestBytes, INT_MAX),
        visibility: 'PRIVATE',
        moduleKey: 'runly.lms',
        entityType: 'LmsLesson',
        entityId: companyId,
        accessScope: 'COMPANY',
        uploadedById: actorId,
        metadata: {
          companyId,
          pending: true,
          hls: { dir, segments: pkg.segments.map((s) => s.name), durationSeconds: pkg.durationSeconds, sourceName: pkg.name, sourceBytes: pkg.sourceBytes },
        },
      },
    })
    return { fileId: asset.id, manifestUploadUrl, segmentUploadUrls }
  }

  async function readManifest(asset) {
    const { data, error } = await supabaseAdmin.storage.from(asset.bucket).download(asset.objectKey)
    if (error || !data) return null
    const text = await data.text()
    if (text.length > HLS_MANIFEST_MAX_BYTES) throw new LmsError('El manifiesto del video es inválido.', 409, 'BAD_MANIFEST')
    return text
  }

  // Confirms an uploaded package: the manifest exists, only lists presigned
  // segments, and every listed segment is in Storage.
  async function confirmPackage(asset) {
    const hls = asset.metadata.hls
    const manifestText = await readManifest(asset)
    if (manifestText == null) throw new LmsError('El video no terminó de subirse.', 409, 'NOT_UPLOADED')
    const names = checkPackageManifest(manifestText, hls.segments)
    const { data: listed, error } = await supabaseAdmin.storage.from(asset.bucket).list(hls.dir, { limit: HLS_MAX_SEGMENTS + 10 })
    if (error || !Array.isArray(listed)) throw new LmsError('No se pudo verificar el video.', 502)
    const present = new Set(listed.map((item) => item.name))
    if (names.some((name) => !present.has(name))) throw new LmsError('El video no terminó de subirse.', 409, 'NOT_UPLOADED')
    const durationSeconds = manifestDurationSeconds(manifestText) ?? hls.durationSeconds ?? null
    if (asset.metadata.pending || durationSeconds !== hls.durationSeconds) {
      const { pending, ...metadata } = asset.metadata
      await prisma.fileAsset.update({ where: { id: asset.id }, data: { metadata: { ...metadata, hls: { ...hls, durationSeconds } } } })
    }
    return { fileId: asset.id, fileName: asset.originalName, durationSeconds }
  }

  // Signed manifest text for a package FileAsset, or null when the file is not a package.
  async function manifestFor(fileId) {
    if (!fileId) return null
    const asset = await prisma.fileAsset.findFirst({ where: { id: fileId, enabled: true }, select: { id: true, bucket: true, objectKey: true, metadata: true } })
    const hls = asset?.metadata?.hls
    if (!hls?.dir) return null
    const manifestText = await readManifest(asset)
    if (manifestText == null) throw new LmsError('No se pudo preparar la reproducción del video.', 502)
    return signHlsManifest({ supabaseAdmin, bucket: asset.bucket, dir: hls.dir, manifestText })
  }

  return { presign, confirmPackage, manifestFor }
}
