import JSZip from 'jszip'
import { StudioError, validateDocument } from './studio/document.js'
import { documentPages } from './studio/pages.js'
import { documentAssetIds } from './studio/shape-properties.js'
import { iconSource } from './studio/licenses.js'
import { PACKAGE_LIMITS, FORMAT } from './limits.js'
import { packageError } from './errors.js'
import { PACKAGE_MIME, canonicalPortable, describePackage, hash, licenseSchema, manifestSchema, mapReferences, noticeSubjects, validateImage } from './inspect.js'

// Deterministic writer: fixed timestamps, STORE compression, entries in the given order.
export async function writePackageZip(entries, { limit = PACKAGE_LIMITS.compressed } = {}) {
  const zip = new JSZip()
  for (const [name, bytes] of entries) zip.file(name, bytes, { compression: 'STORE', createFolders: false, date: new Date('2000-01-01T00:00:00Z'), unixPermissions: 0o100644 })
  const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'STORE', platform: 'UNIX' })
  if (bytes.length > limit) throw new StudioError('El paquete supera 64 MiB.', 413)
  return bytes
}

export async function exportStudioPackage({ document, title, kind = 'design', readAsset, author = '', provenance = '', notices = [], losses = [], licenseFiles = {} }) {
  const canonical = validateDocument(document), resources = [], entries = [], mapping = new Map()
  let resourceBytes = 0
  for (const id of documentAssetIds({ objects: documentPages(canonical).flatMap((s) => s.objects) })) {
    const asset = await readAsset(id), bytes = asset.bytes, size = await validateImage(bytes, asset.mime), sha256 = hash(bytes)
    const rights = licenseSchema.parse(asset.license ?? { id: 'unspecified', redistribution: 'unknown' })
    if (rights.redistribution === 'forbidden') throw new StudioError('Los derechos de una imagen impiden incluirla en el paquete.', 403)
    const localId = `asset-${sha256}`
    mapping.set(id, localId)
    const duplicate = resources.find((r) => r.id === localId)
    if (duplicate) {
      if (JSON.stringify(duplicate.license) !== JSON.stringify(rights)) duplicate.license = licenseSchema.parse({ ...duplicate.license, redistribution: duplicate.license.redistribution === 'unknown' || rights.redistribution === 'unknown' ? 'unknown' : 'allowed', notice: `${duplicate.license.notice}\n\nOtra declaración para estos mismos bytes: ${rights.id}. ${rights.author}. ${rights.notice}` })
      continue
    }
    resourceBytes += bytes.length
    if (resourceBytes > PACKAGE_LIMITS.resourceBytes) throw new StudioError('Los recursos superan 64 MiB.', 413)
    const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[asset.mime], path = `assets/${sha256}.${ext}`
    resources.push({ id: localId, path, sha256, bytes: bytes.length, mime: asset.mime, ...size, license: rights })
    entries.push([path, bytes])
  }
  const portable = mapReferences(canonical, (id) => mapping.get(id)), documentBytes = Buffer.from(JSON.stringify(portable)), fonts = []
  const currentSubjects = new Set(['document', ...resources.map((r) => r.id), ...documentPages(canonical).flatMap((s) => s.objects.map((o) => o.id))])
  notices = notices.filter((n) => currentSubjects.has(n.subject))
  for (const scene of documentPages(canonical)) for (const o of scene.objects) {
    if (o.type === 'text' && !fonts.some((f) => f.family === o.fontFamily && f.variant === o.fontVariant)) fonts.push({ family: o.fontFamily, variant: o.fontVariant })
    if (o.type === 'vector' && !notices.some((n) => n.subject === o.id)) {
      const source = o.iconId && iconSource(o.iconId)
      notices.push({ subject: o.id, license: { id: source?.license ?? 'unspecified', author: source?.author ?? '', notice: source ? `${source.title}. ${source.licenseUrl}. ${source.sourceUrl}` : 'SVG local: derechos no verificados.', redistribution: source ? 'allowed' : 'unknown' } })
    }
  }
  const licenses = []
  for (const [path, text] of Object.entries(licenseFiles)) {
    if (!/^licenses\/[a-z0-9_-]+\.txt$/.test(path) || typeof text !== 'string') throw packageError('manifest_invalid', 'Archivo de licencia no válido.')
    const bytes = Buffer.from(text)
    if (bytes.length > 32000) throw packageError('manifest_invalid', 'Archivo de licencia demasiado grande.')
    licenses.push({ path, sha256: hash(bytes), bytes: bytes.length })
    entries.push([path, bytes])
  }
  const manifest = manifestSchema.parse({ format: 'runly.studio', formatVersion: FORMAT.formatVersion, minReaderVersion: FORMAT.minReaderVersion, documentSchemaVersion: FORMAT.documentSchemaVersion, kind, packageId: hash(documentBytes), title, author, provenance, pageCount: documentPages(canonical).length, document: { path: 'document.json', sha256: hash(documentBytes), bytes: documentBytes.length }, resources, fonts, notices, previews: [], licenses, compatibility: { assetReferences: 'package-local-v1', losses } })
  canonicalPortable(portable, resources)
  noticeSubjects(manifest, portable)
  describePackage(manifest, portable)
  return writePackageZip([['mimetype', Buffer.from(PACKAGE_MIME)], ['manifest.json', Buffer.from(JSON.stringify(manifest))], ['document.json', documentBytes], ...entries])
}
export { exportStudioPackage as exportNativePackage }
