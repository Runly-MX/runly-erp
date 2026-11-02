// Phase 1 investigation only. No application/test source is modified.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { createPublicWebsiteRouter } from '../../../../apps/api/src/routes/public-website.js'
import { invalidatePrimaryCache } from '../../../../apps/api/src/services/dist-serve-service.js'
import { createGrowthFormRoutes } from '../../../../apps/api/src/routes/growth/growth-form-routes.js'

globalThis.fetch = async () => { throw new Error('Network forbidden') }
const ROOT = new URL('../../../../', import.meta.url)
const COMPANY = '01900000-0000-7000-8000-000000000001'
const SITE = '01900000-0000-7000-8000-000000000002'
const originalTest = new URL('apps/api/src/routes/__tests__/public-website-capture-config.test.js', ROOT)
const routerUrl = new URL('apps/api/src/routes/public-website.js', ROOT)
// Do not inherit node:test's binary IPC protocol into these independent runs.
const subprocessEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'NODE_TEST_CONTEXT'))

test('WR-17 original unchanged test fails specifically on missing company.findUnique', () => {
  const result = spawnSync(process.execPath, ['--test', fileURLToPath(originalTest)], { encoding: 'utf8', env: subprocessEnv })
  assert.equal(result.status, 1)
  assert.match(result.stdout + result.stderr, /prisma\.company\.findUnique is not a function/)
  assert.match(result.stdout, /500 !== 200/)
})

test('WR-17 original assertions pass with only the company fixture corrected in memory', () => {
  const source = readFileSync(originalTest, 'utf8')
  assert.equal(source.split('findFirst: async () => ({').length, 2)
  const adapted = source
    .replace("'../public-website.js'", JSON.stringify(routerUrl.href))
    .replace('findFirst: async () => ({', `findUnique: async ({ where }) => ({ enabled: where.id === '${COMPANY}',`)
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', adapted], { encoding: 'utf8', env: subprocessEnv })
  assert.equal(result.status, 0, 'The corrected fixture must pass all original assertions')
  assert.match(result.stdout, /# pass 1/)
  assert.doesNotMatch(result.stdout + result.stderr, /findUnique is not a function/)
})

function prismaFixture({ enabled = true, failDatabase = false } = {}) {
  const seen = []
  const prisma = {
    instanceConfig: { findUnique: async ({ where }) => ({ value: where.key === 'initialized' ? 'true' : COMPANY }) },
    company: { findUnique: async ({ where, select }) => {
      assert.equal(where.id, COMPANY)
      assert.deepEqual(select, { enabled: true })
      if (failDatabase) throw new Error('synthetic database failure')
      return { enabled }
    } },
    $queryRaw: async (strings, ...values) => {
      const sql = strings.join('?')
      seen.push({ sql, values })
      if (sql.includes('FROM website_site')) return [{ id: SITE, company_id: COMPANY, company_slug: 'acme', name: 'Acme', source_type: 'builder', domain: 'site.example.com', analytics_mode: 'consent_required', turnstile_site_key: 'public-key' }]
      return []
    },
  }
  return { prisma, seen }
}

test('WR-17 disabled-company check is exercised and blocks site response', async () => {
  invalidatePrimaryCache()
  const { prisma, seen } = prismaFixture({ enabled: false })
  const app = createPublicWebsiteRouter({ prisma, supabaseAdmin: {} })
  const result = await app.request('https://site.example.com/resolve', { headers: { Host: 'site.example.com' } })
  assert.equal(result.status, 200)
  assert.equal((await result.json()).site, null)
  assert.ok(!seen.some(x => x.sql.includes('FROM website_page')))
})

test('WR-17 enabled fixture keeps tenant predicates and public projection', async () => {
  invalidatePrimaryCache()
  const { prisma, seen } = prismaFixture()
  const app = createPublicWebsiteRouter({ prisma, supabaseAdmin: {} })
  const result = await app.request('https://site.example.com/resolve', { headers: { Host: 'site.example.com' } })
  assert.equal(result.status, 200)
  const body = await result.json()
  assert.equal(body.site.company, 'acme')
  assert.equal(body.site.turnstileSiteKey, 'public-key')
  assert.equal(body.site.turnstileSecretKey, undefined)
  for (const query of seen.filter(x => /FROM website_page|FROM website_menu/.test(x.sql))) {
    assert.ok(query.values.includes(COMPANY))
    assert.ok(query.values.includes(SITE))
  }
})

test('WR-17 genuine database error still returns 500 with valid Prisma interface', async () => {
  invalidatePrimaryCache()
  const { prisma } = prismaFixture({ failDatabase: true })
  const app = createPublicWebsiteRouter({ prisma, supabaseAdmin: {} })
  const result = await app.request('https://site.example.com/resolve', { headers: { Host: 'site.example.com' } })
  assert.equal(result.status, 500)
})

test('WR-16 compatibility: Growth creates a form with propertyId in legacy siteId', async () => {
  const PROPERTY = '01900000-0000-7000-8000-000000000003'
  let created
  const app = createGrowthFormRoutes({
    formsService: { createForm: async args => { created = args; return { id: SITE, ...args.data } } },
    growthPropertyService: { assertProperty: async ({ propertyId }) => { assert.equal(propertyId, PROPERTY) } },
    requirePermission: () => async (c, next) => { c.set('companyId', COMPANY); await next() },
  })
  const result = await app.request('http://audit.test/growth/forms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ propertyId: PROPERTY, name: 'Fixture' }) })
  assert.equal(result.status, 201)
  assert.equal(created.siteId, PROPERTY)
  assert.equal(created.companyId, COMPANY)
})
