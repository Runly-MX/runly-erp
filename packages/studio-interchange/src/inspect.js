import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { z } from 'zod'
import { validateDocument } from './studio/document.js'
import { documentPages } from './studio/pages.js'
import { STUDIO_FONTS, studioFontStyle } from './studio/fonts.js'
import { FORMAT, LIMITS_VERSION, PACKAGE_LIMITS, resolveLimits } from './limits.js'
import { PackageError, packageError } from './errors.js'
import { readZip, shaPattern } from './zip-reader.js'

// Pure inspection of a portable Studio package: no Prisma, Storage, network,
// filesystem or persistence. Safe to run on hostile bytes.
export { FORMAT, LIMITS_VERSION, PACKAGE_LIMITS, shaPattern, PackageError }
export const PACKAGE_MIME = FORMAT.mime
const FOLDERS = ['assets', 'previews', 'licenses']

export const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
export const readPackageZip = (bytes, limits) => readZip(bytes, { mimetype: PACKAGE_MIME, folders: FOLDERS, limits })

const text = z.string().max(2000)
const digest = z.string().regex(shaPattern)
const license = z.strictObject({ id: z.string().max(120), author: text.default(''), notice: z.string().max(32000).default(''), redistribution: z.enum(['allowed', 'unknown', 'forbidden']).default('unknown') })
export const licenseSchema = license
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
// One reader per supported formatVersion: raising the version keeps the previous readers.
export const MANIFEST_READERS = Object.freeze({ 1: manifestSchema })
const SENTINEL = '00000000-0000-4000-8000-000000000000'

export const defaultFonts = Object.freeze({ has: (family, variant) => Boolean(STUDIO_FONTS.some((row) => row.family === family) && studioFontStyle(family, variant)) })

export function mapReferences(input, resolve) {
  const doc = structuredClone(input)
  for (const scene of documentPages(doc)) for (const object of scene.objects) {
    if (object.type === 'image') object.fileAssetId = resolve(object.fileAssetId)
    if (object.fillPaint?.type === 'image') object.fillPaint.fileAssetId = resolve(object.fillPaint.fileAssetId)
  }
  return doc
}
export function renameContent(input, prefix) {
  const doc = structuredClone(input), groups = new Map()
  let count = 0
  for (const [index, scene] of documentPages(doc).entries()) {
    scene.page.id = `${prefix}-p${index + 1}`
    for (const item of scene.objects) {
      item.id = `${prefix}-o${++count}`
      if (item.groupId) { if (!groups.has(item.groupId)) groups.set(item.groupId, `${prefix}-g${groups.size + 1}`); item.groupId = groups.get(item.groupId) }
    }
  }
  return validateDocument(doc)
}

function parseJson(bytes, { limit, reason, missing }) {
  if (!bytes) throw packageError(missing ?? reason, 'Falta un archivo obligatorio del paquete.')
  if (bytes.length > limit) throw packageError('zip_limit_exceeded', 'Un archivo JSON del paquete es demasiado grande.')
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes), (key, value) => {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('unsafe key')
      return value
    })
  } catch { throw packageError(reason, 'El paquete no contiene JSON UTF-8 válido.') }
}

const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
export async function validateImage(input, mime, limits = PACKAGE_LIMITS) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input ?? [])
  if (!bytes.length) throw packageError('image_invalid', 'La imagen está vacía.')
  if (bytes.length > limits.entry) throw packageError('image_limit', 'Imagen demasiado grande.')
  const format = mime === 'image/png' && bytes.subarray(0, 8).equals(PNG) ? 'png' : mime === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? 'jpeg' : mime === 'image/webp' && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' ? 'webp' : null
  if (!format) throw packageError('image_invalid', 'La firma de la imagen no coincide con su MIME.')
  let metadata
  const options = { limitInputPixels: limits.imagePixels, failOn: 'warning' }
  try { metadata = await sharp(bytes, options).metadata() } catch (error) {
    throw packageError(/pixel limit/i.test(String(error?.message)) ? 'image_limit' : 'image_invalid', 'No se puede decodificar la imagen de forma segura.')
  }
  if (metadata.format !== format || !metadata.width || !metadata.height || (metadata.pages ?? 1) !== 1 || (metadata.orientation ?? 1) !== 1) throw packageError('image_invalid', 'No se puede decodificar la imagen de forma segura.')
  if (metadata.width > limits.imageSide || metadata.height > limits.imageSide || metadata.width * metadata.height > limits.imagePixels) throw packageError('image_limit', 'La imagen supera las dimensiones permitidas.')
  try { await sharp(bytes, options).stats() } catch { throw packageError('image_invalid', 'No se puede decodificar la imagen de forma segura.') }
  return { width: metadata.width, height: metadata.height }
}

export function canonicalPortable(portable, resources, limits = PACKAGE_LIMITS) {
  const invalid = (message) => packageError('document_invalid', message)
  if (!portable || portable.schemaVersion !== 7 || portable.unit !== 'px' || !Array.isArray(portable.additionalPages) || !Array.isArray(portable.objects) || !portable.page || portable.additionalPages.some((s) => !s || !s.page || !Array.isArray(s.objects)) || documentPages(portable).some((s) => s.objects.some((o) => !o || typeof o !== 'object' || Array.isArray(o)))) throw invalid('Estructura de documento v7 no válida.')
  const scenes = documentPages(portable)
  if (scenes.length > limits.pages || scenes.some((s) => s.objects.length > limits.objectsPerPage) || scenes.reduce((n, s) => n + s.objects.length, 0) > limits.totalObjects) throw invalid('El documento supera los límites de páginas u objetos.')
  const ids = new Set(resources.map((r) => r.id)), refs = new Set()
  let canonical, test
  try {
    test = mapReferences(portable, (id) => { if (!ids.has(id)) throw invalid('Falta un recurso del documento.'); refs.add(id); return SENTINEL })
    if (refs.size !== ids.size) throw invalid('Hay recursos no utilizados o duplicados.')
    canonical = validateDocument(test)
  } catch (error) { throw error instanceof PackageError ? error : invalid('El documento no es válido.') }
  // Unknown persistent fields cannot be smuggled through the normalizer.
  if (JSON.stringify(test) !== JSON.stringify(canonical)) {
    const sort = (v) => (Array.isArray(v) ? v.map(sort) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort(v[k])])) : v)
    if (JSON.stringify(sort(test)) !== JSON.stringify(sort(canonical))) throw invalid('El documento debe ser v7 canónico, sin campos adicionales.')
  }
  for (const scene of scenes) {
    const pixels = scene.objects.reduce((n, o) => { const id = o.type === 'image' ? o.fileAssetId : o.fillPaint?.type === 'image' ? o.fillPaint.fileAssetId : null; const r = resources.find((x) => x.id === id); return n + (r ? r.width * r.height : 0) }, 0)
    if (pixels > limits.imagePixels) throw packageError('image_limit', 'Una página supera 25 megapíxeles de imágenes decodificadas.')
  }
  return canonical
}
export function noticeSubjects(manifest, portable) {
  const subjects = new Set(['document', ...manifest.resources.map((r) => r.id), ...documentPages(portable).flatMap((s) => s.objects.map((o) => o.id))]), seen = new Set()
  for (const notice of manifest.notices) { if (!subjects.has(notice.subject) || seen.has(notice.subject)) throw packageError('document_invalid', 'Créditos duplicados o sin recurso/objeto asociado.'); seen.add(notice.subject) }
}

const fontRows = (manifest, catalog) => manifest.fonts.map((f) => ({ ...f, available: Boolean(catalog.has(f.family, f.variant)) }))
const forbiddenLicenses = (manifest) => [...manifest.resources.map((r) => ({ subject: r.id, license: r.license })), ...manifest.notices].filter((r) => r.license.redistribution === 'forbidden')

// Legacy report consumed by the Studio import screens (unchanged shape).
export function describePackage(manifest, portable, catalog = defaultFonts) {
  const warnings = [...manifest.compatibility.losses]
  if (manifest.resources.length || manifest.notices.length) warnings.push('Las licencias son declaraciones no verificadas. Comprueba los derechos antes de compartir.')
  if (forbiddenLicenses(manifest).length) throw packageError('license_forbidden', 'Una licencia impide redistribuir el recurso.')
  const fonts = fontRows(manifest, catalog)
  if (fonts.some((f) => !f.available)) throw packageError('font_unavailable', 'El paquete depende de una fuente o variante no disponible.')
  const first = portable.objects.slice(0, 500).map((o) => ({ ...o, ...(o.text ? { text: o.text.slice(0, 120) } : {}) }))
  return { format: manifest.format, formatVersion: 1, kind: manifest.kind, title: manifest.title, packageId: manifest.packageId, pages: documentPages(portable).map((s) => ({ ...s.page, objectCount: s.objects.length })), resources: manifest.resources, fonts, notices: manifest.notices, warnings, blockingErrors: [], preview: { page: portable.page, objects: first }, previewKind: 'studio-declarative', requiresWarningAcceptance: warnings.length > 0 }
}

const EMAIL = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/i
const PHONE = /(?:\+?\d[\s().-]?){9,15}/
// Text a person typed may carry personal data; only the kind and the place are reported, never the value.
export function personalDataOf(portable) {
  const found = []
  for (const [pageIndex, scene] of documentPages(portable).entries()) for (const object of scene.objects) {
    if (!object || object.type !== 'text' || typeof object.text !== 'string') continue
    if (EMAIL.test(object.text)) found.push({ kind: 'email', pageIndex, objectId: object.id })
    const phone = object.text.match(PHONE)
    if (phone && phone[0].replace(/\D/g, '').length >= 9) found.push({ kind: 'phone', pageIndex, objectId: object.id })
  }
  return found
}

// Deterministic report of the new contract (no dates, no randomness).
function buildReport(manifest, portable, fonts) {
  const licenses = new Map()
  for (const row of [...manifest.resources.map((r) => r.license), ...manifest.notices.map((n) => n.license)]) licenses.set(`${row.id}\u0000${row.redistribution}`, { id: row.id, redistribution: row.redistribution })
  return {
    format: manifest.format, formatVersion: manifest.formatVersion, kind: manifest.kind, title: manifest.title, packageId: manifest.packageId, pageCount: manifest.pageCount,
    pages: documentPages(portable).map((s, index) => ({ index, objects: s.objects.length })),
    fonts: fonts.map((f) => ({ family: f.family, variant: f.variant, available: f.available })),
    licenses: [...licenses.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : a.redistribution < b.redistribution ? -1 : 1)),
    images: manifest.resources.map((r) => ({ id: r.id, mime: r.mime, width: r.width, height: r.height, bytes: r.bytes })),
    previews: manifest.previews.map((p) => ({ path: p.path, bytes: p.bytes })),
    losses: [...manifest.compatibility.losses],
    personalData: personalDataOf(portable),
  }
}

// Structural inspection. Anything hostile throws a PackageError with a stable `reason`;
// fonts and licenses are returned so the caller decides how to report them.
async function inspectCore(input, { limits, fonts: catalog = defaultFonts } = {}) {
  const files = await readPackageZip(input, limits)
  const raw = parseJson(files.get('manifest.json'), { limit: limits.documentBytes, reason: 'manifest_invalid' })
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.format !== 'runly.studio' || ![raw.formatVersion, raw.minReaderVersion, raw.documentSchemaVersion].every((n) => Number.isInteger(n) && n >= 1)) throw packageError('manifest_invalid', 'Manifest o versión de paquete no compatible.')
  // A newer package is reported, not parsed: only the version triple is exposed.
  if (raw.formatVersion > FORMAT.formatVersion || raw.minReaderVersion > FORMAT.formatVersion || raw.documentSchemaVersion > FORMAT.documentSchemaVersion) {
    throw packageError('format_unsupported', 'El paquete es de una versión más nueva de Runly. Actualiza Runly para importarlo.', { manifest: { format: raw.format, formatVersion: raw.formatVersion, minReaderVersion: raw.minReaderVersion } })
  }
  const reader = MANIFEST_READERS[raw.formatVersion]
  let manifest
  try { manifest = reader.parse(raw) } catch { throw packageError('manifest_invalid', 'Manifest o versión de paquete no compatible.') }
  if (manifest.resources.length > limits.assets) throw packageError('zip_limit_exceeded', 'El paquete declara demasiados recursos.')
  if (manifest.resources.reduce((n, r) => n + r.bytes, 0) > limits.resourceBytes) throw packageError('zip_limit_exceeded', 'Los recursos del paquete superan el límite.')
  const allowed = new Set(['mimetype', 'manifest.json'])
  for (const record of [manifest.document, ...manifest.resources, ...manifest.previews, ...manifest.licenses]) {
    if (allowed.has(record.path)) throw packageError('manifest_invalid', 'El manifest repite una ruta.')
    allowed.add(record.path)
    const bytes = files.get(record.path)
    if (!bytes || bytes.length !== record.bytes || hash(bytes) !== record.sha256) throw packageError('checksum_mismatch', 'Falta un archivo o su checksum no coincide.')
  }
  if (files.size !== allowed.size) throw packageError('undeclared_entry', 'El paquete contiene entradas no declaradas.')
  if (manifest.document.path !== 'document.json') throw packageError('manifest_invalid', 'El documento debe llamarse document.json.')
  const resourceIds = new Set()
  for (const r of manifest.resources) {
    const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[r.mime]
    if (r.id !== `asset-${r.sha256}` || resourceIds.has(r.id) || r.path !== `assets/${r.sha256}.${extension}`) throw packageError('manifest_invalid', 'Un recurso no coincide con su identificador o ruta.')
    resourceIds.add(r.id)
    const size = await validateImage(files.get(r.path), r.mime, limits)
    if (size.width !== r.width || size.height !== r.height) throw packageError('image_invalid', 'Las dimensiones declaradas no coinciden.')
  }
  for (const p of manifest.previews) { if (!/^previews\/[a-z0-9_-]+\.png$/.test(p.path)) throw packageError('manifest_invalid', 'Ruta de vista previa no válida.'); await validateImage(files.get(p.path), 'image/png', limits) }
  for (const p of manifest.licenses) {
    if (!/^licenses\/[a-z0-9_-]+\.txt$/.test(p.path) || p.bytes > 32000) throw packageError('manifest_invalid', 'Archivo de licencia no válido.')
    try { new TextDecoder('utf-8', { fatal: true }).decode(files.get(p.path)) } catch { throw packageError('manifest_invalid', 'El texto de licencia no es UTF-8 válido.') }
  }
  const portable = parseJson(files.get('document.json'), { limit: limits.documentBytes, reason: 'document_invalid' })
  const fonts = fontRows(manifest, catalog)
  // An unknown font makes the document unreadable by the normalizer: keep the report instead of hiding it.
  if (fonts.some((f) => !f.available)) {
    if (!portable || typeof portable !== 'object' || !Array.isArray(portable.objects) || !Array.isArray(portable.additionalPages) || documentPages(portable).some((s) => !s || !Array.isArray(s.objects))) throw packageError('document_invalid', 'Estructura de documento v7 no válida.')
    return { manifest, portable, files, fonts, partial: true }
  }
  canonicalPortable(portable, manifest.resources, limits)
  noticeSubjects(manifest, portable)
  if (documentPages(portable).length !== manifest.pageCount) throw packageError('page_count_mismatch', 'El número de páginas no coincide con el manifest.')
  const actualFonts = documentPages(portable).flatMap((s) => s.objects.filter((o) => o.type === 'text').map((o) => `${o.fontFamily}:${o.fontVariant}`))
  if (new Set(actualFonts).size !== manifest.fonts.length || actualFonts.some((f) => !manifest.fonts.some((row) => `${row.family}:${row.variant}` === f))) throw packageError('document_invalid', 'Inventario tipográfico incompleto.')
  return { manifest, portable, files, fonts }
}

// Historical API of the Studio service: strict, throws a StudioError on anything wrong.
export async function inspectNativePackage(bytes, options = {}) {
  const limits = resolveLimits(options.limits), core = await inspectCore(bytes, { ...options, limits })
  if (core.fonts.some((f) => !f.available)) throw packageError('font_unavailable', 'Faltan familias o variantes tipográficas compatibles.', { details: { fonts: core.fonts } })
  return { manifest: core.manifest, portable: core.portable, files: core.files, report: describePackage(core.manifest, core.portable, options.fonts), digest: hash(bytes) }
}

// Contract API (Annex A): never throws on hostile input; always returns the digest of the bytes.
export async function inspectStudioPackage(bytes, options = {}) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('BYTES_MUST_BE_UINT8ARRAY')
  const limits = resolveLimits(options.limits), digestOfBytes = hash(bytes)
  try {
    const core = await inspectCore(bytes, { limits, fonts: options.fonts })
    const errors = [], warnings = []
    for (const f of core.fonts.filter((row) => !row.available)) errors.push({ code: 'font_unavailable', message: `La fuente ${f.family} (${f.variant}) no está disponible.`, path: `fonts/${f.family}:${f.variant}` })
    for (const row of forbiddenLicenses(core.manifest)) errors.push({ code: 'license_forbidden', message: 'Una licencia impide redistribuir el recurso.', path: `licenses/${row.subject}` })
    const report = buildReport(core.manifest, core.portable, core.fonts)
    if (report.licenses.some((l) => l.redistribution === 'unknown')) warnings.push({ code: 'license_unknown', message: 'Hay licencias sin verificar: acepta el aviso antes de usar el recurso.' })
    if (report.personalData.length) warnings.push({ code: 'personal_data_detected', message: 'Algún texto parece contener datos personales (correo o teléfono).' })
    if (report.losses.length) warnings.push({ code: 'compatibility_losses', message: 'El paquete declara pérdidas de compatibilidad.' })
    return { ok: errors.length === 0, errors, warnings, manifest: core.manifest, report, digest: digestOfBytes }
  } catch (error) {
    if (error instanceof TypeError && /^(INVALID_LIMITS|BYTES_MUST)/.test(error.message)) throw error
    const reason = error instanceof PackageError ? error.reason : 'document_invalid'
    return { ok: false, errors: [{ code: reason, message: error instanceof PackageError ? error.message : 'El paquete no se pudo leer de forma segura.' }], warnings: [], manifest: error?.manifest ?? null, report: null, digest: digestOfBytes }
  }
}
