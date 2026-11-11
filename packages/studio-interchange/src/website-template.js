import { createHash } from 'node:crypto'
import { z } from 'zod'
import { STUDIO_FONTS } from './studio/fonts.js'
import { PACKAGE_LIMITS } from './limits.js'
import { PackageError, packageError } from './errors.js'
import { readZip, shaPattern } from './zip-reader.js'
import { validateImage } from './inspect.js'

// Website template (ERP E1a Annex B + W1): a DECLARATIVE ZIP. Only data: nothing is evaluated,
// imported or executed, no network is touched, no script/HTML/CSS/SVG/iframe is admitted and
// forms are markers, never destinations. Pure and safe on hostile bytes (never throws on input).
export const WEBSITE_TEMPLATE = Object.freeze({
  format: 'runly.website-template', formatVersion: 2, minReaderVersion: 2,
  mime: 'application/vnd.runly.website-template+zip', builder: '@raulbellosom/atlas-web-builder',
})
const MiB = 1024 * 1024
// W1 is an explicit reader/policy revision. Legacy v1 remains image-free.
export const WEBSITE_ASSET_POLICY = Object.freeze({ name: 'packaged-raster-v1', version: 1 })
export const WEBSITE_LIMITS_VERSION = 2
export const WEBSITE_LIMITS_CEILING = Object.freeze({ compressed: 25 * MiB, expanded: 128 * MiB, entry: 10 * MiB, entries: 256, ratio: 200, folders: 32, depth: 3, pages: 24, blocksPerPage: 300, blocksTotal: 1500, blockDepth: 6, assets: 100, assetBytes: 64 * MiB, jsonBytes: 4 * MiB, previews: 6, previewBytes: MiB, previewSide: 1920 })
export const WEBSITE_LIMITS = WEBSITE_LIMITS_CEILING
export function resolveWebsiteLimits(overrides = {}) {
  if (overrides === null || typeof overrides !== 'object' || Array.isArray(overrides)) throw new TypeError('INVALID_LIMITS')
  const limits = { ...WEBSITE_LIMITS }
  for (const [key, value] of Object.entries(overrides)) {
    if (!Object.hasOwn(WEBSITE_LIMITS_CEILING, key) || !Number.isInteger(value) || value < 0) throw new TypeError(`INVALID_LIMITS:${key}`)
    limits[key] = Math.min(value, WEBSITE_LIMITS_CEILING[key])
  }
  return Object.freeze(limits)
}

// Ties a template to an exact set of blocks: sha256 of the canonical (sorted-keys) JSON of the catalog.
export function catalogDigest(catalog) {
  const sort = (v) => (Array.isArray(v) ? v.map(sort) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort(v[k])])) : v)
  return createHash('sha256').update(JSON.stringify(sort(catalog))).digest('hex')
}

const SITE_GROUPS = { website: [], landing: [], blog: [], ecommerce: ['ecommerce'], bookings: ['bookings'], restaurant: ['restaurant'] }
// Blocks that embed third-party media or tie the page to a live commerce/account system never ship in a template.
const EXCLUDED_BLOCKS = new Set(['VideoBlock', 'CartBlock', 'CartPageBlock', 'AccountPortalBlock'])
const FORM_MARKERS = ['@contact', '@newsletter']
const TEXT_LIMITS = { text: 2000, textarea: 8000, 'rich-text': 20000 }
const SAFE_HREF = /^(https?:\/\/|mailto:|tel:|\/(?!\/)|#)/i
const UNSAFE_TEXT = /javascript:|vbscript:|data:text\/html|expression\s*\(/i
// eslint-disable-next-line no-control-regex -- same control-character rule as the feed
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/
const MARKUP = /<\s*\/?\s*[a-z!?]/i
const RICH_TAGS = new Set(['p', 'br', 'strong', 'em', 'u', 'ul', 'ol', 'li', 'h2', 'h3', 'h4', 'blockquote', 'a'])
const SEMVER = /^\d{1,9}\.\d{1,9}\.\d{1,9}(?:[-+][0-9A-Za-z.-]{1,100})?$/
const ASSET_REF = /^asset:([a-f0-9]{64})$/
const digest = z.string().regex(shaPattern)
const inventory = z.strictObject({ path: z.string().max(160), bytes: z.number().int().min(0).max(10 * MiB), sha256: digest })
const asset = z.strictObject({ id: z.string().regex(/^asset-[a-f0-9]{64}$/), path: z.string().max(160), mime: z.enum(['image/png', 'image/jpeg', 'image/webp']), width: z.number().int().positive().max(8192), height: z.number().int().positive().max(8192), bytes: z.number().int().min(0).max(10 * MiB), sha256: digest, license: z.string().max(120) })
const manifestV1 = z.strictObject({
  format: z.literal('runly.website-template'), formatVersion: z.literal(1), minReaderVersion: z.literal(1),
  builder: z.strictObject({ name: z.literal(WEBSITE_TEMPLATE.builder), min: z.string().regex(SEMVER), catalogDigest: digest }),
  siteKind: z.enum(['website', 'landing', 'blog', 'ecommerce', 'bookings', 'restaurant']),
  title: z.string().trim().min(1).max(160), summary: z.string().max(280).default(''), locale: z.enum(['es', 'en']),
  pages: z.array(z.strictObject({ path: z.string().regex(/^\/(?:[a-z0-9-]+(?:\/[a-z0-9-]+)*)?$/).max(120), file: z.string().regex(/^pages\/[a-z0-9][a-z0-9-]{0,60}\.json$/), title: z.string().trim().min(1).max(160), isHome: z.boolean() })).min(1).max(24),
  assets: z.array(asset).max(100),
  forms: z.array(z.enum(FORM_MARKERS)).max(2),
  document: z.strictObject({ files: z.array(inventory).max(256) }),
  licenses: z.array(z.strictObject({ id: z.string().regex(/^[a-z0-9_-]{1,60}$/), path: z.string().regex(/^licenses\/[a-z0-9_-]+\.txt$/), redistribution: z.enum(['allowed', 'unknown', 'forbidden']) })).max(100),
})
const manifestV2 = manifestV1.extend({ formatVersion: z.literal(2), minReaderVersion: z.literal(2), assetPolicy: z.literal(WEBSITE_ASSET_POLICY.name) })
export const WEBSITE_MANIFEST_READERS = Object.freeze({ 1: manifestV1, 2: manifestV2 })
export const websiteManifestSchema = z.discriminatedUnion('formatVersion', [manifestV1, manifestV2])
const hexColor = /^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/
const themeSchema = z.strictObject({
  colors: z.record(z.string().regex(/^[a-zA-Z][\w-]{0,40}$/), z.string().regex(hexColor)).default({}),
  fonts: z.strictObject({ heading: z.string().max(100), body: z.string().max(100) }).partial().default({}),
  radius: z.number().min(0).max(64).optional(), spacing: z.number().min(0).max(64).optional(),
})

const hostOf = (value) => { try { return new URL(value).host.toLowerCase() } catch { return null } }
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')

function parseJson(bytes, limit, reason) {
  if (!bytes) throw packageError(reason, 'Falta un archivo obligatorio de la plantilla.')
  if (bytes.length > limit) throw packageError('zip_limit_exceeded', 'Un archivo JSON de la plantilla es demasiado grande.')
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes), (key, value) => { if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('unsafe key'); return value })
  } catch { throw packageError(reason, 'La plantilla no contiene JSON UTF-8 válido.') }
}

// Whitelist for rich text: a fixed tag set and only `href` on `a`; everything else is an error.
export function richTextProblem(html) {
  if (UNSAFE_TEXT.test(html)) return 'contenido no permitido'
  let rest = html
  const tag = /<[^<>]*>/g
  for (const match of html.matchAll(tag)) {
    const token = match[0]
    const m = /^<(\/?)([a-z][a-z0-9]*)(?:\s+href="([^"<>]*)")?\s*(\/?)>$/.exec(token)
    if (!m || !RICH_TAGS.has(m[2])) return `etiqueta no permitida ${token.slice(0, 40)}`
    const [, closing, name, href, selfClosing] = m
    if (href !== undefined && (name !== 'a' || closing || !SAFE_HREF.test(href))) return 'enlace o atributo no permitido'
    if (closing && selfClosing) return 'etiqueta no permitida'
    if (selfClosing && name !== 'br') return 'etiqueta no permitida'
  }
  rest = html.replace(tag, '')
  return /[<>]/.test(rest) ? 'marcado incompleto' : null
}

const catalogIndex = new WeakMap()
function indexOf(catalog) {
  if (!catalogIndex.has(catalog)) catalogIndex.set(catalog, new Map(catalog.blocks.map((block) => [block.type, block])))
  return catalogIndex.get(catalog)
}

function checkProp(field, value, path, ctx) {
  const bad = (code, message) => ctx.error(code, `${path}: ${message}`, path)
  switch (field.type) {
    case 'select': if (!field.options?.includes(String(value))) bad('prop_invalid', `"${value}" no es una opción`); return
    case 'toggle': if (typeof value !== 'boolean') bad('prop_invalid', 'se espera true/false'); return
    case 'number': if (typeof value !== 'number' || !Number.isFinite(value) || (field.min !== undefined && value < field.min) || (field.max !== undefined && value > field.max)) bad('prop_invalid', 'número inválido'); return
    case 'background': {
      if (value === '' || value === null) return
      if (typeof value === 'string') { if (!/^[a-zA-Z][\w-]{0,40}$/.test(value)) bad('prop_invalid', 'token de color inválido'); return }
      if (typeof value !== 'object' || Array.isArray(value) || !['color', 'gradient', 'image'].includes(value.kind)) { bad('prop_invalid', 'fondo no válido'); return }
      for (const [key, inner] of Object.entries(value)) {
        if (typeof inner === 'number' ? !Number.isFinite(inner) : typeof inner !== 'string' && typeof inner !== 'boolean') bad('prop_invalid', `${key}: valor inválido`)
        else if (typeof inner === 'string' && (inner.length > 2048 || UNSAFE_TEXT.test(inner) || /[<>;{}]|url\s*\(|@import/i.test(inner))) bad('prop_invalid', `${key}: valor no permitido`)
      }
      if (value.kind === 'image') ctx.asset(value.url, path)
      return
    }
    case 'image': ctx.asset(value, path); return
    case 'link':
      if (typeof value !== 'string' || value.length > 2048 || CONTROL.test(value)) { bad('href_unsafe', 'enlace no válido'); return }
      if (value !== '' && !SAFE_HREF.test(value)) bad('href_unsafe', 'se admite https, mailto:, tel:, /ruta o #ancla')
      else if (/^https?:\/\//i.test(value)) ctx.link(value)
      return
    default: {
      const limit = TEXT_LIMITS[field.type] ?? 2000
      if (typeof value !== 'string') { bad('prop_invalid', 'se espera texto'); return }
      if (value.length > limit || CONTROL.test(value)) { bad('prop_invalid', `texto no válido (máximo ${limit} caracteres, sin controles)`); return }
      if (field.type === 'rich-text') { const problem = richTextProblem(value); if (problem) bad('rich_text_unsafe', problem); else for (const m of value.matchAll(/href="(https?:\/\/[^"]+)"/gi)) ctx.link(m[1]); return }
      if (UNSAFE_TEXT.test(value) || MARKUP.test(value)) { bad('prop_invalid', 'no se admite HTML ni contenido ejecutable'); return }
      for (const m of value.matchAll(/https?:\/\/[^\s|"')]+/gi)) ctx.link(m[0])
    }
  }
}

function checkBlock(section, path, depth, ctx, page) {
  if (!section || typeof section !== 'object' || Array.isArray(section)) { ctx.error('block_unknown', `${path}: se espera un objeto { type, props }`, path); return }
  for (const key of Object.keys(section)) if (!['type', 'props', 'children'].includes(key)) ctx.error('prop_unknown', `${path}.${key}: clave no permitida`, `${path}.${key}`)
  const definition = ctx.blocks.get(section.type)
  if (!definition || EXCLUDED_BLOCKS.has(definition.type) || !ctx.groups.has(definition.group)) { ctx.error('block_unknown', `${path}.type: bloque no permitido "${String(section.type).slice(0, 60)}"`, `${path}.type`); return }
  if (depth > ctx.limits.blockDepth) { ctx.error('prop_invalid', `${path}: anidación máxima ${ctx.limits.blockDepth}`, path); return }
  page.blocks += 1
  if (page.blocks > ctx.limits.blocksPerPage) { if (page.blocks === ctx.limits.blocksPerPage + 1) ctx.error('page_limit', `${page.file}: máximo ${ctx.limits.blocksPerPage} bloques por página`, page.file); return }
  ctx.types[definition.type] = (ctx.types[definition.type] ?? 0) + 1
  const props = section.props ?? {}
  if (typeof props !== 'object' || Array.isArray(props)) ctx.error('prop_invalid', `${path}.props: se espera un objeto`, `${path}.props`)
  else for (const [key, value] of Object.entries(props)) {
    const field = definition.fields[key], at = `${path}.props.${key}`
    if (!field) { ctx.error('prop_unknown', `${at}: no existe en ${definition.type}`, at); continue }
    if (ctx.version === 1 && (value === null || value === undefined || JSON.stringify(value) === JSON.stringify(definition.defaultProps[key]))) continue
    // Forms are markers, calendars are bound by the ERP: a template never carries a destination.
    if (key === 'formId') { if (!FORM_MARKERS.includes(value) && value !== '') ctx.error(typeof value === 'string' && value.startsWith('@') ? 'form_marker_unknown' : 'prop_invalid', `${at}: usa @contact o @newsletter`, at); else if (value) ctx.forms.add(value); continue }
    if (key === 'calendarId') { if (value !== '') ctx.error('prop_invalid', `${at}: el calendario lo enlaza Runly al aplicar la plantilla`, at); continue }
    checkProp(field, value, at, ctx)
  }
  const children = section.children ?? {}
  if (typeof children !== 'object' || Array.isArray(children)) { ctx.error('prop_invalid', `${path}.children: se espera un objeto`, `${path}.children`); return }
  if (Object.keys(children).length && !definition.slots.length) { ctx.error('prop_invalid', `${path}.children: ${definition.type} no admite bloques hijos`, `${path}.children`); return }
  for (const [slot, list] of Object.entries(children)) {
    if (!definition.slots.includes(slot)) { ctx.error('prop_unknown', `${path}.children.${slot}: slot no válido`, `${path}.children.${slot}`); continue }
    if (!Array.isArray(list)) { ctx.error('prop_invalid', `${path}.children.${slot}: se espera una lista`, `${path}.children.${slot}`); continue }
    list.forEach((child, index) => checkBlock(child, `${path}.children.${slot}[${index}]`, depth + 1, ctx, page))
  }
}

async function validateCore(input, options) {
  let limits = resolveWebsiteLimits(options.limits)
  const files = await readZip(input, { mimetype: WEBSITE_TEMPLATE.mime, folders: ['assets', 'previews', 'licenses', 'pages'], limits: Object.fromEntries(['compressed', 'expanded', 'entry', 'entries', 'ratio', 'folders', 'depth'].map((key) => [key, Math.min(limits[key], PACKAGE_LIMITS[key])])) })
  const raw = parseJson(files.get('manifest.json'), limits.jsonBytes, 'manifest_invalid')
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.format !== WEBSITE_TEMPLATE.format) throw packageError('manifest_invalid', 'El manifiesto no es de una plantilla Website.')
  if (!Number.isInteger(raw.formatVersion) || raw.formatVersion < 1) throw packageError('manifest_invalid', 'Versión de formato no válida.')
  if (raw.formatVersion > WEBSITE_TEMPLATE.formatVersion || raw.minReaderVersion > WEBSITE_TEMPLATE.formatVersion) throw packageError('format_unsupported', 'La plantilla es de una versión más nueva de Runly. Actualiza Runly para usarla.', { manifest: { format: raw.format, formatVersion: raw.formatVersion, minReaderVersion: raw.minReaderVersion } })
  if (raw.formatVersion === 2 && raw.assetPolicy !== WEBSITE_ASSET_POLICY.name) throw packageError('format_unsupported', 'La política de imágenes de esta plantilla no está soportada.')
  let manifest
  try { manifest = websiteManifestSchema.parse(raw) } catch { throw packageError('manifest_invalid', 'El manifiesto de la plantilla no es válido.') }
  if (manifest.formatVersion === 1) limits = { ...limits, assets: 0 }

  const catalogs = options.builderCatalogs
  if (!catalogs || typeof catalogs !== 'object') throw new TypeError('BUILDER_CATALOGS_REQUIRED')
  const catalog = catalogs[manifest.builder.min]
  if (!catalog) throw packageError('builder_unsupported', `La plantilla requiere el builder ${manifest.builder.min}, que esta versión de Runly no incluye.`, { manifest })
  if (catalogDigest(catalog) !== manifest.builder.catalogDigest) throw packageError('catalog_digest_mismatch', 'La plantilla se creó con otra versión del catálogo de bloques.', { manifest })

  // Inventory: every file but mimetype and manifest is declared, with its hash.
  const declared = new Map()
  for (const record of manifest.document.files) {
    if (declared.has(record.path) || ['mimetype', 'manifest.json'].includes(record.path)) throw packageError('manifest_invalid', 'El inventario repite o declara una ruta reservada.')
    declared.set(record.path, record)
    const bytes = files.get(record.path)
    if (!bytes || bytes.length !== record.bytes || sha(bytes) !== record.sha256) throw packageError('checksum_mismatch', 'Falta un archivo o su checksum no coincide.')
  }
  if (files.size !== declared.size + 2) throw packageError('undeclared_entry', 'La plantilla contiene entradas no declaradas.')

  const errors = [], warnings = []
  const ctxBase = { errors, warnings, limits, version: manifest.formatVersion, blocks: indexOf(catalog), groups: new Set(['base', 'universal', ...SITE_GROUPS[manifest.siteKind]]), types: {}, forms: new Set(), links: new Set(), refs: new Set() }
  const assetsById = new Map(manifest.assets.map((a) => [a.sha256, a]))
  const ctx = {
    ...ctxBase,
    error: (code, message, path) => { if (errors.length < 50) errors.push({ code, message, ...(path ? { path } : {}) }) },
    link: (url) => { const host = hostOf(url); if (host) ctxBase.links.add(host) },
    asset: (value, path) => {
      if (value === '' || value === null || value === undefined) return
      const m = typeof value === 'string' ? ASSET_REF.exec(value) : null
      if (!m) { ctx.error('prop_invalid', `${path}: las imágenes deben ser activos del paquete (asset:<sha256>), no URLs`, path); return }
      if (!assetsById.has(m[1])) ctx.error(limits.assets === 0 ? 'asset_limit' : 'asset_missing', `${path}: ${limits.assets === 0 ? 'esta versión no admite imágenes en plantillas' : 'el activo no está declarado'}`, path)
      else ctxBase.refs.add(m[1])
    },
  }

  if (manifest.pages.length > limits.pages) throw packageError('page_limit', 'La plantilla supera el máximo de páginas.')
  if (manifest.pages.filter((p) => p.isHome).length !== 1 || !manifest.pages.some((p) => p.isHome && p.path === '/')) throw packageError('home_missing', 'Debe haber exactamente una página de inicio en la ruta "/".')
  if (new Set(manifest.pages.map((p) => p.path)).size !== manifest.pages.length || new Set(manifest.pages.map((p) => p.file)).size !== manifest.pages.length) throw packageError('manifest_invalid', 'Las páginas repiten ruta o archivo.')
  const pageFiles = new Set(manifest.pages.map((p) => p.file))
  const known = new Set([...pageFiles, 'theme.json', ...manifest.assets.map((a) => a.path), ...manifest.licenses.map((l) => l.path)])
  for (const path of declared.keys()) if (!known.has(path) && !/^previews\/[a-z0-9_-]+\.png$/.test(path)) throw packageError('undeclared_entry', `La plantilla contiene una entrada no admitida: ${path}`)
  for (const file of pageFiles) if (!declared.has(file)) throw packageError('checksum_mismatch', 'Una página del manifiesto no está en el inventario.')

  if (manifest.assets.length > limits.assets) throw packageError('asset_limit', limits.assets === 0 ? 'Esta versión no admite imágenes en plantillas.' : 'La plantilla supera el máximo de activos.')
  for (const key of ['id', 'path', 'sha256']) if (new Set(manifest.assets.map(a => a[key])).size !== manifest.assets.length) throw packageError('manifest_invalid', 'El manifiesto repite un activo.')
  for (const key of ['id', 'path']) if (new Set(manifest.licenses.map(l => l[key])).size !== manifest.licenses.length) throw packageError('manifest_invalid', 'El manifiesto repite una licencia.')
  const licensesById = new Map(manifest.licenses.map(l => [l.id, l]))
  let assetBytes = 0
  for (const a of manifest.assets) {
    const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[a.mime]
    if (a.id !== `asset-${a.sha256}` || a.path !== `assets/${a.sha256}.${ext}` || !declared.has(a.path)) throw packageError('asset_missing', 'Un activo no coincide con su identificador o ruta.')
    const record = declared.get(a.path), bytes = files.get(a.path)
    if (record.sha256 !== a.sha256 || record.bytes !== a.bytes || bytes.length !== a.bytes || sha(bytes) !== a.sha256) throw packageError('checksum_mismatch', 'El inventario del activo no coincide con sus bytes.')
    if (!licensesById.has(a.license)) ctx.error('license_missing', 'El activo debe referenciar una licencia declarada.', a.path)
    assetBytes += bytes.length
    if (assetBytes > limits.assetBytes) throw packageError('zip_limit_exceeded', 'Los activos superan el límite.')
    const size = await validateImage(files.get(a.path), a.mime, { ...PACKAGE_LIMITS })
    if (size.width !== a.width || size.height !== a.height) throw packageError('image_invalid', 'Las dimensiones declaradas no coinciden.')
  }
  if (assetBytes > limits.assetBytes) throw packageError('zip_limit_exceeded', 'Los activos superan el límite.')
  const previews = [...declared.keys()].filter((p) => p.startsWith('previews/'))
  if (previews.length > limits.previews) throw packageError('zip_limit_exceeded', 'Demasiadas vistas previas.')
  for (const path of previews) {
    if (declared.get(path).bytes > limits.previewBytes) throw packageError('zip_limit_exceeded', 'Una vista previa supera 1 MiB.')
    const size = await validateImage(files.get(path), 'image/png', { ...PACKAGE_LIMITS, imageSide: limits.previewSide })
    if (size.width > limits.previewSide || size.height > limits.previewSide) throw packageError('image_limit', 'Una vista previa supera el tamaño permitido.')
  }
  for (const l of manifest.licenses) {
    if (!declared.has(l.path)) throw packageError('checksum_mismatch', 'Una licencia del manifiesto no está en el inventario.')
    let notice
    try { notice = new TextDecoder('utf-8', { fatal: true }).decode(files.get(l.path)) } catch { throw packageError('manifest_invalid', 'El texto de licencia no es UTF-8 válido.') }
    if (manifest.formatVersion === 2 && (!notice.trim() || files.get(l.path).length > 32000)) ctx.error('license_missing', 'La licencia necesita un aviso de hasta 32000 bytes.', l.path)
    if (l.redistribution === 'forbidden') ctx.error('license_forbidden', 'Una licencia impide redistribuir la plantilla.', l.path)
    if (l.redistribution === 'unknown') warnings.push({ code: 'license_unknown', message: 'Derechos de redistribución pendientes de revisión humana.', path: l.path })
  }
  let theme = null
  if (declared.has('theme.json')) {
    theme = parseJson(files.get('theme.json'), limits.jsonBytes, 'theme_invalid')
    const parsed = themeSchema.safeParse(theme)
    if (!parsed.success) ctx.error('theme_invalid', 'theme.json no es válido: solo tokens de color #rrggbb, fuentes de la lista cerrada, radio y espaciado numéricos.', 'theme.json')
    else for (const family of Object.values(parsed.data.fonts)) if (!STUDIO_FONTS.some((f) => f.family === family)) ctx.error('theme_invalid', `theme.json: la fuente "${family}" no está en la lista permitida.`, 'theme.json')
  }

  const reportPages = [], pages = []
  let total = 0
  for (const page of manifest.pages) {
    const content = parseJson(files.get(page.file), limits.jsonBytes, 'prop_invalid')
    pages.push({ ...page, sections: content })
    const state = { blocks: 0, file: page.file }
    if (!Array.isArray(content) || !content.length) ctx.error('prop_invalid', `${page.file}: se espera una lista de secciones`, page.file)
    else content.forEach((section, index) => checkBlock(section, `${page.file}[${index}]`, 1, ctx, state))
    total += state.blocks
    reportPages.push({ path: page.path, title: page.title, blocks: state.blocks })
  }
  if (total > limits.blocksTotal) ctx.error('page_limit', `La plantilla supera ${limits.blocksTotal} bloques en total.`)
  for (const marker of ctx.forms) if (!manifest.forms.includes(marker)) ctx.error('form_marker_unknown', `El marcador ${marker} se usa pero no está declarado en el manifiesto.`)
  for (const a of manifest.assets) if (!ctxBase.refs.has(a.sha256)) warnings.push({ code: 'asset_unreferenced', message: `El activo ${a.path} no se usa en ninguna página.`, path: a.path })
  const report = {
    pages: reportPages, blockTypes: Object.fromEntries(Object.keys(ctx.types).sort().map((k) => [k, ctx.types[k]])),
    assets: manifest.assets.map((a) => ({ id: a.id, path: a.path, mime: a.mime, width: a.width, height: a.height, bytes: a.bytes })),
    forms: [...manifest.forms].sort(), externalLinks: [...ctxBase.links].sort(), siteKind: manifest.siteKind, builder: { name: manifest.builder.name, min: manifest.builder.min },
    formatVersion: manifest.formatVersion, assetPolicy: manifest.assetPolicy ?? null, limitsVersion: WEBSITE_LIMITS_VERSION,
    licenses: manifest.licenses.map(l => ({ id: l.id, redistribution: l.redistribution })),
  }
  return { manifest, report, errors, warnings, content: { pages, theme, assets: manifest.assets.map(a => ({ ...a, data: files.get(a.path) })) } }
}

// Contract API (Annex B): never throws on hostile input; `digest` is always the sha256 of the bytes.
export async function inspectWebsiteTemplate(bytes, options = {}) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('BYTES_MUST_BE_UINT8ARRAY')
  resolveWebsiteLimits(options.limits)
  const digestOfBytes = sha(bytes)
  try {
    const result = await validateCore(bytes, options)
    return { ok: result.errors.length === 0, errors: result.errors, warnings: result.warnings, manifest: result.manifest, report: result.report, digest: digestOfBytes, ...(result.errors.length ? {} : { content: result.content }) }
  } catch (error) {
    if (error instanceof TypeError && /^(INVALID_LIMITS|BYTES_MUST|BUILDER_CATALOGS)/.test(error.message)) throw error
    const reason = error instanceof PackageError ? error.reason : 'zip_invalid'
    return { ok: false, errors: [{ code: reason, message: error instanceof PackageError ? error.message : 'La plantilla no se pudo leer de forma segura.' }], warnings: [], manifest: error?.manifest ?? null, report: null, digest: digestOfBytes }
  }
}

// Validation evidence never includes page content or asset bytes.
export async function validateWebsiteTemplate(bytes, options = {}) {
  const { content: _content, ...validation } = await inspectWebsiteTemplate(bytes, options)
  return validation
}
