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

async function fixture({ siteType = 'website', can = () => true } = {}) {
  const k = ++n, folder = join(root, String(k))
  const storage = {
    async put(key, bytes) { const path = resolve(folder, key); assert.ok(path.startsWith(resolve(folder))); await mkdir(resolve(path, '..'), { recursive: true }); try { await writeFile(path, bytes, { flag: 'wx' }) } catch (e) { if (e.code !== 'EEXIST') throw e } },
    async get(key) { const path = resolve(folder, key); assert.ok(path.startsWith(resolve(folder))); return readFile(path) },
  }
  const company = await db.company.create({ data: { id: await uuid(), name: 'Template fixture', slug: `tpl-${k}` } })
  const actor = await db.userProfile.create({ data: { id: await uuid(), authUserId: await uuid(), email: `tpl-${k}@example.test`, displayName: 'Template test' } })
  const access = createWebsiteAccess({ companyId: company.id, actorId: actor.id, can })
  const ctx = { companyId: company.id, access }
  const publication = createWebsitePublicationContext({ prisma: db, storage, runtime: async () => runtime, namespaceRoot: 'sites.example.test', adminHosts: ['erp.example.test'] })
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
