// Provider E2E against the deterministic simulator (scripts/fixtures/studio/catalog-server.mjs) running in ONE
// disposable container. Isolation: unique `runly-studio-e2e-<hex12>` name, no volumes, no compose, no network
// creation, read-only root, all capabilities dropped. Cleanup stops only that exact name, which `--rm` removes.
// It never runs `compose down`, `prune` or `volume rm`, and never touches another container or project.
//   node scripts/verify-studio-catalog-providers.mjs
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const sharp = createRequire(new URL('../apps/api/package.json', import.meta.url))('sharp')
import { createStudioCatalog } from '../apps/api/src/routes/studio/catalog/service.js'
import { createProviderHealth } from '../apps/api/src/routes/studio/catalog/health.js'

const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const endpoint = docker('context', 'inspect', '--format', '{{.Endpoints.docker.Host}}')
if (!/^(npipe:|unix:)/.test(endpoint)) throw Error('LOCAL_DOCKER_ENGINE_REQUIRED')
const image = docker('images', '--format', '{{.Repository}}:{{.Tag}}').split('\n').find(tag => /^runly-studio:rc-[a-f0-9]+$/.test(tag))
if (!image) throw Error('LOCAL_STUDIO_IMAGE_REQUIRED')
const project = `runly-studio-e2e-${randomBytes(6).toString('hex')}`, name = `${project}-sim`
if (!/^runly-studio-e2e-[a-f0-9]{12}-sim$/.test(name)) throw Error('UNSAFE_CONTAINER_NAME')
let started = false
const stop = () => { if (started) { started = false; try { docker('stop', '--time', '2', name) } catch { /* already gone */ } } }
process.on('exit', stop)
const checks = []
const record = message => { checks.push(message); console.log(`ok - ${message}`) }
try {
  docker('run', '-d', '--rm', '--pull', 'never', '--name', name, '--label', 'runly.e2e=studio-catalog-sim', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
    '--entrypoint', 'node', '-p', '127.0.0.1::9080', '-v', `${resolve('scripts/fixtures/studio/catalog-server.mjs')}:/app/studio-catalog-server.mjs:ro`, image, '/app/studio-catalog-server.mjs')
  started = true
  const mapping = docker('port', name, '9080/tcp').split('\n')[0], base = `http://127.0.0.1:${mapping.split(':').pop()}`
  for (let i = 0; ; i++) { try { if ((await fetch(`${base}/__stats`)).ok) break } catch { /* starting */ } if (i > 40) throw Error('SIMULATOR_NOT_READY'); await new Promise(r => setTimeout(r, 250)) }
  process.env.STUDIO_CATALOG_TEST_PROJECT = project; process.env.STUDIO_CATALOG_TEST_URL = base
  const stats = async () => (await fetch(`${base}/__stats`)).json(), reset = () => fetch(`${base}/__reset`, { method: 'POST' })
  const KEY = 'e2e-fake-key-not-real', design = '00000000-0000-4000-8000-000000000002'
  const diagnostics = [], uploads = []
  let now = Date.now()
  const prisma = { $queryRaw: async strings => String(strings?.[0] ?? '').includes('runly_studio_test') ? [{ id: project }] : [] }
  const access = { member: async (company, actor) => { if (company !== 'company-a' || !actor.startsWith('actor-')) throw Object.assign(Error('Denied'), { status: 403 }) }, get: async () => ({}), assets: async () => ({ ids: [] }) }
  const filesService = { upload: async ({ file, fields }) => { uploads.push({ type: file.type, bytes: file.size, source: fields.metadata.studioSource }); return { id: '00000000-0000-4000-8000-000000000001', originalName: file.name } }, getById: async () => { throw Error('none') } }
  const build = (env = { PIXABAY_API_KEY: KEY }) => createStudioCatalog({ prisma, access, filesService, supabaseAdmin: null, env, clock: () => now, onDiagnostic: row => diagnostics.push(row), health: createProviderHealth({ clock: () => now }) })
  const search = (service, provider, query, options) => service.search('company-a', 'actor-1', provider, query, options)
  const error = async promise => { try { await promise } catch (e) { return e } throw Error('expected a failure') }
  let service = build()

  // Wikimedia: licenses, attribution, pagination, thumbnails, redirects.
  let result = await search(service, 'wikimedia', { q: 'arbol' })
  assert.deepEqual(result.data.map(row => [row.id, row.license]), [['77', 'CC-BY-4.0'], ['79', 'CC0-1.0'], ['81', 'CC-BY-3.0'], ['82', 'Public-Domain'], ['83', 'CC-BY-2.0']])
  assert.equal(result.data[0].author, 'Eva & Co'); assert.equal(result.data[0].attributionRequired, true); assert.equal(result.pagination.hasNext, true)
  assert.equal((await search(service, 'wikimedia', { q: 'arbol', page: 2 })).data.length, 0)
  assert.equal((await sharp(await service.thumbnail('company-a', 'actor-1', 'wikimedia', '77')).metadata()).format, 'png')
  record('wikimedia: SA and SVG excluded, CC BY/CC0/PD kept with attribution, pagination and thumbnails')
  const imported = await service.insert('company-a', 'actor-1', 'wikimedia', '81', design, {})
  assert.equal(imported.file.width, 320); assert.equal(uploads.at(-1).source.provider, 'wikimedia')
  assert.equal((await error(service.insert('company-a', 'actor-1', 'wikimedia', '83', design, {}))).code, 'CATALOG_ORIGIN_DENIED')
  record('wikimedia: same-provider redirect followed and imported privately; redirect to a foreign host denied')

  // Failure statuses are surfaced once per request, never as empty results.
  for (const [word, status] of [['rate-limit', 429], ['offline', 502], ['gateway', 502], ['malformed', 502]]) {
    service = build(); await reset()
    assert.equal((await error(search(service, 'wikimedia', { q: word }))).status, status, word)
  }
  record('wikimedia: 429, 503, 504 and malformed bodies map to explicit errors')
  service = build(); await reset()
  const controller = new AbortController(); setTimeout(() => controller.abort(), 400)
  assert.equal((await error(search(service, 'wikimedia', { q: 'stall' }, { signal: controller.signal }))).status, 499)
  const started0 = Date.now()
  assert.equal((await error(search(service, 'wikimedia', { q: 'stall again' }))).code, 'CATALOG_HEADERS_TIMEOUT')
  assert.ok(Date.now() - started0 < 15000)
  record('wikimedia: cancellation is 499 and a stalled provider ends as a header timeout inside the budget')

  // Breaker: three provider failures stop traffic to it, others keep working.
  service = build(); await reset()
  for (let i = 0; i < 3; i++) await error(search(service, 'wikimedia', { q: `offline ${i}` }))
  const before = (await stats())['commons.wikimedia.org']
  assert.equal((await error(search(service, 'wikimedia', { q: 'arbol' }))).code, 'CATALOG_PROVIDER_UNAVAILABLE')
  assert.equal((await stats())['commons.wikimedia.org'], before)
  assert.equal((await search(service, 'openverse', { q: 'perro' })).data.length, 1)
  assert.equal((await service.status('company-a', 'actor-1')).find(row => row.id === 'wikimedia').state, 'unavailable')
  record('circuit breaker: provider cooled down without new upstream requests while Openverse keeps answering')

  // Pixabay: disabled without key, 24 h cache, no key leakage, import.
  await reset(); service = build({})
  assert.equal((await search(service, 'pixabay', { q: 'perro' })).availability.state, 'disabled'); assert.equal((await stats())['pixabay.com'] ?? 0, 0)
  service = build(); await reset()
  result = await search(service, 'pixabay', { q: 'perro' })
  assert.deepEqual(result.data.map(row => row.id), ['4242', '4243']); assert.equal(result.data[0].attributionRequired, false); assert.match(result.data[0].sourceUrl, /^https:\/\/pixabay\.com\//)
  const hits = (await stats())['pixabay.com']
  now += 23 * 3600_000; await service.search('company-a', 'actor-2', 'pixabay', { q: 'perro' })
  assert.equal((await stats())['pixabay.com'], hits)
  now += 2 * 3600_000; await search(service, 'pixabay', { q: 'perro' })
  assert.equal((await stats())['pixabay.com'], hits + 1)
  assert.ok((await service.thumbnail('company-a', 'actor-1', 'pixabay', '4242')).length > 0)
  assert.equal((await service.insert('company-a', 'actor-1', 'pixabay', '4242', design, {})).file.width, 320)
  assert.equal(uploads.at(-1).type, 'image/png'); assert.equal(uploads.at(-1).source.license, 'Pixabay-Content-License')
  record('pixabay: disabled without key and silent upstream; responses cached 24 h across actors, refreshed after expiry; import is private')
  const wrongKey = build({ PIXABAY_API_KEY: 'another-fake-key' }); await reset()
  const rejected = await error(search(wrongKey, 'pixabay', { q: 'perro' }))
  assert.equal(rejected.status, 502)
  for (const [word, status] of [['rate-limit', 429], ['gateway', 502]]) assert.equal((await error(search(build(), 'pixabay', { q: word }))).status, status)
  assert.ok(!JSON.stringify([diagnostics, rejected.message, rejected.code, result, imported]).includes(KEY) && !JSON.stringify(diagnostics).includes('another-fake-key') && !JSON.stringify(diagnostics).includes('key='))
  record('pixabay: bad key, 429 and 504 surface as errors; key absent from diagnostics, errors and results')
  const hostile = await search(build(), 'pixabay', { q: 'perro' })
  assert.ok(hostile.data.every(row => !['9', '10'].includes(row.id)))
  record('pixabay: results with non-HTTPS pages or originals outside the allowlist are dropped')

  // Bundled packs (real CC0 collections) through the full service.
  service = build({})
  assert.equal((await service.status('company-a', 'actor-1')).find(row => row.id === 'packs').state, 'available')
  result = await search(service, 'packs', { q: 'perro' })
  assert.equal(result.data[0].id, 'open-doodles:doggie')
  assert.equal((await sharp(await service.thumbnail('company-a', 'actor-1', 'packs', 'open-doodles:doggie')).metadata()).format, 'png')
  assert.equal((await service.insert('company-a', 'actor-1', 'packs', 'open-doodles:doggie', design, {})).file.width, 1600)
  assert.equal(uploads.at(-1).type, 'image/png'); assert.equal(uploads.at(-1).source.license, 'CC0-1.0')
  record('packs: real CC0 collection searched, thumbnailed and imported as PNG with provenance')

  console.log(`\n${checks.length} checks passed against ${name}`)
} finally { stop() }
