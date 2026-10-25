import sharp from 'sharp'
import { FILE_ID, StudioError } from '../../../../shared/studio/document.js'

const formats = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }
const MAX_BYTES = 10 * 1024 * 1024

// One bounded cache per API process; every hit still reauthorizes through Files.
export function createStudioResources({ access, filesService, supabaseAdmin }) {
  const cache = new Map()
  let bytes = 0, running = 0
  async function authorize(companyId, actorId) {
    await access.member(companyId, actorId)
    await access.member(companyId, actorId, 'files.assets.read')
  }
  async function file(companyId, actorId, id, context) {
    await authorize(companyId, actorId)
    if (!FILE_ID.test(id)) throw new StudioError('Imagen no disponible.', 404)
    let row
    try { row = await filesService.getById({ ...context, id }) }
    catch (error) { throw new StudioError('Imagen no disponible.', error.status === 403 ? 403 : 404) }
    if (!row.enabled || row.entityId !== companyId || !Object.values(formats).includes(row.mimeType) || Number(row.sizeBytes) > MAX_BYTES) {
      throw new StudioError('Imagen no disponible.', 404)
    }
    return row
  }
  async function list(companyId, actorId, query, context) {
    await authorize(companyId, actorId)
    if (query.format && !formats[query.format]) throw new StudioError('Formato no válido.', 400)
    const result = await filesService.list({ ...context, includeSignedUrls: false,
      mimeTypes: query.format ? [formats[query.format]] : Object.values(formats),
      query: { enabled: true, page: Math.max(1, Math.min(10000, Number(query.page) || 1)), pageSize: 24,
        workspace: query.workspace === 'company' ? '' : 'mine', q: String(query.q ?? '').trim().slice(0, 80) } })
    return { data: result.data.map(row => ({ id: row.id, name: row.originalName, mimeType: row.mimeType, sizeBytes: Number(row.sizeBytes) })), pagination: result.pagination }
  }
  async function thumbnail(companyId, actorId, id, context) {
    const row = await file(companyId, actorId, id, context)
    const key = `${companyId}:${actorId}:${id}:${row.updatedAt}`
    const now = Date.now()
    for (const [k, entry] of cache) if (entry.until <= now) { bytes -= entry.data.length; cache.delete(k) }
    if (cache.has(key)) return cache.get(key).data
    if (running >= 2) throw new StudioError('Espera un momento y vuelve a intentar la miniatura.', 429)
    running++
    try {
      const { data, error } = await supabaseAdmin.storage.from(row.bucket).download(row.objectKey)
      if (error || !data) throw new StudioError('No se pudo leer la imagen.', 404)
      if (data.size > MAX_BYTES) throw new StudioError('Imagen demasiado grande.', 413)
      const output = await sharp(Buffer.from(await data.arrayBuffer()), { limitInputPixels: 25_000_000 })
        .rotate().resize(256, 256, { fit: 'inside', withoutEnlargement: true }).png().toBuffer()
      // Permission may have changed while reading Storage; do not return cached bytes on that basis.
      await file(companyId, actorId, id, context)
      while (cache.size >= 64 || bytes + output.length > 16 * 1024 * 1024) {
        const first = cache.keys().next().value
        if (!first) break
        bytes -= cache.get(first).data.length; cache.delete(first)
      }
      cache.set(key, { data: output, until: now + 20000 }); bytes += output.length
      return output
    } finally { running-- }
  }
  return { list, thumbnail }
}
