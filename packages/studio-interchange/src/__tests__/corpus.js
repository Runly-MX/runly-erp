// Functional corpus for the shared validators: real, deterministic archives built with the
// real writers (and, for hostile cases, with JSZip directly). `scripts/write-interchange-corpus.mjs`
// writes them to packages/studio-interchange/corpus/ with expected.json so the Developer Hub (H3)
// and any other consumer can replay the same cases without this repo's test helpers.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import sharp from 'sharp'
import JSZip from 'jszip'
import { appendObject, blankDocument } from '../studio/document.js'
import { exportStudioPackage, writePackageZip } from '../write.js'
import { PACKAGE_MIME, readPackageZip } from '../inspect.js'
import { WEBSITE_TEMPLATE, catalogDigest } from '../website-template.js'
import { readZip } from '../zip-reader.js'

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
const FILE_ID = '00000000-0000-4000-8000-000000000001'
const catalogUrl = new URL('../../../../apps/api/src/routes/website/block-catalog.json', import.meta.url)
export const BUILDER = '0.3.5'
export const blockCatalog = () => JSON.parse(readFileSync(catalogUrl, 'utf8'))
export const builderCatalogs = () => ({ [BUILDER]: blockCatalog() })

// ---- Studio ----
export async function studioDocument() {
  let document = appendObject(blankDocument(320, 240), 'image', { fileAssetId: FILE_ID })
  document = appendObject(document, 'text', { text: 'Menú del día\nEditable', height: 175, fontFamily: 'Lato', fontVariant: 'bold' })
  document.additionalPages = [{ page: { id: 'p2', width: 240, height: 320, background: '#ffffff' }, objects: [] }]
  return document
}
export const studioImage = () => sharp({ create: { width: 20, height: 10, channels: 3, background: '#ff0000' } }).png().toBuffer()
export async function validStudio(overrides = {}) {
  const image = await studioImage()
  return exportStudioPackage({ document: await studioDocument(), title: 'Menú de ejemplo', author: 'Runly', readAsset: async () => ({ bytes: image, mime: 'image/png', license: { id: 'CC-BY-4.0', author: 'Runly', notice: 'Imagen de ejemplo', redistribution: 'allowed' } }), licenseFiles: { 'licenses/notice.txt': 'Declaración de licencia como datos.' }, ...overrides })
}
// Rewrites manifest/document of a package and keeps the document inventory consistent.
export async function repack(bytes, edit, { fixInventory = true } = {}) {
  const files = await readPackageZip(bytes)
  const manifest = JSON.parse(files.get('manifest.json')), document = JSON.parse(files.get('document.json'))
  const extra = (await edit({ manifest, document, files })) ?? []
  const documentBytes = Buffer.from(JSON.stringify(document))
  if (fixInventory) manifest.document = { path: 'document.json', sha256: sha(documentBytes), bytes: documentBytes.length }
  const entries = [['mimetype', Buffer.from(PACKAGE_MIME)], ['manifest.json', Buffer.from(JSON.stringify(manifest))], ['document.json', documentBytes]]
  for (const [name, value] of files) if (!['mimetype', 'manifest.json', 'document.json'].includes(name)) entries.push([name, value])
  return writePackageZip([...entries, ...extra])
}
const zipOf = async (entries, { generate = {}, perFile = {} } = {}) => {
  const zip = new JSZip()
  for (const [name, bytes] of entries) zip.file(name, bytes, { compression: name === 'mimetype' ? 'STORE' : 'DEFLATE', createFolders: false, date: new Date('2000-01-01T00:00:00Z'), unixPermissions: 0o100644, ...(perFile[name] ?? {}) })
  return zip.generateAsync({ type: 'nodebuffer', platform: 'UNIX', ...generate })
}

export async function studioCorpus() {
  const valid = await validStudio()
  const bomb = await zipOf([['mimetype', Buffer.from(PACKAGE_MIME)], ['manifest.json', Buffer.from('{}')], ['document.json', Buffer.alloc(5 * 1024 * 1024, 0x20)]])
  return {
    'studio/valid.runlystudio': { bytes: valid, expect: { ok: true, codes: [] } },
    'studio/unknown-font.runlystudio': { bytes: await repack(valid, ({ manifest, document }) => { manifest.fonts[0].family = 'Fuente Inexistente'; document.objects.find((o) => o.type === 'text').fontFamily = 'Fuente Inexistente' }), expect: { ok: false, codes: ['font_unavailable'] } },
    'studio/forbidden-license.runlystudio': { bytes: await repack(valid, ({ manifest }) => { manifest.resources[0].license.redistribution = 'forbidden' }, { fixInventory: false }), expect: { ok: false, codes: ['license_forbidden'] } },
    'studio/zip-bomb.runlystudio': { bytes: bomb, expect: { ok: false, codes: ['zip_limit_exceeded'] } },
    'studio/symlink-entry.runlystudio': { bytes: await zipOf([['mimetype', Buffer.from(PACKAGE_MIME)], ['manifest.json', Buffer.from('{}')], ['document.json', Buffer.from('{}')]], { perFile: { 'document.json': { unixPermissions: 0o120777 } } }), expect: { ok: false, codes: ['zip_unsafe_entry'] } },
    'studio/path-traversal.runlystudio': { bytes: await zipOf([['mimetype', Buffer.from(PACKAGE_MIME)], ['manifest.json', Buffer.from('{}')], ['assets/../x.txt', Buffer.from('x')]]), expect: { ok: false, codes: ['zip_unsafe_entry'] } },
    'studio/data-descriptor.runlystudio': { bytes: await zipOf([['mimetype', Buffer.from(PACKAGE_MIME)], ['manifest.json', Buffer.from('{}')], ['document.json', Buffer.from('{}')]], { generate: { streamFiles: true } }), expect: { ok: false, codes: ['zip_unsafe_entry'] } },
    'studio/newer-format.runlystudio': { bytes: await repack(valid, ({ manifest }) => { manifest.formatVersion = 2 }, { fixInventory: false }), expect: { ok: false, codes: ['format_unsupported'] } },
    'studio/newer-document-schema.runlystudio': { bytes: await repack(valid, ({ manifest }) => { manifest.documentSchemaVersion = 8 }, { fixInventory: false }), expect: { ok: false, codes: ['format_unsupported'] } },
    'studio/tampered-document.runlystudio': { bytes: await repack(valid, ({ document }) => { document.page.background = '#000000' }, { fixInventory: false }), expect: { ok: false, codes: ['checksum_mismatch'] } },
    'studio/undeclared-entry.runlystudio': { bytes: await repack(valid, () => [['licenses/oculta.txt', Buffer.from('no declarada')]]), expect: { ok: false, codes: ['undeclared_entry'] } },
    'studio/page-count-mismatch.runlystudio': { bytes: await repack(valid, ({ manifest }) => { manifest.pageCount = 1 }), expect: { ok: false, codes: ['page_count_mismatch'] } },
    'studio/image-size-lie.runlystudio': { bytes: await repack(valid, ({ manifest }) => { manifest.resources[0].width = 21 }), expect: { ok: false, codes: ['image_invalid'] } },
  }
}

// ---- Website ----
export const section = (type, props = {}, children) => ({ type, props, ...(children ? { children } : {}) })
export const homeSections = () => [
  section('NavbarBlock', { brand: 'Casa Lupita', links: 'Inicio | /\nContacto | /contacto', ctaLabel: 'Reservar', ctaHref: '/contacto' }),
  section('HeroBlock', { title: 'Cocina de casa', subtitle: 'Menú del día y platillos de temporada.', ctaLabel: 'Ver contacto', ctaHref: '/contacto' }),
  section('RichTextBlock', { html: '<p>Abrimos de <strong>martes a domingo</strong>. Más en <a href="https://example.org/guia">nuestra guía</a>.</p>' }),
]
export const contactSections = () => [section('NavbarBlock', { brand: 'Casa Lupita' }), section('ContactFormBlock', { formId: '@contact', successMessage: 'Gracias, te escribiremos pronto.', buttonLabel: 'Enviar' })]

// Builds a template archive; every file except mimetype/manifest is inventoried with its hash.
export async function websiteTemplate({ pages = { 'pages/home.json': homeSections(), 'pages/contact.json': contactSections() }, theme = { colors: { primary: '#ff5e14' }, fonts: { heading: 'Lato', body: 'Lato' }, radius: 8 }, manifest = {}, extra = [], catalog = blockCatalog(), raw = {} } = {}) {
  const entries = new Map()
  for (const [path, content] of Object.entries(pages)) entries.set(path, Buffer.from(typeof content === 'string' ? content : JSON.stringify(content)))
  if (theme) entries.set('theme.json', Buffer.from(JSON.stringify(theme)))
  for (const [path, bytes] of [...extra, ...Object.entries(raw)]) entries.set(path, Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes))
  const files = [...entries].map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: sha(bytes) })).sort((a, b) => (a.path < b.path ? -1 : 1))
  const base = {
    format: WEBSITE_TEMPLATE.format, formatVersion: 1, minReaderVersion: 1,
    builder: { name: WEBSITE_TEMPLATE.builder, min: BUILDER, catalogDigest: catalogDigest(catalog) },
    siteKind: 'restaurant', title: 'Casa Lupita', summary: 'Sitio de un restaurante.', locale: 'es',
    pages: [{ path: '/', file: 'pages/home.json', title: 'Inicio', isHome: true }, { path: '/contacto', file: 'pages/contact.json', title: 'Contacto', isHome: false }],
    assets: [], forms: ['@contact'], document: { files }, licenses: [],
  }
  const merged = { ...base, ...manifest }
  return writePackageZip([['mimetype', Buffer.from(WEBSITE_TEMPLATE.mime)], ['manifest.json', Buffer.from(JSON.stringify(merged))], ...entries])
}

async function addEntry(bytes, name, content) {
  const files = await readZip(bytes, { mimetype: WEBSITE_TEMPLATE.mime, folders: ['assets', 'previews', 'licenses', 'pages'] })
  return writePackageZip([...files, [name, content]])
}

export async function websiteCorpus() {
  const valid = await websiteTemplate()
  const withPage = (sections) => websiteTemplate({ pages: { 'pages/home.json': sections, 'pages/contact.json': contactSections() } })
  const png = await studioImage()
  const asset = { id: `asset-${sha(png)}`, path: `assets/${sha(png)}.png`, mime: 'image/png', width: 20, height: 10, bytes: png.length, sha256: sha(png), license: 'CC0-1.0' }
  return {
    'website/valid.zip': { bytes: valid, expect: { ok: true, codes: [] } },
    'website/unknown-block.zip': { bytes: await withPage([section('ScriptRunnerBlock', {})]), expect: { ok: false, codes: ['block_unknown'] } },
    'website/excluded-embed-block.zip': { bytes: await withPage([section('VideoBlock', { src: 'https://video.example/x.mp4' })]), expect: { ok: false, codes: ['block_unknown'] } },
    'website/dangerous-property.zip': { bytes: await withPage([section('HeroBlock', { title: 'Hola', onClick: 'alert(1)', customCss: 'body{display:none}' })]), expect: { ok: false, codes: ['prop_unknown'] } },
    'website/html-in-text.zip': { bytes: await withPage([section('HeroBlock', { title: '<img src=x onerror=alert(1)>' })]), expect: { ok: false, codes: ['prop_invalid'] } },
    'website/rich-text-script.zip': { bytes: await withPage([section('RichTextBlock', { html: '<p>Hola</p><script>alert(1)</script>' })]), expect: { ok: false, codes: ['rich_text_unsafe'] } },
    'website/unsafe-href.zip': { bytes: await withPage([section('HeroBlock', { ctaHref: 'javascript:alert(1)' })]), expect: { ok: false, codes: ['href_unsafe'] } },
    'website/external-form-destination.zip': { bytes: await withPage([section('ContactFormBlock', { formId: 'https://evil.example/collect' })]), expect: { ok: false, codes: ['prop_invalid'] } },
    'website/unknown-form-marker.zip': { bytes: await withPage([section('ContactFormBlock', { formId: '@payments' })]), expect: { ok: false, codes: ['form_marker_unknown'] } },
    'website/assets-not-allowed.zip': { bytes: await websiteTemplate({ manifest: { assets: [asset] }, extra: [[asset.path, png]] }), expect: { ok: false, codes: ['asset_limit'] } },
    'website/external-image.zip': { bytes: await withPage([section('ImageBlock', { src: 'https://img.example/x.png', alt: 'x' })]), expect: { ok: false, codes: ['prop_invalid'] } },
    'website/builder-incompatible.zip': { bytes: await websiteTemplate({ manifest: { builder: { name: WEBSITE_TEMPLATE.builder, min: '9.9.9', catalogDigest: 'a'.repeat(64) } } }), expect: { ok: false, codes: ['builder_unsupported'] } },
    'website/catalog-mismatch.zip': { bytes: await websiteTemplate({ manifest: { builder: { name: WEBSITE_TEMPLATE.builder, min: BUILDER, catalogDigest: 'b'.repeat(64) } } }), expect: { ok: false, codes: ['catalog_digest_mismatch'] } },
    'website/no-home.zip': { bytes: await websiteTemplate({ manifest: { pages: [{ path: '/', file: 'pages/home.json', title: 'Inicio', isHome: false }, { path: '/contacto', file: 'pages/contact.json', title: 'Contacto', isHome: false }] } }), expect: { ok: false, codes: ['home_missing'] } },
    'website/bad-theme.zip': { bytes: await websiteTemplate({ theme: { colors: { primary: 'url(https://evil.example/x)' } } }), expect: { ok: false, codes: ['theme_invalid'] } },
    'website/newer-format.zip': { bytes: await websiteTemplate({ manifest: { formatVersion: 2 } }), expect: { ok: false, codes: ['format_unsupported'] } },
    'website/undeclared-entry.zip': { bytes: await addEntry(valid, 'previews/extra.png', Buffer.from('no declarado')), expect: { ok: false, codes: ['undeclared_entry'] } },
  }
}
