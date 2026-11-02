// Audit observations, NOT acceptance tests. Each assertion records current behavior.
// Run from the repository root: node --test docs/superpowers/evidence/2026-11-02-website-recovery/probes.mjs
// No application bootstrap, .env loading, sockets, real database or Storage client.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { createDistUploadService } from '../../../../apps/api/src/services/dist-upload-service.js'
import { createDistServeService, invalidatePrimaryCache } from '../../../../apps/api/src/services/dist-serve-service.js'
import { createWebsiteService } from '../../../../apps/api/src/routes/website/website-service.js'
import { createPagesRouter } from '../../../../apps/api/src/routes/website/pages-routes.js'
import { createBlogRouter } from '../../../../apps/api/src/routes/website/blog-routes.js'
import { createPublicWebsiteRouter } from '../../../../apps/api/src/routes/public-website.js'
import { createFormsService } from '../../../../apps/api/src/services/forms-service.js'
import { saveDraftSchema } from '../../../../apps/api/src/routes/website/validators.js'
import { createStorefrontCaptureService } from '../../../../apps/api/src/services/storefront-capture-service.js'

globalThis.fetch = async () => { throw new Error('Network forbidden in audit probes') }
const requireApi = createRequire(new URL('../../../../apps/api/package.json', import.meta.url))
const JSZip = requireApi('jszip')
const COMPANY = '11111111-1111-7111-8111-111111111111'
const SITE = '22222222-2222-7222-8222-222222222222'
const OTHER_SITE = '33333333-3333-7333-8333-333333333333'
const PAGE = '44444444-4444-7444-8444-444444444444'
const html = '<html><head></head><body>fixture</body></html>'
async function zipOf(files) {
  const zip = new JSZip()
  for (const [name, content] of Object.entries(files)) zip.file(name, content)
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', platform: 'UNIX' })
}
function memoryStorage({ failAt = '' } = {}) {
  const objects = new Map()
  const uploaded = []
  const api = {
    upload: async (key, bytes, opts) => {
      if (key === failAt) return { error: { message: 'synthetic failure' } }
      uploaded.push({ key, bytes: bytes.length, opts })
      objects.set(key, Buffer.from(bytes))
      return { error: null }
    },
    remove: async keys => { keys.forEach(k => objects.delete(k)); return { error: null } },
    list: async () => ({ data: [{ name: 'fixture.zip', id: 'zip', metadata: { size: 1 } }], error: null }),
  }
  return { objects, uploaded, client: { storage: { from: () => api } } }
}
function uploadService(storage, writes = []) {
  return createDistUploadService({
    prisma: { $executeRaw: async (...args) => { writes.push(args); return 1 } },
    supabaseAdmin: storage.client,
  })
}
function sitePrisma({ status = 'draft' } = {}) {
  const row = { id: SITE, company_id: COMPANY, company_slug: 'acme', source_type: 'builder', domain: 'site.example.com', status }
  return {
    company: { findUnique: async () => ({ enabled: true }) },
    instanceConfig: { findUnique: async ({ where }) => ({ value: where.key === 'initialized' ? 'true' : COMPANY }) },
    $queryRaw: async strings => {
      const sql = strings.join('?')
      if (sql.includes('FROM website_site')) return [row]
      if (sql.includes('FROM website_page')) return [{ id: PAGE, title: 'Public', published_builder_data: { title: 'old' } }]
      return []
    },
  }
}
const context = headers => ({ req: { header: name => headers[name] } })

test('WR-01: public resolver returns a published page while site status is draft', async () => {
  invalidatePrimaryCache()
  const app = createPublicWebsiteRouter({ prisma: sitePrisma(), supabaseAdmin: {} })
  const res = await app.request('https://site.example.com/resolve?path=/', { headers: { host: 'site.example.com' } })
  assert.equal(res.status, 200)
  assert.equal((await res.json()).page.id, PAGE)
})

test('WR-02: unknown hostname resolves to primary site', async () => {
  invalidatePrimaryCache()
  const svc = createDistServeService({ prisma: sitePrisma(), supabaseAdmin: {} })
  assert.equal((await svc.resolveSiteForRequest(context({ host: 'unknown.invalid' }))).id, SITE)
})

test('WR-02: forwarded hostname overrides the actual Host', async () => {
  invalidatePrimaryCache()
  const prisma = sitePrisma()
  prisma.instanceConfig.findUnique = async () => null
  const svc = createDistServeService({ prisma, supabaseAdmin: {} })
  assert.equal((await svc.resolveSiteForRequest(context({ host: 'unknown.invalid', 'x-forwarded-host': 'site.example.com' }))).id, SITE)
})

test('WR-03: publish request body is ignored in favor of previously saved draft', async () => {
  const updates = []
  const saved = { id: PAGE, siteId: SITE, routePath: '/', draftBuilderData: 'old', status: 'draft' }
  const prisma = {
    websitePage: { findFirst: async () => saved, update: async ({ data }) => { updates.push(data); return { ...saved, ...data } } },
    websitePageVersion: { aggregate: async () => ({ _max: { versionNumber: null } }), create: async () => ({}) },
    websitePublishedRender: { upsert: async () => ({}) },
    auditLog: { create: async () => ({}) },
  }
  const app = createPagesRouter({ websiteSvc: createWebsiteService({ prisma }), requirePermission: () => async (c, next) => { c.set('companyId', COMPANY); await next() } })
  const res = await app.request(`http://audit.test/pages/${PAGE}/publish`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ draft_builder_data: 'new' }) })
  assert.equal(res.status, 200)
  assert.equal(updates[0].publishedBuilderData, 'old')
})

test('WR-04: page update can restore published status without publish permission', async () => {
  const usedPermissions = []
  const app = createPagesRouter({
    websiteSvc: { updatePage: async ({ data }) => data },
    requirePermission: key => async (c, next) => {
      usedPermissions.push(key)
      if (key === 'website.pages.publish') return c.json({ error: 'Forbidden' }, 403)
      c.set('companyId', COMPANY)
      await next()
    },
  })
  const res = await app.request(`http://audit.test/pages/${PAGE}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'published' }) })
  assert.equal(res.status, 200)
  assert.deepEqual(usedPermissions, ['website.pages.update'])
})

test('WR-05: page and form creation accept a site id without checking its company', async () => {
  let pageData, formData
  const svc = createWebsiteService({ prisma: {
    websitePage: { findFirst: async () => null, create: async ({ data }) => { pageData = data; return { id: PAGE, ...data } } },
    auditLog: { create: async () => ({}) },
  } })
  await svc.createPage({ companyId: COMPANY, siteId: OTHER_SITE, data: { title: 'Fixture', slug: 'fixture', routePath: '/' } })
  const forms = createFormsService({ prisma: { websiteForm: { create: async ({ data }) => { formData = data; return data } } } })
  await forms.createForm({ companyId: COMPANY, siteId: OTHER_SITE, data: { name: 'Fixture' } })
  assert.equal(pageData.siteId, OTHER_SITE)
  assert.equal(formData.siteId, OTHER_SITE)
})

test('WR-06: different sites in one company overwrite the same ZIP object', async () => {
  const storage = memoryStorage()
  const svc = uploadService(storage)
  await svc.uploadDist({ siteId: SITE, companySlug: 'acme', fileBuffer: await zipOf({ 'index.html': 'A' }) })
  await svc.uploadDist({ siteId: OTHER_SITE, companySlug: 'acme', fileBuffer: await zipOf({ 'index.html': 'B' }) })
  assert.equal(storage.objects.get('dist/acme/index.html').toString(), 'B')
  assert.equal(storage.uploaded.filter(x => x.key === 'dist/acme/index.html').length, 2)
})

test('WR-07: failed upload leaves partially replaced public objects before DB update', async () => {
  const storage = memoryStorage({ failAt: 'dist/acme/bad.js' })
  storage.objects.set('dist/acme/index.html', Buffer.from('old'))
  const writes = []
  await assert.rejects(uploadService(storage, writes).uploadDist({ siteId: SITE, companySlug: 'acme', fileBuffer: await zipOf({ 'index.html': 'new', 'bad.js': 'fixture' }) }))
  assert.equal(storage.objects.get('dist/acme/index.html').toString(), 'new')
  assert.equal(writes.length, 0)
})

test('WR-08: wrapped ZIP slices unrelated entries instead of rejecting them', async () => {
  const storage = memoryStorage()
  await uploadService(storage).uploadDist({ siteId: SITE, companySlug: 'acme', fileBuffer: await zipOf({ 'dist/index.html': html, 'outside.txt': 'fixture' }) })
  assert.ok(storage.objects.has('dist/acme/de.txt'))
})

test('WR-09: reserved files, source files and symlink-marked entries are accepted', async () => {
  const zip = new JSZip()
  zip.file('index.html', html)
  zip.file('.env', 'PUBLIC_FIXTURE=synthetic')
  zip.file('server.js', '// synthetic server source, never executed')
  zip.file('link', 'target', { unixPermissions: 0o120777 })
  const storage = memoryStorage()
  await uploadService(storage).uploadDist({ siteId: SITE, companySlug: 'acme', fileBuffer: await zip.generateAsync({ type: 'nodebuffer', platform: 'UNIX' }) })
  for (const name of ['.env', 'server.js', 'link']) assert.ok(storage.objects.has(`dist/acme/${name}`))
})

test('WR-09: compressed expansion above 500:1 is accepted (bounded 1 MiB fixture)', async () => {
  const bytes = await zipOf({ 'index.html': html, 'large.txt': 'A'.repeat(1024 * 1024) })
  assert.ok((1024 * 1024) / bytes.length > 500)
  const storage = memoryStorage()
  await uploadService(storage).uploadDist({ siteId: SITE, companySlug: 'acme', fileBuffer: bytes })
  assert.equal(storage.objects.get('dist/acme/large.txt').length, 1024 * 1024)
})

test('ZIP traversal is normalized by JSZip, not rejected by application policy', async () => {
  const storage = memoryStorage()
  await uploadService(storage).uploadDist({ siteId: SITE, companySlug: 'acme', fileBuffer: await zipOf({ 'index.html': html, '../outside.txt': 'fixture' }) })
  assert.ok(storage.objects.has('dist/acme/outside.txt'))
  assert.ok(!storage.objects.has('dist/acme/../outside.txt'))
})

test('WR-10: build history URL uses internal URL instead of configured public URL', async () => {
  const keys = ['SUPABASE_URL', 'RUNLY_SUPABASE_PUBLIC_URL']
  const previous = keys.map(k => process.env[k])
  try {
    process.env.SUPABASE_URL = 'http://storage-internal.test:8000'
    process.env.RUNLY_SUPABASE_PUBLIC_URL = 'https://storage.example.com'
    const rows = await uploadService(memoryStorage()).listBuilds({ companySlug: 'acme' })
    assert.ok(rows[0].downloadUrl.startsWith('http://storage-internal.test:8000/'))
  } finally {
    keys.forEach((k, i) => { if (previous[i] === undefined) delete process.env[k]; else process.env[k] = previous[i] })
  }
})

test('WR-11: validated draft endpoint rejects serialized string used by editor', () => {
  assert.equal(saveDraftSchema.safeParse({ builderData: '{"schemaVersion":1}' }).success, false)
})

test('WR-15: blog category PATCH forwards a new companyId to persistence', async () => {
  let written
  const prisma = { websiteBlogCategory: {
    findFirst: async ({ where }) => ({ id: PAGE, companyId: where.companyId }),
    update: async ({ data }) => { written = data; return data },
  } }
  const app = createBlogRouter({ websiteSvc: createWebsiteService({ prisma }), requirePermission: () => async (c, next) => { c.set('companyId', COMPANY); await next() } })
  const res = await app.request(`http://audit.test/blog/categories/${PAGE}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId: OTHER_SITE, siteId: OTHER_SITE }) })
  assert.equal(res.status, 200)
  assert.equal(written.companyId, OTHER_SITE)
})

test('WR-16: distinct GrowthProperty id makes an existing Website form unreachable', async () => {
  let queriedSiteId
  const service = createStorefrontCaptureService({ prisma: {
    company: { findFirst: async () => ({ id: COMPANY, slug: 'acme' }) },
    growthProperty: {
      findFirst: async () => null,
      upsert: async () => ({ id: OTHER_SITE, companyId: COMPANY, websiteSiteId: SITE }),
    },
    websiteSite: { findFirst: async () => ({ id: SITE, companyId: COMPANY }) },
    websiteForm: { findFirst: async ({ where }) => {
      queriedSiteId = where.siteId
      return where.siteId === SITE ? { id: PAGE, siteId: SITE, fields: [] } : null
    } },
  } })
  await assert.rejects(service.getPublicForm({ companySlug: 'acme', siteId: SITE, formId: PAGE }), e => e.code === 'form_not_found' && e.status === 404)
  assert.equal(queriedSiteId, OTHER_SITE)
})

test('ZIP support: missing root index is rejected; source plus index is accepted', async () => {
  const svc = uploadService(memoryStorage())
  await assert.rejects(svc.uploadDist({ siteId: SITE, companySlug: 'acme', fileBuffer: await zipOf({ 'package.json': '{}' }) }), e => e.status === 422)
  await svc.uploadDist({ siteId: SITE, companySlug: 'acme', fileBuffer: await zipOf({ 'index.html': html, 'package.json': '{"scripts":{"start":"never-run"}}' }) })
})

for (const [layout, files] of Object.entries({
  html: { 'index.html': html, 'style.css': 'body{}' },
  vite: { 'dist/index.html': html, 'dist/assets/app.js': '// fixture' },
  vue: { 'index.html': html, 'assets/vue.js': '// fixture' },
  angular: { 'browser/index.html': html, 'browser/main.js': '// fixture' },
  astro: { 'index.html': html, '_astro/main.js': '// fixture', 'about/index.html': html },
  next: { 'index.html': html, '_next/static/main.js': '// fixture', 'about.html': html },
})) {
  test(`synthetic layout accepted: ${layout} (NOT framework build/browser certification)`, async () => {
    const storage = memoryStorage()
    const result = await uploadService(storage).uploadDist({ siteId: SITE, companySlug: 'acme', fileBuffer: await zipOf(files) })
    assert.equal(result.fileCount, Object.keys(files).length)
    assert.ok(storage.objects.has('dist/acme/index.html'))
  })
}
