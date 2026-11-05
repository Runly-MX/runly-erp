// Files of external accounts. Bytes go to a private bucket (default "runly-external") under
// <companyId>/<realmId>/<accountId>/, metadata to external_file. Only images in v1, and every image is
// re-encoded (WebP, EXIF/GPS stripped, orientation applied), so bytes a stranger sent are never served as-is.
import sharp from 'sharp'
import { ExternalIdentityError } from './identity-service.js'

export const EXTERNAL_BUCKET = 'runly-external'
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024
export const ACCOUNT_QUOTA_BYTES = 50 * 1024 * 1024
// single: a new upload replaces the previous file of that purpose.
export const FILE_PURPOSES = Object.freeze({
  avatar: { maxSide: 512, single: true },
  image: { maxSide: 2048, single: false },
})

const fail = (message, status, code) => new ExternalIdentityError(message, status, code)

export async function normalizeImage(bytes, maxSide) {
  try {
    return await sharp(bytes, { limitInputPixels: 40_000_000, failOn: 'warning' }).timeout({ seconds: 5 })
      .rotate().resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 }).toBuffer()
  } catch {
    throw fail('El archivo no es una imagen válida (JPG, PNG, WebP o GIF).', 415, 'UNSUPPORTED_FILE')
  }
}

// storage: { put(key, bytes, mime), get(key) -> Buffer, remove(keys) }; see supabaseExternalStorage below.
export function createExternalFiles({ prisma, storage }) {
  async function upload({ realm, account, purpose, bytes }) {
    const rule = FILE_PURPOSES[purpose]
    if (!rule) throw fail('Tipo de archivo no permitido.', 422, 'VALIDATION_ERROR')
    if (!bytes?.length || bytes.length > MAX_UPLOAD_BYTES) throw fail('La imagen debe pesar menos de 8 MB.', 413, 'FILE_TOO_LARGE')
    const image = await normalizeImage(bytes, rule.maxSide)
    const used = await prisma.externalFile.aggregate({ where: { accountId: account.id }, _sum: { sizeBytes: true } })
    if ((used._sum.sizeBytes ?? 0) + image.length > ACCOUNT_QUOTA_BYTES) throw fail('Alcanzaste el espacio disponible de tu cuenta.', 413, 'QUOTA_EXCEEDED')
    const previous = rule.single ? await prisma.externalFile.findMany({ where: { accountId: account.id, purpose } }) : []
    const objectKey = `${realm.companyId}/${realm.id}/${account.id}/${purpose}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.webp`
    await storage.put(objectKey, image, 'image/webp')
    const file = await prisma.externalFile.create({ data: { realmId: realm.id, accountId: account.id, companyId: realm.companyId, purpose, objectKey, mimeType: 'image/webp', sizeBytes: image.length } })
    if (purpose === 'avatar') await prisma.externalAccount.update({ where: { id: account.id }, data: { avatarFileId: file.id } })
    if (previous.length) await removeRows(previous)
    return publicFile(file)
  }

  async function removeRows(rows) {
    await prisma.externalFile.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } })
    await storage.remove(rows.map((r) => r.objectKey)).catch(() => {})
  }

  // Owner-only: a file is reachable only through its own account inside its own realm.
  async function owned(realm, account, fileId) {
    const file = await prisma.externalFile.findFirst({ where: { id: fileId, accountId: account.id, realmId: realm.id } })
    if (!file) throw fail('Archivo no encontrado.', 404, 'NOT_FOUND')
    return file
  }

  async function read({ realm, account, fileId }) {
    const file = await owned(realm, account, fileId)
    return { file, bytes: await storage.get(file.objectKey) }
  }

  async function list({ realm, account, purpose = null }) {
    const rows = await prisma.externalFile.findMany({ where: { realmId: realm.id, accountId: account.id, ...(purpose ? { purpose } : {}) }, orderBy: { createdAt: 'desc' } })
    return rows.map(publicFile)
  }

  async function remove({ realm, account, fileId }) {
    const file = await owned(realm, account, fileId)
    if (account.avatarFileId === file.id) await prisma.externalAccount.update({ where: { id: account.id }, data: { avatarFileId: null } })
    await removeRows([file])
  }

  // For purges (account or realm removal): objects first, rows cascade with the account.
  async function purgeAccount({ accountId }) {
    const rows = await prisma.externalFile.findMany({ where: { accountId } })
    if (rows.length) await removeRows(rows)
  }

  return { upload, read, list, remove, purgeAccount }
}

export const publicFile = (f) => ({ id: f.id, purpose: f.purpose, mimeType: f.mimeType, sizeBytes: f.sizeBytes, createdAt: f.createdAt })

export function supabaseExternalStorage(supabaseAdmin, bucket = EXTERNAL_BUCKET) {
  const store = () => supabaseAdmin.storage.from(bucket)
  return {
    async put(key, bytes, contentType) {
      const { error } = await store().upload(key, bytes, { contentType, upsert: false })
      if (error) throw error
    },
    async get(key) {
      const { data, error } = await store().download(key)
      if (error) throw error
      return Buffer.from(await data.arrayBuffer())
    },
    async remove(keys) { if (keys.length) await store().remove(keys) },
  }
}
