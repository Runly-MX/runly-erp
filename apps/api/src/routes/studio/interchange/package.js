import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { z } from 'zod'
import { validateDocument, StudioError } from '../../../../../shared/studio/document.js'
import { documentPages } from '../../../../../shared/studio/pages.js'
import { documentAssetIds } from '../../../../../shared/studio/shape-properties.js'
import { STUDIO_FONTS, studioFontStyle } from '../../../../../shared/studio/fonts.js'
import { iconSource } from '../../../../../shared/studio/licenses.js'
import { readPackageZip, writePackageZip, PACKAGE_MIME, invalidPackage, shaPattern } from './zip.js'

export const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const text = z.string().max(2000)
const digest = z.string().regex(shaPattern)
const license = z.strictObject({ id: z.string().max(120), author: text.default(''), notice: z.string().max(32000).default(''), redistribution: z.enum(['allowed', 'unknown', 'forbidden']).default('unknown') })
const entry = z.strictObject({ path: z.string().max(160), sha256: digest, bytes: z.number().int().min(0).max(10 * 1024 * 1024) })
const resource = entry.extend({ id: z.string().regex(/^asset-[a-f0-9]{64}$/), mime: z.enum(['image/png', 'image/jpeg', 'image/webp']), width: z.number().int().positive().max(8192), height: z.number().int().positive().max(8192), license })
export const manifestSchema = z.strictObject({
  format: z.literal('runly.studio'), formatVersion: z.literal(1), minReaderVersion: z.literal(1), documentSchemaVersion: z.literal(7),
  kind: z.enum(['design', 'template']), packageId: digest, title: z.string().trim().min(1).max(160), author: text.default(''), provenance: text.default(''),
  pageCount: z.number().int().min(1).max(24), document: entry, resources: z.array(resource).max(100),
  fonts: z.array(z.strictObject({ family: z.string().max(100), variant: z.string().max(40) })).max(200),
  notices: z.array(z.strictObject({ subject: z.string().max(160), license })).max(2201),
  previews: z.array(entry).max(24), licenses: z.array(entry).max(100),
  compatibility: z.strictObject({ assetReferences: z.literal('package-local-v1'), losses: z.array(z.string().max(500)).max(100) }),
})
const SENTINEL = '00000000-0000-4000-8000-000000000000'

export function mapReferences(input, resolve) {
  const doc = structuredClone(input)
  for (const scene of documentPages(doc)) for (const object of scene.objects) {
    if (object.type === 'image') object.fileAssetId = resolve(object.fileAssetId)
    if (object.fillPaint?.type === 'image') object.fillPaint.fileAssetId = resolve(object.fillPaint.fileAssetId)
  }
  return doc
}
export function renameContent(input, prefix) {
  const doc = structuredClone(input), groups = new Map(); let count = 0
  for (const [index, scene] of documentPages(doc).entries()) {
    scene.page.id = `${prefix}-p${index + 1}`
    for (const item of scene.objects) {
      item.id = `${prefix}-o${++count}`
      if (item.groupId) { if (!groups.has(item.groupId)) groups.set(item.groupId, `${prefix}-g${groups.size + 1}`); item.groupId = groups.get(item.groupId) }
    }
  }
  return validateDocument(doc)
}
const parseJson = bytes => {
  if (!bytes || bytes.length > 4_000_000) throw invalidPackage()
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes), (key, value) => { if (['__proto__', 'constructor', 'prototype'].includes(key)) throw invalidPackage(); return value }) }
  catch { throw invalidPackage('El paquete no contiene JSON UTF-8 válido.') }
}
export async function validateImage(bytes, mime) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > 10 * 1024 * 1024) throw invalidPackage('Imagen demasiado grande.')
  const format = mime === 'image/png' && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'png' : mime === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? 'jpeg' : mime === 'image/webp' && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' ? 'webp' : null
  if (!format) throw invalidPackage('La firma de la imagen no coincide con su MIME.')
  let metadata
  try {
    metadata = await sharp(bytes, { limitInputPixels: 25_000_000, failOn: 'warning' }).metadata()
    if (metadata.format !== format || !metadata.width || !metadata.height || metadata.width > 8192 || metadata.height > 8192 || metadata.width * metadata.height > 25_000_000 || (metadata.pages ?? 1) !== 1 || (metadata.orientation ?? 1) !== 1) throw Error()
    await sharp(bytes, { limitInputPixels: 25_000_000, failOn: 'warning' }).stats()
  } catch { throw invalidPackage('No se puede decodificar la imagen de forma segura.') }
  return { width: metadata.width, height: metadata.height }
}

function canonicalPortable(portable, resources) {
  if (!portable || portable.schemaVersion !== 7 || portable.unit !== 'px' || !Array.isArray(portable.additionalPages) || !Array.isArray(portable.objects) || !portable.page || portable.additionalPages.some(s => !s || !s.page || !Array.isArray(s.objects)) || documentPages(portable).some(s => s.objects.some(o => !o || typeof o !== 'object' || Array.isArray(o)))) throw invalidPackage('Estructura de documento v7 no válida.')
  const ids = new Set(resources.map(r => r.id)), refs = new Set()
  const test = mapReferences(portable, id => { if (!ids.has(id)) throw invalidPackage('Falta un recurso del documento.'); refs.add(id); return SENTINEL })
  if (refs.size !== ids.size) throw invalidPackage('Hay recursos no utilizados o duplicados.')
  const canonical = validateDocument(test)
  // Unknown persistent fields cannot be smuggled through the normalizer.
  if (JSON.stringify(test) !== JSON.stringify(canonical)) {
    const sort = v => Array.isArray(v) ? v.map(sort) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sort(v[k])])) : v
    if (JSON.stringify(sort(test)) !== JSON.stringify(sort(canonical))) throw invalidPackage('El documento debe ser v7 canónico, sin campos adicionales.')
  }
  for (const scene of documentPages(portable)) {
    const pixels = scene.objects.reduce((n, o) => { const id = o.type === 'image' ? o.fileAssetId : o.fillPaint?.type === 'image' ? o.fillPaint.fileAssetId : null; const r = resources.find(r => r.id === id); return n + (r ? r.width * r.height : 0) }, 0)
    if (pixels > 25_000_000) throw invalidPackage('Una página supera 25 megapíxeles de imágenes decodificadas.')
  }
  return canonical
}
function noticeSubjects(manifest, portable) {
  const subjects = new Set(['document', ...manifest.resources.map(r => r.id), ...documentPages(portable).flatMap(s => s.objects.map(o => o.id))]), seen = new Set()
  for (const notice of manifest.notices) { if (!subjects.has(notice.subject) || seen.has(notice.subject)) throw invalidPackage('Créditos duplicados o sin recurso/objeto asociado.'); seen.add(notice.subject) }
}
export function describePackage(manifest, portable) {
  const warnings = [...manifest.compatibility.losses]
  if (manifest.resources.length || manifest.notices.length) warnings.push('Las licencias son declaraciones no verificadas. Comprueba los derechos antes de compartir.')
  if ([...manifest.resources, ...manifest.notices].some(r => r.license.redistribution === 'forbidden')) throw invalidPackage('Una licencia impide redistribuir el recurso.')
  const fonts = manifest.fonts.map(f => ({ ...f, available: Boolean(STUDIO_FONTS.some(row => row.family === f.family) && studioFontStyle(f.family, f.variant)) }))
  if (fonts.some(f => !f.available)) throw invalidPackage('El paquete depende de una fuente o variante no disponible.')
  const first = portable.objects.slice(0, 40).map(o => ({ ...o, ...(o.text ? { text: o.text.slice(0, 120) } : {}) }))
  return { format: manifest.format, formatVersion: 1, kind: manifest.kind, title: manifest.title, packageId: manifest.packageId, pages: documentPages(portable).map(s => ({ ...s.page, objectCount: s.objects.length })), resources: manifest.resources, fonts, notices: manifest.notices, warnings, blockingErrors: [], preview: { page: portable.page, objects: first }, previewKind: 'studio-declarative', requiresWarningAcceptance: warnings.length > 0 }
}
export async function inspectNativePackage(bytes) {
  const files = await readPackageZip(bytes)
  let manifest
  try { manifest = manifestSchema.parse(parseJson(files.get('manifest.json'))) } catch { throw invalidPackage('Manifest o versión de paquete no compatible.') }
  const allowed = new Set(['mimetype', 'manifest.json'])
  const records = [manifest.document, ...manifest.resources, ...manifest.previews, ...manifest.licenses]
  for (const record of records) {
    if (allowed.has(record.path)) throw invalidPackage()
    allowed.add(record.path)
    const bytes = files.get(record.path)
    if (!bytes || bytes.length !== record.bytes || hash(bytes) !== record.sha256) throw invalidPackage('Falta un archivo o su checksum no coincide.')
  }
  if (files.size !== allowed.size || manifest.document.path !== 'document.json') throw invalidPackage('El paquete contiene entradas no declaradas.')
  const resourceIds = new Set()
  for (const r of manifest.resources) {
    const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[r.mime]
    if (r.id !== `asset-${r.sha256}` || resourceIds.has(r.id) || r.path !== `assets/${r.sha256}.${extension}`) throw invalidPackage()
    resourceIds.add(r.id)
    const size = await validateImage(files.get(r.path), r.mime)
    if (size.width !== r.width || size.height !== r.height) throw invalidPackage('Las dimensiones declaradas no coinciden.')
  }
  for (const p of manifest.previews) { if (!/^previews\/[a-z0-9_-]+\.png$/.test(p.path)) throw invalidPackage(); await validateImage(files.get(p.path), 'image/png') }
  for (const p of manifest.licenses) {
    if (!/^licenses\/[a-z0-9_-]+\.txt$/.test(p.path) || p.bytes > 32000) throw invalidPackage()
    try { new TextDecoder('utf-8', { fatal: true }).decode(files.get(p.path)) } catch { throw invalidPackage('El texto de licencia no es UTF-8 válido.') }
  }
  const portable = parseJson(files.get('document.json'))
  const fontReport = manifest.fonts.map(f => ({ ...f, available: Boolean(STUDIO_FONTS.some(row => row.family === f.family) && studioFontStyle(f.family, f.variant)) }))
  if (fontReport.some(f => !f.available)) throw Object.assign(invalidPackage('Faltan familias o variantes tipográficas compatibles.'), { details: { fonts: fontReport } })
  canonicalPortable(portable, manifest.resources)
  noticeSubjects(manifest, portable)
  if (documentPages(portable).length !== manifest.pageCount) throw invalidPackage()
  const actualFonts = documentPages(portable).flatMap(s => s.objects.filter(o => o.type === 'text').map(o => `${o.fontFamily}:${o.fontVariant}`))
  if (new Set(actualFonts).size !== manifest.fonts.length || actualFonts.some(f => !manifest.fonts.some(row => `${row.family}:${row.variant}` === f))) throw invalidPackage('Inventario tipográfico incompleto.')
  return { manifest, portable, files, report: describePackage(manifest, portable), digest: hash(bytes) }
}

export async function exportNativePackage({ document, title, kind = 'design', readAsset, author = '', provenance = '', notices = [], losses = [], licenseFiles = {} }) {
  const canonical = validateDocument(document), resources = [], entries = [], mapping = new Map()
  let resourceBytes = 0
  for (const id of documentAssetIds({ objects: documentPages(canonical).flatMap(s => s.objects) })) {
    const asset = await readAsset(id), bytes = asset.bytes, size = await validateImage(bytes, asset.mime), sha256 = hash(bytes)
    const rights = license.parse(asset.license ?? { id: 'unspecified', redistribution: 'unknown' })
    if (rights.redistribution === 'forbidden') throw new StudioError('Los derechos de una imagen impiden incluirla en el paquete.', 403)
    const localId = `asset-${sha256}`; mapping.set(id, localId)
    const duplicate = resources.find(r => r.id === localId)
    if (duplicate) {
      if (JSON.stringify(duplicate.license) !== JSON.stringify(rights)) duplicate.license = license.parse({ ...duplicate.license, redistribution: duplicate.license.redistribution === 'unknown' || rights.redistribution === 'unknown' ? 'unknown' : 'allowed', notice: `${duplicate.license.notice}\n\nOtra declaración para estos mismos bytes: ${rights.id}. ${rights.author}. ${rights.notice}` })
      continue
    }
    resourceBytes += bytes.length
    if (resourceBytes > 64 * 1024 * 1024) throw new StudioError('Los recursos superan 64 MiB.', 413)
    const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[asset.mime], path = `assets/${sha256}.${ext}`
    resources.push({ id: localId, path, sha256, bytes: bytes.length, mime: asset.mime, ...size, license: rights }); entries.push([path, bytes])
  }
  const portable = mapReferences(canonical, id => mapping.get(id)), documentBytes = Buffer.from(JSON.stringify(portable)), fonts = []
  const currentSubjects = new Set(['document', ...resources.map(r => r.id), ...documentPages(canonical).flatMap(s => s.objects.map(o => o.id))])
  notices = notices.filter(n => currentSubjects.has(n.subject))
  for (const scene of documentPages(canonical)) for (const o of scene.objects) {
    if (o.type === 'text' && !fonts.some(f => f.family === o.fontFamily && f.variant === o.fontVariant)) fonts.push({ family: o.fontFamily, variant: o.fontVariant })
    if (o.type === 'vector' && !notices.some(n => n.subject === o.id)) { const source = o.iconId && iconSource(o.iconId); notices.push({ subject: o.id, license: { id: source?.license ?? 'unspecified', author: source?.author ?? '', notice: source ? `${source.title}. ${source.licenseUrl}. ${source.sourceUrl}` : 'SVG local: derechos no verificados.', redistribution: source ? 'allowed' : 'unknown' } }) }
  }
  const licenses = []
  for (const [path, text] of Object.entries(licenseFiles)) {
    if (!/^licenses\/[a-z0-9_-]+\.txt$/.test(path) || typeof text !== 'string') throw invalidPackage()
    const bytes = Buffer.from(text); if (bytes.length > 32000) throw invalidPackage()
    licenses.push({ path, sha256: hash(bytes), bytes: bytes.length }); entries.push([path, bytes])
  }
  const manifest = manifestSchema.parse({ format: 'runly.studio', formatVersion: 1, minReaderVersion: 1, documentSchemaVersion: 7, kind, packageId: hash(documentBytes), title, author, provenance, pageCount: documentPages(canonical).length, document: { path: 'document.json', sha256: hash(documentBytes), bytes: documentBytes.length }, resources, fonts, notices, previews: [], licenses, compatibility: { assetReferences: 'package-local-v1', losses } })
  canonicalPortable(portable, resources); noticeSubjects(manifest, portable); describePackage(manifest, portable)
  return writePackageZip([['mimetype', Buffer.from(PACKAGE_MIME)], ['manifest.json', Buffer.from(JSON.stringify(manifest))], ['document.json', documentBytes], ...entries])
}
