// End to end check of the built-in templates against a disposable PostgreSQL: apply, form provisioning, publish rules,
// release activation, SEO head and a real form submission. Run through scripts/test-website-postgres.mjs --templates-only.
import { before, after, test } from 'node:test'
import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { chromium } from 'playwright'
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { createPublicWebsiteRouter, createPublicCatalogRouter } from '../../public-website.js'
import { createPublicCheckoutRouter } from '../checkout-routes.js'
import { createStorefrontCaptureRoutes } from '../../storefront/storefront-capture-routes.js'
import { createDistServeService } from '../../../services/dist-serve-service.js'
import { createWebsiteOriginGuard } from '../../../services/website-origin-guard.js'
import { buildWebsitePublicRuntime } from '../../../../../../scripts/build-website-public-runtime.mjs'
import { createWebsiteService } from '../website-service.js'
import { createWebsiteAccess } from '../../../services/website-authorization-service.js'
import { createWebsitePublicationContext } from '../../../services/website-publication-context.js'
import { createWebsiteTemplateService } from '../../../services/website-template-service.js'
import { ensureTemplateForm } from '../../../services/website-template-forms.js'
import { createStorefrontCaptureService } from '../../../services/storefront-capture-service.js'
import { websiteSeoHead } from '../../../services/website-seo-head.js'
import { allTemplates } from '../../../../../desktop/src/website/runlyTemplates/index.js'

const url = process.env.RUNLY_WEBSITE_TEST_DATABASE_URL
const marker = process.env.RUNLY_WEBSITE_TEST_DISPOSABLE
if (!url || new URL(url).hostname !== '127.0.0.1' || new URL(url).pathname !== '/website_s2_test' || !/^runly-website-test-[a-f0-9-]+$/.test(marker ?? '')) throw new Error('Disposable runner required')
if (execFileSync('docker', ['port', marker, '5432/tcp'], { encoding: 'utf8' }).trim() !== `127.0.0.1:${new URL(url).port}`) throw new Error('Not the disposable database')

let db, root, runtime, n = 0
before(async () => { db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) }); root = await mkdtemp(join(tmpdir(), 'website-templates-')); runtime = await buildWebsitePublicRuntime() })
after(async () => { await db?.$disconnect(); if (root && resolve(root).startsWith(resolve(tmpdir()))) await rm(root, { recursive: true }) })
const uuid = async () => (await db.$queryRaw`SELECT uuidv7()::text id`)[0].id

async function fixture({ siteType = 'website', can = () => true, namespaceRoot = 'sites.example.test' } = {}) {
  const k = ++n, folder = join(root, String(k))
  const storage = {
    async put(key, bytes) { const path = resolve(folder, key); assert.ok(path.startsWith(resolve(folder))); await mkdir(resolve(path, '..'), { recursive: true }); try { await writeFile(path, bytes, { flag: 'wx' }) } catch (e) { if (e.code !== 'EEXIST') throw e } },
    async get(key) { const path = resolve(folder, key); assert.ok(path.startsWith(resolve(folder))); return readFile(path) },
  }
  const company = await db.company.create({ data: { id: await uuid(), name: 'Template fixture', slug: `tpl-${k}` } })
  const actor = await db.userProfile.create({ data: { id: await uuid(), authUserId: await uuid(), email: `tpl-${k}@example.test`, displayName: 'Template test' } })
  const access = createWebsiteAccess({ companyId: company.id, actorId: actor.id, can })
  const ctx = { companyId: company.id, access }
  const publication = createWebsitePublicationContext({ prisma: db, storage, runtime: async () => runtime, namespaceRoot, adminHosts: ['erp.example.test'] })
  const svc = createWebsiteService({ prisma: db, publicationContext: publication })
  const site = await svc.createSite({ ...ctx, data: { name: 'Sitio de prueba', siteType } })
  const args = { ...ctx, siteId: site.id }
  const host = await publication.gateway.reserve({ ...args, slug: `tenant-${k}` })
  const templates = createWebsiteTemplateService({ prisma: db })
  const apply = async (templateId, pageIds, extra = {}) => {
    const current = await db.websiteSite.findUnique({ where: { id: site.id } })
    return templates.apply({ ...args, templateId, pageIds, includeTheme: true, expectedRevision: current.draftRevision, idempotencyKey: `apply-${templateId}-${k}-${pageIds.join('-')}`.padEnd(20, 'x'), ...extra })
  }
  const prepare = async (pageIds) => {
    const current = await db.websiteSite.findUnique({ where: { id: site.id } })
    return publication.releases.prepare({ ...args, kind: 'builder', baseReleaseId: current.activeReleaseId, expectedDraftRevision: current.draftRevision, expectedPublicationRevision: current.publicationRevision, changes: { publishPageIds: pageIds, includeThemeAndMenus: true }, idempotencyKey: `prepare-${k}-${pageIds.length}`.padEnd(20, 'x') })
  }
  const activate = (r) => publication.releases.activate({ ...args, releaseId: r.id, expectedDraftRevision: r.draftRevision, expectedPublicationRevision: r.publicationRevision, manifestHash: r.manifestHash, idempotencyKey: `activate-${k}-${r.id}`.padEnd(20, 'x') })
  const request = (path = '/') => ({ req: { url: `http://${host.hostname}${path}`, header: (name) => (name.toLowerCase() === 'host' ? host.hostname : undefined) } })
  return { k, company, actor, site, args, host, publication, apply, prepare, activate, request }
}

const draftsOf = (f) => db.websitePage.findMany({ where: { siteId: f.site.id }, select: { id: true, routePath: true, draftBuilderData: true } })
const formBlocks = (page) => Object.values(page.draftBuilderData.blocks).filter((block) => block.type === 'ContactFormBlock')

for (const template of allTemplates) {
  test(`${template.id}: apply, provision forms, pass the publish rules and activate a release`, async () => {
    const f = await fixture({ siteType: template.id === 'atlas-tienda' ? 'ecommerce' : 'website' })
    const applied = await f.apply(template.id, template.pages.map((p) => p.id))
    const pages = await draftsOf(f)
    assert.equal(pages.length, template.pages.length)

    // No placeholder survives; every form block points at a real, publishable form of this site.
    const blocks = pages.flatMap(formBlocks)
    for (const block of blocks) {
      assert.ok(!String(block.props.formId).startsWith('@'), `placeholder left in ${template.id}`)
      const status = await f.publication.contracts.form({ ...f.args, formId: block.props.formId })
      assert.equal(status.state, 'publishable', `${template.id} form ${block.props.formId}: ${JSON.stringify(status)}`)
    }
    const forms = await db.websiteForm.findMany({ where: { siteId: f.site.id }, include: { fields: true } }).catch(() => db.websiteForm.findMany({ where: { siteId: f.site.id } }))
    assert.ok(forms.some((form) => form.name === 'Contacto'), `${template.id} should have a Contacto form`)

    const pageIds = applied.pages.map((p) => p.id)
    const report = await f.publication.releases.preflight({ ...f.args, changes: { publishPageIds: pageIds } })
    assert.equal(report.canPublish, true, `${template.id} preflight: ${JSON.stringify(report.issues ?? report).slice(0, 600)}`)
    const release = await f.prepare(pageIds)
    assert.equal(release.state, 'ready')
    await f.activate(release)

    const snapshot = await f.publication.gateway.resolve(f.request('/'))
    const home = f.publication.gateway.response(snapshot, '/')
    assert.ok(home.page, `${template.id} home is published`)
    const head = websiteSeoHead({ page: home.page, identity: snapshot.release.manifest.identity, origin: `https://${f.host.hostname}` })
    assert.match(head, new RegExp(`rel="canonical" href="https://${f.host.hostname.replace(/\./g, '\\.')}/"`))
    for (const route of template.pages) assert.ok(f.publication.gateway.response(snapshot, route.routePath).page, `${template.id} ${route.routePath} published`)
  })
}

test('the contact form captures a real submission from the applied Maya template', async () => {
  const f = await fixture()
  await f.apply('atlas-maya', ['contacto'])
  const [page] = await draftsOf(f)
  const [block] = formBlocks(page)
  const release = await f.prepare([page.id]); await f.activate(release)
  const capture = createStorefrontCaptureService({ prisma: db })
  const input = { companySlug: f.company.slug, websiteSiteId: f.site.id, formId: block.props.formId, origin: `https://${f.host.hostname}` }
  const definition = await capture.getPublicForm(input)
  assert.deepEqual(definition.fields.map((field) => field.name ?? field.key), ['nombre', 'correo', 'mensaje'])
  const submission = await capture.submitForm({ ...input, idempotencyKey: 'template-contact-submission', payload: { values: { nombre: 'Visitante', correo: 'visitante@example.test', mensaje: 'Hola' }, expectedDefinitionRevision: definition.definitionRevision } })
  assert.ok(submission)
  assert.equal(await db.websiteFormSubmission.count({ where: { formId: block.props.formId } }), 1)
})

test('forms are reused by name and created once per site', async () => {
  const f = await fixture({ siteType: 'ecommerce' })
  await f.apply('atlas-tienda', ['home', 'contacto'])
  const names = (await db.websiteForm.findMany({ where: { siteId: f.site.id } })).map((form) => form.name).sort()
  assert.deepEqual(names, ['Contacto', 'Newsletter'])
  const again = await db.$transaction((tx) => ensureTemplateForm({ tx, companyId: f.company.id, siteId: f.site.id, placeholder: '@contact' }))
  assert.equal(await db.websiteForm.count({ where: { siteId: f.site.id, name: 'Contacto' } }), 1)
  assert.ok(again)
  const newsletter = await db.websiteForm.findFirst({ where: { siteId: f.site.id, name: 'Newsletter' } })
  assert.equal(await db.websiteFormField.count({ where: { formId: newsletter.id } }), 1)
})

test('a second template conflicts on shared routes unless it replaces the existing draft pages', async () => {
  const f = await fixture()
  await f.apply('atlas-impulsa', ['home', 'contacto'])
  const before = await draftsOf(f)
  await assert.rejects(f.apply('atlas-aura', ['home', 'precios']), (error) => error.code === 'route_conflict')
  const result = await f.apply('atlas-aura', ['home', 'precios'], { replaceExisting: true })
  assert.equal(result.replaced, 1)
  const live = await db.websitePage.findMany({ where: { siteId: f.site.id, enabled: true }, select: { routePath: true, draftBuilderData: true } })
  assert.deepEqual(live.map((p) => p.routePath).sort(), ['/', '/contacto', '/precios'])
  assert.equal(live.find((p) => p.routePath === '/').draftBuilderData.blocks.hero.type, 'CrHeroBlock')
  const old = await db.websitePage.findUnique({ where: { id: before.find((p) => p.routePath === '/').id } })
  assert.equal(old.enabled, false)
  assert.match(old.routePath, /^\/#deleted-/)
  const denied = await fixture({ can: (p) => p !== 'website.pages.delete' })
  await denied.apply('atlas-impulsa', ['home'])
  await assert.rejects(denied.apply('atlas-aura', ['home'], { replaceExisting: true }), (error) => error.status === 403 || error.code === 'permission_denied')
})

test('applying a template never leaks one site\'s form or brand into the next', async () => {
  const a = await fixture()
  await a.apply('atlas-maya', ['contacto'], { branding: { name: 'Marca de A' } })
  const b = await fixture()
  await b.apply('atlas-maya', ['contacto'])
  const [pageB] = await draftsOf(b)
  const [formB] = formBlocks(pageB)
  const own = await db.websiteForm.findFirst({ where: { siteId: b.site.id, name: 'Contacto' } })
  assert.equal(formB.props.formId, own.id, 'the form block points at the form of its own site')
  const brands = Object.values(pageB.draftBuilderData.blocks).map((block) => block.props?.brand).filter(Boolean)
  assert.ok(brands.length && brands.every((brand) => !brand.includes('Marca de A')), `brand leaked: ${brands}`)
})

// ---- Real browser checks: the published site is served by the real public runtime and driven in isolated Chromium ----

const skipBrowser = process.env.RUNLY_WEBSITE_TEST_SKIP_BROWSER === '1'
const sdk = async () => (await Promise.all(['runly-sdk.js', 'runly-sdk-chat.js', 'runly-sdk-chat-widget.js'].map((file) => readFile(resolve('apps/api/src/public', file), 'utf8')))).join('\n')

// Applies a template, publishes every page and serves the site on a loopback *.localhost host.
async function publishedSite(templateId, siteType = 'website') {
  const f = await fixture({ siteType, namespaceRoot: 'sites.localhost' })
  const template = allTemplates.find((t) => t.id === templateId)
  const applied = await f.apply(templateId, template.pages.map((p) => p.id))
  f.host = await db.websiteDomain.create({ data: { hostname: `browser-${f.k}.localhost`, companyId: f.company.id, siteId: f.site.id, kind: 'platform', state: 'assigned', ready: true } })
  await db.instanceConfig.upsert({ where: { key: 'initialized' }, create: { key: 'initialized', value: 'true' }, update: { value: 'true' } })
  const release = await f.prepare(applied.pages.map((p) => p.id)); await f.activate(release)
  const app = new Hono()
  app.use('*', createWebsiteOriginGuard({ gateway: f.publication.gateway, adminHosts: ['erp.example.test'] }))
  // The catalog is public; checkout talks to a fake Stripe that records what the server asks for.
  const stripeCalls = []
  class FakeStripe { constructor() { this.checkout = { sessions: { create: async (params) => { stripeCalls.push(params); return { url: 'https://checkout.stripe.test/session/1' } } } } } }
  app.route('/public/website', createPublicCheckoutRouter({ prisma: db, StripeImpl: FakeStripe, decryptPasswordImpl: () => 'sk_test_fixture' }))
  app.route('/public/website', createPublicWebsiteRouter({ prisma: db, publicationContext: f.publication }))
  app.route('/public/storefront/v1', createStorefrontCaptureRoutes({ captureService: createStorefrontCaptureService({ prisma: db }) }))
  app.route('/public/catalog', createPublicCatalogRouter({ prisma: db }))
  await db.$executeRaw`UPDATE website_site SET stripe_secret_key='encrypted-fixture' WHERE id=${f.site.id}::uuid`
  const sdkSource = await sdk()
  app.get('/public/site/runly-sdk.js', (c) => { c.header('Content-Type', 'text/javascript'); return c.body(sdkSource) })
  const dist = createDistServeService({ prisma: db, publicationContext: f.publication })
  app.get('*', (c) => dist.serve(c, c.req.path.startsWith('/public/site') ? c.req.path.slice('/public/site'.length) || '/' : c.req.path))
  let server
  const address = await new Promise((done) => { server = serve({ fetch: (request) => { const u = new URL(request.url); if (!u.pathname.startsWith('/public/')) u.pathname = '/public/site' + u.pathname; return app.fetch(new Request(u, request)) }, hostname: '127.0.0.1', port: 0 }, done) })
  const browser = await chromium.launch({ headless: true })
  const base = `http://${f.host.hostname}:${address.port}`
  const open = async (viewport = { width: 1280, height: 900 }) => {
    const context = await browser.newContext({ viewport })
    await context.route('**/*', (route) => { const u = new URL(route.request().url()); return u.hostname === f.host.hostname && u.port === String(address.port) ? route.continue({ headers: { ...route.request().headers(), 'accept-encoding': 'gzip, deflate, br' } }) : route.abort() })
    const page = await context.newPage()
    const problems = []
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
    page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text().slice(0, 200)}`) })
    page.on('response', (r) => { if (r.status() >= 400) problems.push(`http ${r.status()} ${new URL(r.url()).pathname}`) })
    return { page, problems }
  }
  const close = async () => { await browser.close(); await new Promise((done) => server.close(done)) }
  return { f, template, base, open, close, stripeCalls }
}

for (const template of allTemplates) {
  test(`${template.id}: every route runs in a real browser without errors or horizontal overflow (desktop and phone)`, { skip: skipBrowser }, async () => {
    const site = await publishedSite(template.id, template.id === 'atlas-tienda' ? 'ecommerce' : 'website')
    try {
      for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 800 }]) {
        const { page, problems } = await site.open(viewport)
        for (const route of template.pages) {
          const response = await page.goto(site.base + route.routePath)
          assert.equal(response.status(), 200, `${template.id} ${route.routePath}`)
          await page.waitForLoadState('networkidle').catch(() => {})
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
          assert.ok(overflow <= 1, `${template.id} ${route.routePath} @${viewport.width}px overflows by ${overflow}px`)
          const empty = await page.evaluate(() => (document.body.innerText || '').trim().length < 40)
          assert.equal(empty, false, `${template.id} ${route.routePath} rendered no content`)
        }
        const relevant = problems.filter((p) => !/favicon/.test(p))
        assert.deepEqual(relevant, [], `${template.id} @${viewport.width}px: ${relevant.join(' | ')}`)
      }
    } finally { await site.close() }
  })
}

test('Maya: the typewriter headline rotates and the contact form saves a real submission through the UI', { skip: skipBrowser }, async () => {
  const site = await publishedSite('atlas-maya')
  try {
    const { page, problems } = await site.open()
    await page.goto(site.base + '/')
    const samples = new Set()
    for (let i = 0; i < 30; i++) {
      samples.add(await page.evaluate(() => { const hits = [...document.querySelectorAll('*')].filter((e) => /^Diseño sitios web que/.test((e.textContent || '').trim()) && e.children.length < 4).map((e) => e.textContent.trim()); return hits.sort((a, b) => a.length - b.length)[0] ?? '' }))
      await page.waitForTimeout(300)
    }
    assert.ok(samples.size >= 4, `the headline should type and change, saw: ${[...samples].join(' / ')}`)

    await page.goto(site.base + '/contacto')
    await page.getByLabel('Nombre').fill('Visitante de prueba')
    await page.getByLabel('Correo').fill('visitante@example.test')
    await page.getByLabel('Mensaje').fill('Quiero un sitio nuevo')
    const responsePromise = page.waitForResponse((r) => r.url().endsWith('/submissions'))
    await page.getByRole('button', { name: /Enviar/ }).click()
    const response = await responsePromise
    assert.equal(response.status(), 201)
    const saved = await db.websiteFormSubmission.findUnique({ where: { id: (await response.json()).data.submissionId } })
    assert.equal(saved.data.correo, 'visitante@example.test')
    assert.equal(saved.data.nombre, 'Visitante de prueba')
    assert.deepEqual(problems.filter((p) => !/favicon/.test(p)), [])
  } finally { await site.close() }
})

test('Finora: counters reach their value, the loan calculator recomputes and the phone menu opens and closes', { skip: skipBrowser }, async () => {
  const site = await publishedSite('atlas-finora')
  try {
    const { page, problems } = await site.open()
    await page.goto(site.base + '/')
    await page.getByText('Clientes felices').scrollIntoViewIfNeeded()
    await page.waitForFunction(() => /1M\+/.test(document.body.innerText) && /100%/.test(document.body.innerText), null, { timeout: 8000 })

    const result = page.getByRole('status').first()
    await result.scrollIntoViewIfNeeded()
    const before = (await result.innerText()).replace(/\s+/g, ' ')
    const amount = page.getByLabel(/Monto/i).first()
    await amount.evaluate((el) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, el.max); el.dispatchEvent(new Event('input', { bubbles: true })) })
    await page.waitForTimeout(300)
    const after = (await result.innerText()).replace(/\s+/g, ' ')
    assert.notEqual(after, before, 'the monthly payment should change with the amount')

    const mobile = await site.open({ width: 390, height: 800 })
    await mobile.page.goto(site.base + '/')
    const menu = mobile.page.getByRole('button', { name: /men/i }).first()
    assert.equal(await menu.getAttribute('aria-expanded'), 'false')
    await menu.click()
    assert.equal(await menu.getAttribute('aria-expanded'), 'true')
    await mobile.page.getByRole('link', { name: 'Préstamos' }).last().waitFor({ state: 'visible' })
    await mobile.page.keyboard.press('Escape')
    assert.equal(await menu.getAttribute('aria-expanded'), 'false')
    assert.deepEqual([...problems, ...mobile.problems].filter((p) => !/favicon/.test(p)), [])
  } finally { await site.close() }
})

test('Aurora: the layered landscape moves while scrolling', { skip: skipBrowser }, async () => {
  const site = await publishedSite('atlas-aurora')
  try {
    const { page, problems } = await site.open()
    await page.goto(site.base + '/')
    const layer = page.locator('section [data-drift="0.14"]').nth(1)
    await layer.scrollIntoViewIfNeeded()
    await page.waitForTimeout(250)
    const first = await layer.evaluate((el) => el.style.transform)
    await page.mouse.wheel(0, 220)
    await page.waitForTimeout(400)
    const second = await layer.evaluate((el) => el.style.transform)
    assert.ok(first && second && first !== second, `parallax transform should change on scroll (${first} -> ${second})`)
    assert.deepEqual(problems.filter((p) => !/favicon/.test(p)), [])
  } finally { await site.close() }
})

test('Tienda: browse, add to cart, live cart count, checkout with trusted prices and promo codes, newsletter signup', { skip: skipBrowser }, async () => {
  const site = await publishedSite('atlas-tienda', 'ecommerce')
  try {
    const { f } = site
    const make = async (name, slug, price) => {
      const id = await uuid()
      await db.catalogProduct.create({ data: { id, companyId: f.company.id, name, slug, price, published: true } })
      await db.websiteCatalogProduct.create({ data: { companyId: f.company.id, siteId: f.site.id, productId: id, included: true } })
      return id
    }
    const linoId = await make('Camisa de lino', 'camisa-de-lino', 380)
    await make('Vela de soya', 'vela-de-soya', 620)

    const { page, problems } = await site.open()
    await page.goto(site.base + '/productos')
    await page.getByText('Camisa de lino').first().waitFor()
    const cartLink = page.getByRole('link', { name: /^Carrito/ }).first()
    assert.match(await cartLink.getAttribute('aria-label'), /^Carrito$/)

    await page.getByRole('button', { name: /Agregar al carrito/ }).first().click()
    await page.waitForFunction(() => /1 art/.test(document.querySelector('a[href="/carrito"][aria-label]')?.getAttribute('aria-label') ?? ''))
    await page.getByRole('button', { name: /Agregar al carrito/ }).nth(1).click()
    await page.waitForFunction(() => /2 art/.test(document.querySelector('a[href="/carrito"][aria-label]')?.getAttribute('aria-label') ?? ''))

    await page.goto(site.base + '/carrito')
    await page.getByText('Camisa de lino').first().waitFor()
    await page.getByText('Vela de soya').first().waitFor()
    assert.ok(await page.getByText(/código/i).first().isVisible(), 'the promo code note is shown')

    const checkout = page.waitForResponse((r) => r.url().endsWith('/public/website/checkout'))
    await page.getByRole('button', { name: /Pagar/ }).click()
    const checkoutResponse = await checkout
    assert.equal(checkoutResponse.status(), 200)
    await page.waitForURL(/checkout\.stripe\.test/, { waitUntil: 'commit' }).catch(() => {})
    assert.equal(site.stripeCalls.length, 1)
    const session = site.stripeCalls[0]
    assert.equal(session.allow_promotion_codes, true)
    assert.deepEqual(session.line_items.map((line) => [line.price_data.product_data.name, line.price_data.unit_amount, line.quantity]).sort(), [['Camisa de lino', 38000, 1], ['Vela de soya', 62000, 1]])

    // A forged request cannot choose its own price: the server reads it from the catalog.
    const probe = (await site.open()).page
    await probe.goto(site.base + '/productos')
    const forged = await probe.evaluate(async ({ siteId, productId }) => (await fetch('/public/website/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Site-Id': siteId }, body: JSON.stringify({ items: [{ productId, qty: 1, price: 0.01, unit_amount: 1 }] }) })).status, { siteId: f.site.id, productId: linoId })
    assert.equal(forged, 200)
    assert.equal(site.stripeCalls.at(-1).line_items[0].price_data.unit_amount, 38000)

    // The thank-you page empties the cart and the badge disappears.
    await page.goto(site.base + '/gracias')
    await page.waitForFunction(() => !/art/.test(document.querySelector('a[href="/carrito"]')?.getAttribute('aria-label') ?? ''))

    // Newsletter signup through the real form pipeline.
    await page.goto(site.base + '/productos')
    await page.getByLabel('Correo').first().fill('suscriptor@example.test')
    const submission = page.waitForResponse((r) => r.url().endsWith('/submissions'))
    await page.getByRole('button', { name: /Suscribirme/ }).first().click()
    assert.equal((await submission).status(), 201)
    const newsletter = await db.websiteForm.findFirst({ where: { siteId: f.site.id, name: 'Newsletter' } })
    assert.equal(await db.websiteFormSubmission.count({ where: { formId: newsletter.id } }), 1)

    assert.deepEqual(problems.filter((p) => !/favicon|checkout\.stripe/.test(p)), [])
  } finally { await site.close() }
})

// ---- Opt-in performance probe (RUNLY_WEBSITE_PERF=1): a mid-range phone (4x CPU slowdown, slow 4G) per template ----
// Reports time until the page is visible and frames per second while idle and while scrolling. Measures only.
const perf = process.env.RUNLY_WEBSITE_PERF === '1'
for (const template of allTemplates) {
  test(`${template.id}: phone performance probe`, { skip: skipBrowser || !perf }, async () => {
    const site = await publishedSite(template.id, template.id === 'atlas-tienda' ? 'ecommerce' : 'website')
    try {
      const { page } = await site.open({ width: 390, height: 800 })
      const cdp = await page.context().newCDPSession(page)
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 })
      await page.goto(site.base + '/', { waitUntil: 'commit' })
      const visible = await page.waitForFunction(() => document.querySelector('#runly-public-root header, #runly-public-root nav') && performance.now(), null, { timeout: 60000, polling: 50 }).then((h) => h.jsonValue())
      await page.waitForTimeout(1500)
      const sample = (scroll) => page.evaluate((scroll) => new Promise((done) => {
        let frames = 0, long = 0
        const obs = new PerformanceObserver((list) => { for (const e of list.getEntries()) long += e.duration })
        try { obs.observe({ type: 'longtask' }) } catch {}
        const start = performance.now()
        const tick = (now) => { frames += 1; if (scroll) window.scrollBy(0, 14); if (now - start < 3000) requestAnimationFrame(tick); else { obs.disconnect(); done({ fps: Math.round(frames / ((now - start) / 1000)), long: Math.round(long) }) } }
        requestAnimationFrame(tick)
      }), scroll)
      const idle = await sample(false)
      const scrolling = await sample(true)
      console.log(`PERF ${template.id.padEnd(18)} visible ${String(Math.round(visible)).padStart(5)} ms | idle ${String(idle.fps).padStart(3)} fps, ${String(idle.long).padStart(5)} ms blocked | scroll ${String(scrolling.fps).padStart(3)} fps, ${String(scrolling.long).padStart(5)} ms blocked`)
    } finally { await site.close() }
  })
}
