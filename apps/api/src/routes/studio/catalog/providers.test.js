import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import sharp from 'sharp'
import { createStudioCatalog } from './service.js'
import { createProviderHealth } from './health.js'
import { catalogUrl } from './network.js'
import { auditLibrary, expandPath, libraryVersions } from './icon-library.js'
import { createPacksProvider, safeSvg } from './providers/packs.js'
import { wikimediaLicense } from './providers/wikimedia.js'
import { StudioError } from '../../../../../shared/studio/document.js'
import exclusions from './icon-library.exclusions.json' with { type: 'json' }

const design = '00000000-0000-4000-8000-000000000002', fileId = '00000000-0000-4000-8000-000000000001'
const json = body => ({ mime: 'application/json', bytes: Buffer.from(JSON.stringify(body)) })
const png = () => sharp({ create: { width: 32, height: 24, channels: 3, background: '#d946ef' } }).png().toBuffer()

function fixture({ handler, env = {}, packs, clock } = {}) {
  const state = { requests: [], uploads: [], now: 1_000_000 }
  const access = { member: async (company, actor) => { if (company !== 'company-a' || !actor.startsWith('actor-')) throw new StudioError('Denied', 403) }, get: async () => ({}), assets: async () => ({ ids: [] }) }
  const network = { get: async (url, options) => { state.requests.push({ url, options }); return handler(new URL(url), options, state) } }
  const filesService = { upload: async ({ file, fields }) => { state.uploads.push({ type: file.type, name: file.name, source: fields.metadata.studioSource }); return { id: fileId, originalName: file.name } }, getById: async () => { throw new StudioError('none', 404) } }
  const health = createProviderHealth({ clock: clock ?? (() => state.now) })
  const service = createStudioCatalog({ prisma: { $queryRaw: async () => [] }, access, network, filesService, supabaseAdmin: null, env, health, clock: clock ?? (() => state.now), ...(packs ? { packs } : {}) })
  return { state, service, health }
}
const failure = (code, status = 502) => { throw new StudioError('upstream', status, code) }

test('local library searches, paginates and imports Tabler and Lucide icons without any request', async () => {
  const { state, service } = fixture({ handler: () => failure('SHOULD_NOT_CALL') })
  const first = await service.search('company-a', 'actor-1', 'iconify', { q: 'star', collection: 'tabler' })
  assert.equal(first.source, 'library'); assert.equal(first.data[0].id, 'tabler:star'); assert.ok(first.pagination.hasNext); assert.equal(first.data.length, 32)
  assert.equal(first.library.tabler, libraryVersions().tabler)
  const second = await service.search('company-a', 'actor-1', 'iconify', { q: 'star', collection: 'tabler', page: 2 })
  assert.ok(second.data.length && second.data.every(row => !first.data.some(other => other.id === row.id)))
  const lucide = await service.search('company-a', 'actor-1', 'iconify', { q: 'house', collection: 'lucide' })
  assert.ok(lucide.data.some(row => row.id === 'lucide:house') && lucide.data.every(row => row.license === 'ISC / MIT' && row.attributionRequired))
  assert.ok(first.data.every(row => row.license === 'MIT'))
  const browse = await service.search('company-a', 'actor-1', 'iconify', { q: '', collection: 'lucide' })
  assert.equal(browse.data.length, 32)
  for (const id of ['tabler:star', 'tabler:star-filled', 'lucide:circle-alert', 'lucide:star']) {
    const imported = await service.insert('company-a', 'actor-1', 'iconify', id, design, {})
    assert.equal(imported.object.type, 'vector'); assert.ok(imported.object.geometry.paths.length)
    assert.ok((await service.thumbnail('company-a', 'actor-1', 'iconify', id)).length > 0)
  }
  assert.equal(state.requests.length, 0)
})
test('Spanish searches find the English-named icons, ignore accents and stopwords, and English still works', async () => {
  const { service, state } = fixture({ handler: () => failure('SHOULD_NOT_CALL') })
  const first = async (q, collection = 'tabler') => (await service.search('company-a', 'actor-1', 'iconify', { q, collection })).data.map(row => row.id.split(':')[1])
  for (const [spanish, english] of [['estrella', 'star'], ['casa', 'home'], ['usuario', 'user'], ['flecha', 'arrow'], ['calendario', 'calendar'], ['teléfono', 'phone'], ['TELEFONO', 'phone'],
    ['correo', 'mail'], ['configuración', 'settings'], ['configuracion', 'settings'], ['estrellas', 'star']]) {
    const names = await first(spanish)
    assert.ok(names.includes(english) || names.some(name => name.startsWith(english)), spanish)
    assert.ok((await first(english)).some(name => name.startsWith(english)), english)
  }
  assert.match((await first('carrito de compras'))[0], /cart|shopping/)
  assert.ok((await first('estrella', 'lucide')).includes('star'))
  assert.equal(state.requests.length, 0)
})
test('Pixabay requests use lang=es only for Spanish queries', async () => {
  const langs = []
  const { service } = fixture({ env: { PIXABAY_API_KEY: 'k' }, handler: url => { langs.push(url.searchParams.get('lang')); return json({ hits: [], totalHits: 0 }) } })
  for (const q of ['perro', 'árbol grande', 'red car', 'dog']) await service.search('company-a', 'actor-1', 'pixabay', { q })
  assert.deepEqual(langs, ['es', 'es', 'en', 'en'])
})
test('excluded icons list matches the pinned packages and compact arc flags are expanded', () => {
  const audit = auditLibrary()
  assert.deepEqual(audit.tabler, exclusions.tabler); assert.deepEqual(audit.lucide, exclusions.lucide)
  assert.deepEqual(exclusions.versions, libraryVersions())
  assert.ok(audit.tabler.length < 20)
  assert.equal(expandPath('M1 1a.25.25 0 00.407.195'), 'M1 1 a.25 .25 0 0 0 .407 .195')
})
test('remote Iconify falls back through the redundant official hosts and stops after them', async () => {
  const hosts = []
  const { service } = fixture({ handler: url => { hosts.push(url.hostname); if (url.hostname === 'api.unisvg.com') return json({ icons: ['tabler:zz'] }); if (url.pathname === '/collections') return json({ tabler: { license: { spdx: 'MIT' } } }); return failure('CATALOG_HEADERS_TIMEOUT', 504) } })
  const result = await service.search('company-a', 'actor-1', 'iconify', { q: 'zz', collection: 'tabler', source: 'iconify' })
  assert.equal(result.data[0].id, 'tabler:zz')
  assert.deepEqual([...new Set(hosts)], ['api.iconify.design', 'api.simplesvg.com', 'api.unisvg.com'])
  const down = fixture({ handler: () => failure('CATALOG_CONNECT_FAILED') })
  await assert.rejects(down.service.search('company-a', 'actor-1', 'iconify', { q: 'zz', collection: 'tabler', source: 'iconify' }), { status: 502 })
  assert.equal(down.state.requests.length, 3)
})

test('per provider allowlists: a provider cannot reach another provider origin, even through a redirect target', () => {
  assert.ok(catalogUrl('https://cdn.pixabay.com/photo/a.jpg', 'pixabay'))
  assert.ok(catalogUrl('https://commons.wikimedia.org/w/api.php', 'wikimedia'))
  for (const [url, provider] of [['https://cdn.pixabay.com/a.jpg', 'openverse'], ['https://api.openverse.org/v1/', 'pixabay'], ['https://commons.wikimedia.org/w/api.php', 'openverse'],
    ['https://upload.wikimedia.org/a.png', 'pixabay'], ['https://api.iconify.design/x', 'wikimedia'], ['https://pixabay.com.evil.test/api/', 'pixabay'], ['https://cdn.pixabay.com:444/a', 'pixabay'], ['http://pixabay.com/api/', 'pixabay'], ['https://pixabay.com/a', 'unknown']])
    assert.throws(() => catalogUrl(url, provider), { code: 'CATALOG_ORIGIN_DENIED' }, `${provider} ${url}`)
})
test('a result whose original points outside its provider allowlist is dropped', async () => {
  const hit = { id: 5, pageURL: 'https://pixabay.com/photos/x-5/', tags: 'dog, pet', user: 'Ana', imageWidth: 100, imageHeight: 80, largeImageURL: 'https://upload.wikimedia.org/a.jpg', webformatURL: 'https://cdn.pixabay.com/b.jpg' }
  const { service } = fixture({ env: { PIXABAY_API_KEY: 'k' }, handler: () => json({ hits: [hit, { ...hit, id: 6, largeImageURL: 'https://cdn.pixabay.com/c.jpg' }], totalHits: 2 }) })
  const result = await service.search('company-a', 'actor-1', 'pixabay', { q: 'dog' })
  assert.deepEqual(result.data.map(row => row.id), ['6'])
})

test('a stalled provider opens its breaker, answers 503 without new requests, recovers by probe and never blocks other providers', async () => {
  const { state, service, health } = fixture({ env: {}, handler: url => {
    if (url.hostname === 'api.openverse.org') return failure('CATALOG_HEADERS_TIMEOUT', 504)
    return json({ query: { pages: [] } })
  } })
  for (let i = 0; i < 3; i++) await assert.rejects(service.search('company-a', 'actor-1', 'openverse', { q: `perro${i}` }), { status: 504 })
  const before = state.requests.length
  await assert.rejects(service.search('company-a', 'actor-1', 'openverse', { q: 'gato' }), { status: 503, code: 'CATALOG_PROVIDER_UNAVAILABLE' })
  assert.equal(state.requests.length, before)
  assert.equal(health.status('openverse').state, 'unavailable')
  assert.deepEqual((await service.search('company-a', 'actor-1', 'wikimedia', { q: 'dog' })).data, [])
  assert.equal((await service.search('company-a', 'actor-1', 'iconify', { q: 'star' })).source, 'library')
  const listing = await service.status('company-a', 'actor-1')
  assert.equal(listing.find(row => row.id === 'openverse').state, 'unavailable'); assert.equal(listing.find(row => row.id === 'wikimedia').state, 'available')
  assert.equal(listing.find(row => row.id === 'pixabay').state, 'disabled'); assert.equal(listing.find(row => row.id === 'packs').state, 'available') // bundled CC0 collections
  const others = state.requests.length
  state.now += 31_000
  await assert.rejects(service.search('company-a', 'actor-1', 'openverse', { q: 'probe' }), { status: 504 }) // single probe
  assert.equal(state.requests.length, others + 1)
  await assert.rejects(service.search('company-a', 'actor-1', 'openverse', { q: 'again' }), { code: 'CATALOG_PROVIDER_UNAVAILABLE' })
  assert.ok(health.status('openverse').retryAfterSec > 30) // cooldown doubled
})
test('hung requests of one provider exhaust only that provider lane', async () => {
  const hung = []
  const { service } = fixture({ handler: (url, options) => url.hostname === 'api.openverse.org' ? new Promise((_, reject) => { hung.push(1); options.signal.addEventListener('abort', () => reject(new StudioError('c', 499, 'CATALOG_CANCELLED')), { once: true }) }) : json({ query: { pages: [] } }) })
  const controller = new AbortController()
  const stuck = Array.from({ length: 4 }, (_, i) => service.search('company-a', 'actor-1', 'openverse', { q: `s${i}` }, { signal: controller.signal }))
  const settled = Promise.allSettled(stuck)
  await new Promise(resolve => setImmediate(resolve))
  await assert.rejects(service.search('company-a', 'actor-1', 'openverse', { q: 'fifth' }), { status: 429 })
  assert.equal((await service.search('company-a', 'actor-1', 'wikimedia', { q: 'ok' })).data.length, 0)
  assert.equal((await service.search('company-a', 'actor-1', 'iconify', { q: 'star' })).data.length, 32)
  controller.abort(); assert.ok((await settled).every(row => row.status === 'rejected' && row.reason.status === 499))
})
test('429, 503 and 504 are surfaced once, are not retried in a loop and 4xx do not trip the breaker', async () => {
  for (const [code, status] of [['CATALOG_UPSTREAM_429', 429], ['CATALOG_UPSTREAM_503', 502], ['CATALOG_HEADERS_TIMEOUT', 504]]) {
    const { state, service } = fixture({ handler: () => failure(code, status) })
    await assert.rejects(service.search('company-a', 'actor-1', 'openverse', { q: 'x' }), { status })
    assert.equal(state.requests.length, /503/.test(code) ? 2 : 1) // 5xx gets exactly one jittered retry
  }
  const { service, health } = fixture({ handler: () => failure('CATALOG_UPSTREAM_404', 404) })
  for (let i = 0; i < 5; i++) await assert.rejects(service.search('company-a', 'actor-1', 'openverse', { q: `q${i}` }), { status: 404 })
  assert.equal(health.status('openverse').state, 'available')
})

const hit = { id: 4242, pageURL: 'https://pixabay.com/photos/dog-4242/', tags: 'dog, pet, animal', user: 'Ana', imageWidth: 640, imageHeight: 480, largeImageURL: 'https://cdn.pixabay.com/photo/large.jpg', webformatURL: 'https://cdn.pixabay.com/photo/web.jpg' }
test('Pixabay stays disabled without a key and makes no request', async () => {
  const { state, service } = fixture({ handler: () => failure('SHOULD_NOT_CALL') })
  const result = await service.search('company-a', 'actor-1', 'pixabay', { q: 'dog' })
  assert.deepEqual(result.availability, { state: 'disabled', reason: 'Sin clave de API configurada' }); assert.deepEqual(result.data, [])
  await assert.rejects(service.details('company-a', 'actor-1', 'pixabay', '4242'), { code: 'CATALOG_PROVIDER_DISABLED' })
  await assert.rejects(service.thumbnail('company-a', 'actor-1', 'pixabay', '4242'), { code: 'CATALOG_PROVIDER_DISABLED' })
  assert.equal(state.requests.length, 0)
})
test('Pixabay is disabled for the process once the provider rejects its key and no further request is made', async () => {
  const { state, service } = fixture({ env: { PIXABAY_API_KEY: 'invalid-test-key' }, handler: () => failure('CATALOG_UPSTREAM_400') })
  await assert.rejects(service.search('company-a', 'actor-1', 'pixabay', { q: 'perro' }), { status: 502 })
  const sent = state.requests.length
  const again = await service.search('company-a', 'actor-1', 'pixabay', { q: 'gato' })
  assert.deepEqual(again.availability, { state: 'disabled', reason: 'Clave de API rechazada por el proveedor' })
  assert.equal(state.requests.length, sent)
  assert.equal((await service.status('company-a', 'actor-1')).find(row => row.id === 'pixabay').state, 'disabled')
  await assert.rejects(service.details('company-a', 'actor-1', 'pixabay', '4242'), { code: 'CATALOG_PROVIDER_DISABLED' })
  // A 400 on a later page is an out-of-range page, not a bad key.
  const paged = fixture({ env: { PIXABAY_API_KEY: 'k' }, handler: url => url.searchParams.get('page') === '1' ? json({ hits: [], totalHits: 0 }) : failure('CATALOG_UPSTREAM_400') })
  await paged.service.search('company-a', 'actor-1', 'pixabay', { q: 'perro' })
  await assert.rejects(paged.service.search('company-a', 'actor-1', 'pixabay', { q: 'perro', page: 9 }), { status: 502 })
  assert.equal((await paged.service.search('company-a', 'actor-1', 'pixabay', { q: 'otro' })).availability, undefined)
})
test('Pixabay: 24 hour response cache, request budget, provenance, private import and no key leakage', async () => {
  const bytes = await png()
  const key = 'secret-pixabay-key'
  const diagnostics = []
  const { state, service } = fixture({ env: { PIXABAY_API_KEY: key }, handler: url => {
    if (url.hostname === 'cdn.pixabay.com') return { bytes, mime: 'image/png' }
    assert.equal(url.searchParams.get('key'), key)
    return json({ hits: url.searchParams.get('id') ? [hit] : [hit, { ...hit, id: 9, pageURL: 'http://pixabay.com/x' }], totalHits: 45 })
  } })
  const first = await service.search('company-a', 'actor-1', 'pixabay', { q: 'dog', category: 'illustration' })
  assert.equal(new URL(state.requests[0].url).searchParams.get('image_type'), 'illustration')
  assert.equal(first.data.length, 1); assert.deepEqual(first.pagination, { page: 1, hasNext: true })
  assert.equal(first.data[0].license, 'Pixabay-Content-License'); assert.equal(first.data[0].attributionRequired, false); assert.equal(first.data[0].title, 'Dog')
  state.now += 23 * 3600_000
  await service.search('company-a', 'actor-2', 'pixabay', { q: 'dog', category: 'illustration' }) // another actor, still inside 24 h
  assert.equal(state.requests.length, 1)
  state.now += 2 * 3600_000
  await service.search('company-a', 'actor-1', 'pixabay', { q: 'dog', category: 'illustration' })
  assert.equal(state.requests.length, 2)
  assert.ok((await service.thumbnail('company-a', 'actor-1', 'pixabay', '4242')).length > 0)
  const imported = await service.insert('company-a', 'actor-1', 'pixabay', '4242', design, {})
  assert.equal(imported.file.id, fileId); assert.equal(state.uploads.length, 1); assert.equal(state.uploads[0].source.provider, 'pixabay'); assert.equal(state.uploads[0].type, 'image/png')
  for (const request of state.requests.filter(row => row.url.includes('cdn.pixabay.com')))assert.equal(request.options.provider, 'pixabay')
  assert.ok(!JSON.stringify([first, imported, diagnostics]).includes(key))
  // 90 requests per minute per process is enforced before the provider returns 429.
  const bursty = fixture({ env: { PIXABAY_API_KEY: key }, handler: () => json({ hits: [], totalHits: 0 }) })
  let limited = 0
  for (let i = 0; i < 95; i++) { try { await bursty.service.search('company-a', `actor-${i % 5}`, 'pixabay', { q: `q${i}` }) } catch (error) { assert.equal(error.code, 'CATALOG_PROVIDER_QUOTA'); limited++ } }
  assert.equal(limited, 5); assert.equal(bursty.state.requests.length, 90)
})

const page = (overrides = {}, meta = {}) => ({ pageid: 77, title: 'File:Tree.jpg', index: 1, imageinfo: [{ url: 'https://upload.wikimedia.org/wikipedia/commons/a/a1/Tree.jpg', thumburl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Tree.jpg/320px-Tree.jpg',
  width: 800, height: 600, mime: 'image/jpeg', descriptionurl: 'https://commons.wikimedia.org/wiki/File:Tree.jpg',
  extmetadata: { LicenseShortName: { value: 'CC BY 4.0' }, LicenseUrl: { value: 'https://creativecommons.org/licenses/by/4.0' }, Artist: { value: '<a href="//commons.wikimedia.org/wiki/User:Eva">Eva &amp; Co</a>' }, ObjectName: { value: 'Old tree' }, ...meta }, ...overrides }] })
test('Wikimedia treats an empty search as no results but an unexpected body as a provider error', async () => {
  const empty = fixture({ handler: () => json({ batchcomplete: true }) })
  assert.deepEqual((await empty.service.search('company-a', 'actor-1', 'wikimedia', { q: 'nada' })).data, [])
  const bad = fixture({ handler: () => json({ unexpected: true }) })
  await assert.rejects(bad.service.search('company-a', 'actor-1', 'wikimedia', { q: 'nada' }), { status: 502, code: 'CATALOG_RESPONSE_INVALID' })
})
test('Wikimedia Commons keeps permitted licenses with attribution, drops the rest and identifies the client', async () => {
  const bytes = await png()
  const rows = [page(), page({}, { LicenseShortName: { value: 'CC BY-SA 4.0' } }) && { ...page({}, { LicenseShortName: { value: 'CC BY-SA 4.0' } }), pageid: 78, index: 2 },
    { ...page({}, { LicenseShortName: { value: 'CC0' }, LicenseUrl: { value: '' } }), pageid: 79, index: 3 }, { ...page({ mime: 'image/svg+xml' }), pageid: 80, index: 4 },
    { ...page({ url: 'https://evil.example/a.jpg' }), pageid: 81, index: 5 }]
  const { state, service } = fixture({ handler: (url, options) => {
    if (url.hostname === 'upload.wikimedia.org') return { bytes, mime: 'image/png' }
    assert.match(options.userAgent, /^RunlyStudio\/1\.0 /)
    if (url.searchParams.has('pageids')) return json({ query: { pages: [rows[0]] } })
    assert.equal(url.searchParams.get('gsroffset'), '20'); assert.match(url.searchParams.get('gsrsearch'), /filetype:bitmap/)
    return json({ query: { pages: rows }, continue: { gsroffset: 40 } })
  } })
  const result = await service.search('company-a', 'actor-1', 'wikimedia', { q: 'tree', page: 2 })
  assert.deepEqual(result.data.map(row => [row.id, row.license]), [['77', 'CC-BY-4.0'], ['79', 'CC0-1.0']])
  assert.equal(result.data[0].author, 'Eva & Co'); assert.equal(result.data[0].attributionRequired, true); assert.equal(result.data[0].sourceUrl, 'https://commons.wikimedia.org/wiki/File:Tree.jpg')
  assert.equal(result.pagination.hasNext, true)
  const imported = await service.insert('company-a', 'actor-1', 'wikimedia', '77', design, {})
  assert.equal(imported.resource.licenseUrl, 'https://creativecommons.org/licenses/by/4.0/'); assert.equal(state.uploads[0].source.author, 'Eva & Co')
  assert.equal(wikimediaLicense({ LicenseShortName: { value: 'Public domain' }, Copyrighted: { value: 'False' } }).id, 'Public-Domain')
  for (const name of ['CC BY-NC 4.0', 'CC BY-ND 2.0', 'GFDL', 'Attribution', 'Public domain'])assert.equal(wikimediaLicense({ LicenseShortName: { value: name }, Copyrighted: { value: 'True' } }), null, name)
  assert.equal(wikimediaLicense({ LicenseShortName: { value: 'CC BY 4.0' }, LicenseUrl: { value: 'https://evil.test/licenses/by/4.0/' } }), null)
})

function packDirectory({ svg = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30" viewBox="0 0 40 30"><rect width="40" height="30" fill="#e11"/></svg>', hash, license = 'CC0-1.0' } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'studio-packs-')), directory = join(root, 'sample-doodles', 'assets')
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, 'dance.svg'), svg)
  writeFileSync(join(root, 'sample-doodles', 'manifest.json'), JSON.stringify({ id: 'sample-doodles', name: 'Sample', author: 'Autor', sourceUrl: 'https://example.com/pack',
    license: { id: license, url: 'https://creativecommons.org/publicdomain/zero/1.0/', evidenceUrl: 'https://example.com/license', verifiedAt: '2026-10-28' },
    assets: [{ id: 'dance', title: 'Baile', file: 'assets/dance.svg', tags: ['fiesta'], sha256: hash ?? createHash('sha256').update(svg).digest('hex') }] }))
  return pathToFileURL(`${root}/`)
}
test('bundled CC0 packs: verified manifest, SVG rasterized to PNG, searchable, importable and credited', async () => {
  const { state, service } = fixture({ handler: () => failure('SHOULD_NOT_CALL'), packs: createPacksProvider({ dir: packDirectory() }) })
  const result = await service.search('company-a', 'actor-1', 'packs', { q: 'fiesta' })
  assert.deepEqual(result.data.map(row => [row.id, row.license, row.width, row.height]), [['sample-doodles:dance', 'CC0-1.0', 40, 30]])
  assert.equal((await service.search('company-a', 'actor-1', 'packs', { q: '' })).data.length, 1)
  assert.equal((await service.search('company-a', 'actor-1', 'packs', { q: 'nada' })).data.length, 0)
  assert.equal((await sharp(await service.thumbnail('company-a', 'actor-1', 'packs', 'sample-doodles:dance')).metadata()).format, 'png')
  await service.insert('company-a', 'actor-1', 'packs', 'sample-doodles:dance', design, {})
  assert.equal(state.uploads[0].type, 'image/png'); assert.equal(state.uploads[0].name, 'studio-sample-doodles-dance.png'); assert.equal(state.uploads[0].source.provider, 'packs')
  assert.equal(state.requests.length, 0)
  assert.equal((await service.status('company-a', 'actor-1')).find(row => row.id === 'packs').state, 'available')
})
test('packs with a wrong hash, unlisted license or active SVG content are rejected as a whole', async () => {
  const bad = [packDirectory({ hash: '0'.repeat(64) }), packDirectory({ license: 'CC-BY-NC-4.0' }), packDirectory({ svg: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>' })]
  for (const dir of bad) {
    const provider = createPacksProvider({ dir }), { service } = fixture({ handler: () => failure('X'), packs: provider })
    assert.equal((await service.search('company-a', 'actor-1', 'packs', { q: '' })).data.length, 0)
    assert.equal(await provider.rejected(), 1)
  }
  for (const svg of ['<svg><foreignObject/></svg>', '<svg onload="x()"></svg>', '<svg><image href="https://x.test/a.png"/></svg>', '<svg><use href="x.svg#a"/></svg>', '<svg><style>@import url(x)</style></svg>', '<!DOCTYPE svg><svg/>', '<svg><path style="fill:url(https://x.test)"/></svg>', '<svg><a href="javascript:alert(1)"/></svg>'])assert.equal(safeSvg(svg), false, svg)
  assert.equal(safeSvg('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><defs><linearGradient id="a"/></defs><rect fill="url(#a)"/></svg>'), true)
})
test('the bundled Open Doodles and Open Peeps collections load intact and keep their provenance', async () => {
  const provider = createPacksProvider()
  assert.equal(await provider.rejected(), 0)
  const all = (await provider.search({ q: '', page: 1 })).data
  assert.deepEqual([...new Set(all.map(row => row.id.split(':')[0]))].sort(), ['open-doodles', 'open-peeps'])
  assert.ok(all.every(row => row.license === 'CC0-1.0' && row.author === 'Pablo Stanley' && row.sourceUrl.startsWith('https://www.open')))
  assert.equal((await provider.search({ q: 'perro', page: 1 })).data[0].id, 'open-doodles:doggie')
  const png = (await provider.resolve({ id: 'open-peeps:peep-12' })).local
  assert.equal(png.mime, 'image/png'); assert.equal((await sharp(png.bytes).metadata()).format, 'png')
})
test('authorization is required before any provider status, search or import', async () => {
  const { service } = fixture({ handler: () => failure('X') })
  await assert.rejects(service.status('company-b', 'actor-1'), { status: 403 })
  await assert.rejects(service.search('company-b', 'actor-1', 'wikimedia', { q: 'tree' }), { status: 403 })
  await assert.rejects(service.insert('company-b', 'actor-1', 'pixabay', '1', design, {}), { status: 403 })
  await assert.rejects(service.search('company-a', 'actor-1', 'unknown', { q: 'x' }), { status: 404 })
  await assert.rejects(service.details('company-a', 'actor-1', 'wikimedia', '../etc/passwd'), { status: 404 })
})
