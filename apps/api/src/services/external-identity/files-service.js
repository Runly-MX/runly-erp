// Files of external accounts. Bytes go to a private bucket (default "runly-external") under
// <companyId>/<realmId>/<accountId>/, metadata to external_file. Only images in v1, and every image is
// re-encoded (WebP, EXIF/GPS stripped, orientation applied), so bytes a stranger sent are never served as-is.
import sharp from 'sharp'
import { ExternalIdentityError } from './identity-service.js'

export const EXTERNAL_BUCKET = 'runly-external'
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024
export const ACCOUNT_QUOTA_BYTES = 50 * 1024 * 1024
const PURGE_BATCH = 500
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
    const file = await prisma.externalFile.create({ data: { realmId: realm.id, accountId: account.id, companyId: realm.companyId, purpose, bucket: storage.bucket ?? EXTERNAL_BUCKET, objectKey, mimeType: 'image/webp', sizeBytes: image.length } })
    if (purpose === 'avatar') await prisma.externalAccount.update({ where: { id: account.id }, data: { avatarFileId: file.id } })
    // The new avatar is saved; failing to drop the old one must not fail the upload (purges catch leftovers).
    if (previous.length) await removeRows(previous).catch(() => {})
    return publicFile(file)
  }

  // Objects first, then rows: a storage failure leaves the rows in place so a retry still finds the objects.
  async function removeRows(rows) {
    try { await storage.remove(rows.map((r) => r.objectKey)) } catch {
      throw fail('No se pudo eliminar el archivo. Intenta de nuevo.', 503, 'STORAGE_UNAVAILABLE')
    }
    await prisma.externalFile.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } })
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

  async function purgeWhere(where) {
    for (;;) {
      const rows = await prisma.externalFile.findMany({ where, take: PURGE_BATCH })
      if (!rows.length) return
      await removeRows(rows)
    }
  }

  // Removes every object of the account; the caller then deletes the account (rows cascade).
  const purgeAccount = ({ accountId }) => purgeWhere({ accountId })

  // Owner module removed for good (e.g. a website purged): objects, then the realm and everything under it
  // (accounts, sessions, email tokens, file rows) by cascade. Safe to retry; a missing realm is a no-op.
  async function purgeRealm({ moduleKey, ownerId }) {
    const realm = await prisma.externalRealm.findUnique({ where: { moduleKey_ownerId: { moduleKey, ownerId } } })
    if (!realm) return { accounts: 0 }
    await purgeWhere({ realmId: realm.id })
    const accounts = await prisma.externalAccount.count({ where: { realmId: realm.id } })
    await prisma.externalRealm.delete({ where: { id: realm.id } })
    return { accounts }
  }

  return { upload, read, list, remove, purgeAccount, purgeRealm }
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
    async remove(keys) {
      // Supabase reports failures in { error } instead of throwing; it also caps each call at 1000 keys.
      for (let i = 0; i < keys.length; i += 1000) {
        const { error } = await store().remove(keys.slice(i, i + 1000))
        if (error) throw error
      }
    },
    bucket,
  }
}
