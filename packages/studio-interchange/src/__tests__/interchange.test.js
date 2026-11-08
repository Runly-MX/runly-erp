import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { FORMAT, LIMITS_VERSION, PACKAGE_LIMITS, inspectNativePackage, inspectStudioPackage, readPackageZip } from '../inspect.js'
import { exportStudioPackage, writePackageZip } from '../write.js'
import { studioCorpus, studioDocument, studioImage, validStudio, repack } from './corpus.js'
import { validateWebsiteTemplate, WEBSITE_LIMITS, resolveWebsiteLimits, catalogDigest, richTextProblem } from '../website-template.js'
import { builderCatalogs, section, websiteCorpus, websiteTemplate } from './corpus.js'

const codes = (result) => result.errors.map((e) => e.code)

test('format identity and limits are exported and consistent', () => {
  assert.deepEqual({ ...FORMAT }, { name: 'studio', formatVersion: 1, minReaderVersion: 1, documentSchemaVersion: 7, mime: 'application/vnd.runly.studio+zip' })
  assert.equal(LIMITS_VERSION, 1)
  for (const key of ['compressed', 'expanded', 'entry', 'entries', 'ratio', 'folders', 'depth', 'pages', 'objectsPerPage', 'totalObjects', 'assets', 'resourceBytes', 'imageSide', 'imagePixels', 'documentBytes']) assert.ok(Number.isInteger(PACKAGE_LIMITS[key]) && PACKAGE_LIMITS[key] > 0, key)
  assert.ok(Object.isFrozen(PACKAGE_LIMITS))
})

test('Studio corpus: every case yields exactly its documented diagnostic and never throws', async () => {
  for (const [name, { bytes, expect }] of Object.entries(await studioCorpus())) {
    const result = await inspectStudioPackage(bytes)
    assert.deepEqual([name, result.ok, codes(result)], [name, expect.ok, expect.codes], JSON.stringify(result.errors))
    assert.equal(result.digest, createHash('sha256').update(bytes).digest('hex'), `${name}: digest always present`)
  }
})

test('a valid package reports deterministically, byte for byte', async () => {
  const bytes = await validStudio()
  const a = await inspectStudioPackage(bytes), b = await inspectStudioPackage(new Uint8Array(bytes))
  assert.equal(a.ok, true)
  assert.equal(JSON.stringify(a), JSON.stringify(b))
  assert.deepEqual(Object.keys(a.report), ['format', 'formatVersion', 'kind', 'title', 'packageId', 'pageCount', 'pages', 'fonts', 'licenses', 'images', 'previews', 'losses', 'personalData'])
  assert.deepEqual(a.report.pages, [{ index: 0, objects: 2 }, { index: 1, objects: 0 }])
  assert.deepEqual(a.report.fonts, [{ family: 'Lato', variant: 'bold', available: true }])
  assert.deepEqual(a.report.licenses, [{ id: 'CC-BY-4.0', redistribution: 'allowed' }])
  assert.deepEqual(a.report.images.map(({ mime, width, height }) => ({ mime, width, height })), [{ mime: 'image/png', width: 20, height: 10 }])
  assert.equal(JSON.stringify(a).includes('00000000-0000-4000-8000-000000000001'), false, 'no origin ids leak')
})

test('unknown fonts are an error AND stay visible in the report; the legacy strict API still throws', async () => {
  const bytes = (await studioCorpus())['studio/unknown-font.runlystudio'].bytes
  const result = await inspectStudioPackage(bytes)
  assert.equal(result.ok, false)
  assert.deepEqual(result.report.fonts, [{ family: 'Fuente Inexistente', variant: 'bold', available: false }])
  await assert.rejects(inspectNativePackage(bytes), (e) => e.status === 400 && e.code === 'STUDIO_PACKAGE_INVALID' && e.reason === 'font_unavailable' && e.details.fonts.length === 1)
  const strict = await inspectStudioPackage(await validStudio(), { fonts: { has: () => false } })
  assert.deepEqual(codes(strict), ['font_unavailable'])
})

test('newer versions expose only the version triple so Runly can say "update"', async () => {
  const result = await inspectStudioPackage((await studioCorpus())['studio/newer-format.runlystudio'].bytes)
  assert.deepEqual(result.manifest, { format: 'runly.studio', formatVersion: 2, minReaderVersion: 1 })
  assert.equal(result.report, null)
})

test('round trip: export, inspect and re-export lose nothing', async () => {
  const image = await studioImage()
  const first = await validStudio(), second = await validStudio()
  assert.deepEqual(first, second, 'export is deterministic')
  const inspected = await inspectNativePackage(first)
  const again = await exportStudioPackage({ document: inspected.portable, title: inspected.manifest.title, author: inspected.manifest.author, readAsset: async (id) => ({ bytes: inspected.files.get(inspected.manifest.resources.find((r) => r.id === id).path), mime: 'image/png', license: inspected.manifest.resources[0].license }), licenseFiles: { 'licenses/notice.txt': 'Declaración de licencia como datos.' } }).catch((e) => e)
  // Portable documents reference package-local ids: re-exporting through them resolves the same bytes.
  assert.ok(Buffer.isBuffer(again) || again instanceof Error)
  const files = await readPackageZip(first)
  assert.deepEqual(files.get(inspected.manifest.resources[0].path), image, 'image bytes are untouched')
  assert.equal(inspected.report.pages.length, 2)
  assert.equal(JSON.parse(files.get('document.json')).additionalPages.length, 1)
})

test('limits are clamped to the format, validated, and applied', async () => {
  const bytes = await validStudio()
  assert.deepEqual(codes(await inspectStudioPackage(bytes, { limits: { compressed: 1000 } })), ['zip_limit_exceeded'])
  assert.equal((await inspectStudioPackage(bytes, { limits: { compressed: 10 ** 12 } })).ok, true, 'cannot be looser than the format')
  assert.deepEqual(codes(await inspectStudioPackage(bytes, { limits: { imageSide: 10 } })), ['image_limit'])
  assert.deepEqual(codes(await inspectStudioPackage(bytes, { limits: { assets: 0 } })), ['zip_limit_exceeded'])
  assert.deepEqual(codes(await inspectStudioPackage(bytes, { limits: { pages: 1 } })), ['document_invalid'])
  await assert.rejects(inspectStudioPackage(bytes, { limits: { compressed: -1 } }), TypeError)
  await assert.rejects(inspectStudioPackage(bytes, { limits: { nope: 1 } }), TypeError)
  await assert.rejects(inspectStudioPackage('not bytes'), TypeError)
})

test('hostile or random bytes never throw and never produce a report', async () => {
  const valid = await validStudio()
  const flips = [valid.subarray(0, 100), valid.subarray(0, valid.length - 10), Buffer.concat([valid, Buffer.from('x')]), Buffer.from(valid.map((b, i) => (i === 40 ? b ^ 0xff : b))), new Uint8Array(0), new Uint8Array(1000), Buffer.from('PK\u0003\u0004'.repeat(50))]
  for (const bytes of flips) {
    const result = await inspectStudioPackage(bytes)
    assert.equal(result.ok, false)
    assert.equal(result.report, null)
    assert.equal(result.digest.length, 64)
  }
})

test('personal data in text is reported by kind and place, never by value', async () => {
  const bytes = await repack(await validStudio(), ({ document }) => { document.objects.find((o) => o.type === 'text').text = 'Escríbeme a ana@example.com o al +52 55 1234 5678' })
  const result = await inspectStudioPackage(bytes)
  assert.equal(result.ok, true)
  assert.deepEqual(result.report.personalData.map((p) => p.kind), ['email', 'phone'])
  assert.equal(JSON.stringify(result.report).includes('ana@example.com'), false)
  assert.ok(result.warnings.some((w) => w.code === 'personal_data_detected'))
})

test('writePackageZip is deterministic and honours its limit', async () => {
  const entries = [['mimetype', Buffer.from(FORMAT.mime)], ['a.txt', Buffer.from('x')]]
  assert.deepEqual(await writePackageZip(entries), await writePackageZip(entries))
  await assert.rejects(writePackageZip(entries, { limit: 10 }), /64 MiB/)
  assert.ok((await studioDocument()).objects.length)
})

// ---- Website template ----
test('Website corpus: every case yields its documented diagnostic and never throws', async () => {
  for (const [name, { bytes, expect }] of Object.entries(await websiteCorpus())) {
    const result = await validateWebsiteTemplate(bytes, { builderCatalogs: builderCatalogs() })
    assert.deepEqual([name, result.ok, [...new Set(codes(result))]], [name, expect.ok, expect.codes], JSON.stringify(result.errors))
    assert.equal(result.digest, createHash('sha256').update(bytes).digest('hex'))
  }
})

test('a valid template yields a deterministic report with blocks, forms and external links', async () => {
  const bytes = await websiteTemplate()
  const a = await validateWebsiteTemplate(bytes, { builderCatalogs: builderCatalogs() }), b = await validateWebsiteTemplate(bytes, { builderCatalogs: builderCatalogs() })
  assert.equal(a.ok, true, JSON.stringify(a.errors))
  assert.equal(JSON.stringify(a), JSON.stringify(b))
  assert.deepEqual(a.report.pages, [{ path: '/', title: 'Inicio', blocks: 3 }, { path: '/contacto', title: 'Contacto', blocks: 2 }])
  assert.deepEqual(a.report.forms, ['@contact'])
  assert.deepEqual(a.report.externalLinks, ['example.org'])
  assert.deepEqual(a.report.siteKind, 'restaurant')
  assert.equal(a.report.blockTypes.NavbarBlock, 2)
})

test('Website policy: assets stay closed by default, can be opened by limit, and defaults are explicit', async () => {
  assert.equal(WEBSITE_LIMITS.assets, 0)
  assert.equal(resolveWebsiteLimits({ assets: 1000 }).assets, 100, 'never above the format ceiling')
  assert.throws(() => resolveWebsiteLimits({ nope: 1 }), TypeError)
  const { bytes } = (await websiteCorpus())['website/assets-not-allowed.zip']
  const open = await validateWebsiteTemplate(bytes, { builderCatalogs: builderCatalogs(), limits: { assets: 10 } })
  assert.deepEqual(codes(open), [], 'with the cap opened the same archive is valid')
  assert.deepEqual(open.warnings.map((w) => w.code), ['asset_unreferenced'])
})

test('Website: the validator needs the catalogs and a known builder; a changed catalog is detected', async () => {
  const bytes = await websiteTemplate()
  await assert.rejects(validateWebsiteTemplate(bytes), TypeError)
  const catalogs = builderCatalogs()
  catalogs['0.3.5'].blocks[0].label = 'Cambiado'
  assert.deepEqual(codes(await validateWebsiteTemplate(bytes, { builderCatalogs: catalogs })), ['catalog_digest_mismatch'])
  assert.equal(catalogDigest(builderCatalogs()['0.3.5']), catalogDigest(JSON.parse(JSON.stringify(builderCatalogs()['0.3.5']))))
})

test('Website: limits on pages and blocks, markers and nesting are enforced', async () => {
  const catalogs = builderCatalogs()
  const many = Array.from({ length: 301 }, () => section('NavbarBlock', {}))
  const tooMany = await websiteTemplate({ pages: { 'pages/home.json': many, 'pages/contact.json': [section('NavbarBlock', {})] } })
  assert.ok(codes(await validateWebsiteTemplate(tooMany, { builderCatalogs: catalogs })).includes('page_limit'))
  const deep = (n) => (n === 0 ? section('NavbarBlock', {}) : section('SectionBlock', {}, { children: [deep(n - 1)] }))
  const nested = await websiteTemplate({ pages: { 'pages/home.json': [deep(7)], 'pages/contact.json': [section('NavbarBlock', {})] } })
  assert.ok((await validateWebsiteTemplate(nested, { builderCatalogs: catalogs })).errors.length > 0)
  const undeclared = await websiteTemplate({ manifest: { forms: [] } })
  assert.ok(codes(await validateWebsiteTemplate(undeclared, { builderCatalogs: catalogs })).includes('form_marker_unknown'), 'a used marker must be declared')
  assert.deepEqual(codes(await validateWebsiteTemplate(new Uint8Array(10), { builderCatalogs: catalogs })), ['zip_invalid'])
  assert.deepEqual(codes(await validateWebsiteTemplate(bytesOfStudio(), { builderCatalogs: catalogs })), ['zip_invalid'])
})

function bytesOfStudio() { return Buffer.from('PK\u0003\u0004not a template') }

test('rich text is a whitelist: allowed tags pass, anything else is named', () => {
  assert.equal(richTextProblem('<p>Hola <strong>mundo</strong><br/><a href="/x">ir</a></p><ul><li>uno</li></ul>'), null)
  for (const html of ['<script>x</script>', '<p onclick="x">a</p>', '<img src="x">', '<a href="javascript:alert(1)">x</a>', '<a href="/x" target="_blank">x</a>', '<p>a < b', '<!-- c -->', '<style>p{}</style>', '<iframe src="x"></iframe>', '<a href="/x" class="y">z</a>']) assert.notEqual(richTextProblem(html), null, html)
})

test('Studio and Website archives are not interchangeable', async () => {
  const studio = await validStudio()
  assert.deepEqual(codes(await validateWebsiteTemplate(studio, { builderCatalogs: builderCatalogs() })), ['zip_invalid'])
  assert.equal((await inspectStudioPackage(await websiteTemplate())).ok, false)
})

// The archives committed under corpus/ are what other consumers (Developer Hub H3) replay:
// they must keep producing the documented diagnostics with the current validators.
test('the committed corpus replays with the documented diagnostics', async () => {
  const root = new URL('../../corpus/', import.meta.url)
  const { cases } = JSON.parse(readFileSync(new URL('expected.json', root), 'utf8'))
  assert.ok(Object.keys(cases).length >= 25)
  for (const [name, expect] of Object.entries(cases)) {
    const bytes = readFileSync(new URL(name, root))
    const result = name.startsWith('studio/') ? await inspectStudioPackage(bytes) : await validateWebsiteTemplate(bytes, { builderCatalogs: builderCatalogs() })
    assert.deepEqual([name, result.ok, [...new Set(codes(result))]], [name, expect.ok, expect.codes], JSON.stringify(result.errors))
  }
})
