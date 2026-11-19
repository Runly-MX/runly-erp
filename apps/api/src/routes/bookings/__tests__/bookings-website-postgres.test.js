// runly.bookings phase 4B: the Website "Reservaciones" block on the real publication
// pipeline (prepare, activate, serve, rollback) against a disposable PostgreSQL
// (BOOKINGS_TEST_DATABASE_URL, localhost only).
import { before, after, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Hono } from 'hono'
import { buildWebsitePublicRuntime } from '../../../../../../scripts/build-website-public-runtime.mjs'
import { createWebsiteService } from '../../website/website-service.js'
import { createWebsiteAccess } from '../../../services/website-authorization-service.js'
import { createWebsitePublicationContext } from '../../../services/website-publication-context.js'
import { serveWebsiteRelease } from '../../website/public-release-routes.js'
import { createBookingsRouter } from '../bookings-routes.js'

const url = process.env.BOOKINGS_TEST_DATABASE_URL
if (url && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)) throw new Error('Requiere una base PostgreSQL local desechable.')
const APP = 'https://app.example.test'

describe('runly.bookings Website block on the real publication pipeline', { skip: !url }, () => {
  let db, runtime, n = 0
  const tag = () => `bw-${Date.now()}-${++n}`
  before(async () => {
    process.env.PUBLIC_APP_URL = APP
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
    runtime = await buildWebsitePublicRuntime()
  })
  after(async () => { await db?.$disconnect() })

  async function company() {
    const c = await db.company.create({ data: { name: `Empresa ${tag()}`, slug: tag() } })
    const user = await db.userProfile.create({ data: { authUserId: crypto.randomUUID(), displayName: 'Admin', email: `${tag()}@example.test` } })
    await db.membership.create({ data: { companyId: c.id, userId: user.id } })
    const app = new Hono()
    app.use('*', async (ctx, next) => { ctx.set('companyId', c.id); ctx.set('userContext', { isAdmin: true, permissionSet: new Set(), profile: { id: user.id } }); return next() })
    app.route('', createBookingsRouter({ prisma: db, requirePermission: () => async (_c, next) => next(), env: { PUBLIC_APP_URL: APP } }))
    const api = async (method, path, body) => {
      const res = await app.request(path, { method, headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
      return { status: res.status, body: await res.json().catch(() => null) }
    }
    const space = (await api('POST', '/bookings/spaces', { name: 'Clínica', slug: tag(), timezone: 'America/Mexico_City' })).body.data
    const services = []
    for (const name of ['Consulta', 'Limpieza']) services.push((await api('POST', `/bookings/spaces/${space.id}/services`, { name, kind: 'appointment', durationMinutes: 30 })).body.data)
    const slug = `w-${tag()}`.slice(0, 60)
    const page = (await api('POST', `/bookings/spaces/${space.id}/pages`, { slug, title: 'Agenda', serviceIds: [services[0].id], published: true })).body.data
    await api('PATCH', `/bookings/spaces/${space.id}`, { published: true })
    return { company: c, user, api, space, services, page, slug }
  }

  async function site(owner) {
    const k = ++n, files = new Map()
    const storage = { async put(key, bytes) { files.set(key, Buffer.from(bytes)) }, async get(key) { return files.get(key) } }
    const access = createWebsiteAccess({ companyId: owner.company.id, actorId: owner.user.id, can: () => true })
    const ctx = { companyId: owner.company.id, access }
    const publication = createWebsitePublicationContext({ prisma: db, storage, runtime: async () => runtime, namespaceRoot: 'sites.example.test', adminHosts: ['erp.example.test'] })
    const svc = createWebsiteService({ prisma: db, publicationContext: publication })
    const s = await svc.createSite({ ...ctx, data: { name: `Sitio ${k}` } })
    const page = await svc.createPage({ ...ctx, siteId: s.id, data: { title: 'Inicio', slug: 'inicio', routePath: '/' } })
    const args = { ...ctx, siteId: s.id }
    const host = await publication.gateway.reserve({ ...args, slug: `bk-${tag()}` })
    let revision = 0
    const save = async (props) => {
      const doc = { schemaVersion: 1, regions: { main: { children: ['b'] } }, blocks: { b: { id: 'b', type: 'BookingPortalBlock', props } } }
      revision = (await svc.saveDraft({ ...ctx, pageId: page.id, builderData: doc, expectedRevision: revision })).revision
    }
    const publish = async (key) => {
      const current = await db.websiteSite.findUnique({ where: { id: s.id } })
      const r = await publication.releases.prepare({ ...args, kind: 'builder', baseReleaseId: current.activeReleaseId, expectedDraftRevision: current.draftRevision, expectedPublicationRevision: current.publicationRevision, changes: { publishPageIds: [page.id], includeThemeAndMenus: true }, idempotencyKey: `${key}-prepare-${k}-attempt` })
      await publication.releases.activate({ ...args, releaseId: r.id, expectedDraftRevision: r.draftRevision, expectedPublicationRevision: r.publicationRevision, manifestHash: r.manifestHash, idempotencyKey: `${key}-activate-${k}-attempt` })
      return r
    }
    const live = async () => {
      const app = new Hono()
      app.get('*', (c) => serveWebsiteRelease(c, publication.gateway, '/', publication.runtime, null))
      const res = await app.request(`http://${host.hostname}/`, { headers: { host: host.hostname } })
      const snapshot = await publication.gateway.resolve({ req: { url: `http://${host.hostname}/`, header: (name) => (name.toLowerCase() === 'host' ? host.hostname : undefined) } })
      return { status: res.status, csp: res.headers.get('content-security-policy'), props: snapshot.release.manifest.routes[0].document.blocks.b.props, dynamic: snapshot.release.manifest.dynamic }
    }
    return { svc, ctx, page, save, publish, live, publication, args, siteId: s.id }
  }

  it('publishes a page of the company with its portal address pinned and only that origin framable', async () => {
    const a = await company()
    const w = await site(a)
    await w.save({ bookingPage: a.slug, serviceId: a.services[0].id, display: 'calendar', buttonLabel: 'Reservar' })
    await w.publish('first')
    const first = await w.live()
    assert.equal(first.status, 200)
    assert.equal(first.props.portalUrl, `${APP}/app/p/reservar/${a.slug}`)
    assert.deepEqual(first.dynamic.filter((d) => d.kind === 'booking'), [{ kind: 'booking', pageId: a.page.id, slug: a.slug, serviceId: a.services[0].id }])
    assert.match(first.csp, new RegExp(`frame-src ${APP.replace(/\./g, '\\.')};`))
    assert.match(first.csp, /frame-ancestors 'none'/)

    // Second version as a button; rollback brings back the first configuration, the draft keeps the newest.
    await w.save({ bookingPage: a.slug, display: 'button', buttonLabel: 'Agenda aquí' })
    await w.publish('second')
    assert.equal((await w.live()).props.display, 'button')
    const current = await db.websiteSite.findUnique({ where: { id: w.siteId } })
    const firstRelease = (await db.websiteRelease.findMany({ where: { siteId: w.siteId, state: { not: 'preparing' } }, orderBy: { createdAt: 'asc' } }))[0]
    await w.publication.releases.rollback({ ...w.args, releaseId: firstRelease.id, expectedPublicationRevision: current.publicationRevision, idempotencyKey: `rollback-${tag()}-attempt` })
    const rolled = await w.live()
    assert.deepEqual([rolled.props.display, rolled.props.serviceId, rolled.props.buttonLabel], ['calendar', a.services[0].id, 'Reservar'])
    assert.equal((await db.websitePage.findUnique({ where: { id: w.page.id } })).draftBuilderData.blocks.b.props.display, 'button')
  })

  it('refuses another company page, unpublished pages and services the page does not offer', async () => {
    const [a, b] = [await company(), await company()]
    const w = await site(a)
    const refused = async (props) => { await w.save(props); return w.publish(tag()).then(() => 'published', (e) => e.code) }
    assert.equal(await refused({ bookingPage: b.slug, display: 'calendar' }), 'resource_not_found', 'cross-company page')
    assert.equal(await refused({ bookingPage: a.slug, serviceId: a.services[1].id, display: 'calendar' }), 'booking_service_unavailable')
    assert.equal(await refused({ bookingPage: '', display: 'calendar' }), 'booking_page_required')
    await a.api('PATCH', `/bookings/pages/${a.page.id}`, { published: false })
    assert.equal(await refused({ bookingPage: a.slug, display: 'link' }), 'booking_page_unpublished')
    // The block alone never opens frame-src on a site without it.
    const other = await site(b)
    const doc = { schemaVersion: 1, regions: { main: { children: ['h'] } }, blocks: { h: { id: 'h', type: 'HeroBlock', props: { title: 'Hola' } } } }
    await other.svc.saveDraft({ ...other.ctx, pageId: other.page.id, builderData: doc, expectedRevision: 0 })
    await other.publish('plain')
    const app = new Hono()
    app.get('*', (c) => serveWebsiteRelease(c, other.publication.gateway, '/', other.publication.runtime, null))
    const host = (await db.websiteDomain.findFirst({ where: { siteId: other.siteId } })).hostname
    assert.match((await app.request(`http://${host}/`, { headers: { host } })).headers.get('content-security-policy'), /frame-src 'none'/)
  })
})
