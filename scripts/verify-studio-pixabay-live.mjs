// Optional live check of the Pixabay adapter with a real key from the LOCAL environment.
//   PIXABAY_API_KEY=... node scripts/verify-studio-pixabay-live.mjs      (or export it in your shell)
// Without a key it prints NOT_CONFIGURED and exits 0. The key is never printed: every error is reduced to a
// status and code, and the report is scanned for the key before it is written. At most 6 upstream requests
// are made (Pixabay allows 100/minute per key); there are no bulk downloads, one original is imported.
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
import { createStudioCatalog } from '../apps/api/src/routes/studio/catalog/service.js'
import { createCatalogNetwork } from '../apps/api/src/routes/studio/catalog/network.js'

const key = process.env.PIXABAY_API_KEY?.trim()
if (!key) { console.log('NOT_CONFIGURED: PIXABAY_API_KEY is not set; the Pixabay provider stays disabled and no request was made.'); process.exit(0) }
const sharp = createRequire(new URL('../apps/api/package.json', import.meta.url))('sharp')
const real = createCatalogNetwork(), upstream = []
const network = { get: async (url, options) => { upstream.push(new URL(url).hostname); if (upstream.length > 6) throw Error('REQUEST_BUDGET_EXCEEDED'); return real.get(url, options) } }
const uploads = [], diagnostics = []
const access = { member: async () => {}, get: async () => ({}), assets: async () => ({ ids: [] }) }
const filesService = { upload: async ({ file, fields }) => { uploads.push({ type: file.type, bytes: file.size, source: fields.metadata.studioSource, buffer: Buffer.from(await file.arrayBuffer()) }); return { id: '00000000-0000-4000-8000-000000000001', originalName: file.name } }, getById: async () => { throw Error('none') } }
const service = createStudioCatalog({ prisma: { $queryRaw: async () => [] }, access, filesService, supabaseAdmin: null, network, env: { PIXABAY_API_KEY: key }, onDiagnostic: row => diagnostics.push(row) })
const design = '00000000-0000-4000-8000-000000000002', report = { provider: 'pixabay', checks: [] }
const check = (name, detail) => { report.checks.push({ name, ...detail }); console.log(`ok - ${name}${detail ? ` ${JSON.stringify(detail)}` : ''}`) }
const safe = error => ({ status: error?.status ?? null, code: error?.code ?? 'UNKNOWN' })
try {
  const spanish = await service.search('company', 'actor', 'pixabay', { q: 'perro', category: 'photograph' })
  if (spanish.availability?.state === 'disabled') { console.log(`DISABLED: ${spanish.availability.reason}. The provider stays disabled.`); process.exit(2) }
  assert.ok(spanish.data.length > 0)
  for (const row of spanish.data) { assert.equal(row.provider, 'pixabay'); assert.match(row.sourceUrl, /^https:\/\/pixabay\.com\//); assert.ok(row.author && row.title && row.licenseUrl); assert.equal(row.attributionRequired, false); assert.ok(row.width > 0 && row.height > 0) }
  check('Spanish photo search (lang=es)', { results: spanish.data.length, hasNext: spanish.pagination.hasNext, sample: { title: spanish.data[0].title, author: spanish.data[0].author, size: `${spanish.data[0].width}x${spanish.data[0].height}` } })
  const english = await service.search('company', 'actor', 'pixabay', { q: 'dog', category: 'illustration' })
  assert.ok(english.data.length > 0); check('English illustration search', { results: english.data.length })
  const before = upstream.length
  await service.search('company', 'actor', 'pixabay', { q: 'perro', category: 'photograph' })
  assert.equal(upstream.length, before); check('repeat search served from the 24 hour cache', { upstreamRequests: 0 })
  const first = spanish.data[0]
  const thumbnail = await service.thumbnail('company', 'actor', 'pixabay', first.id), preview = await sharp(thumbnail).metadata()
  assert.equal(preview.format, 'png'); assert.ok(preview.width <= 256 && preview.height <= 256); check('thumbnail proxied and reduced', { size: `${preview.width}x${preview.height}` })
  const details = await service.details('company', 'actor', 'pixabay', first.id)
  assert.equal(details.id, first.id); assert.equal(details.license, 'Pixabay-Content-License'); check('details resolved by id', { license: details.license })
  const imported = await service.insert('company', 'actor', 'pixabay', first.id, design, {})
  const file = uploads.at(-1), metadata = await sharp(file.buffer).metadata()
  assert.ok(file.bytes > 0 && file.bytes <= 10 * 1024 * 1024); assert.ok(['image/jpeg', 'image/png', 'image/webp'].includes(file.type)); assert.ok(metadata.width * metadata.height <= 25_000_000)
  assert.equal(file.source.provider, 'pixabay'); assert.equal(file.source.attributionRequired, false); assert.ok(file.source.author)
  check('authorized import to private Files', { mime: file.type, bytes: file.bytes, original: `${metadata.width}x${metadata.height}`, availableResolution: `${first.width}x${first.height}`, author: file.source.author, fileId: imported.file.id })
  assert.ok(upstream.length <= 6); check('request budget', { upstreamRequests: upstream.length })
  const text = JSON.stringify([report, diagnostics, spanish, details])
  assert.ok(!text.includes(key) && !/[?&]key=/.test(text)); check('key absent from results, diagnostics and this report')
  console.log('PIXABAY_LIVE_OK')
} catch (error) {
  console.log(`PIXABAY_LIVE_FAILED ${JSON.stringify(safe(error))}${error?.name === 'AssertionError' ? ` assertion=${String(error.message).split('\n')[0].replaceAll(key, '[redacted]').slice(0, 160)}` : ''}`)
  process.exitCode = 1
}
