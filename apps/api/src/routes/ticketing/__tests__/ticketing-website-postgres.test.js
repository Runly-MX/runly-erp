// runly.ticketing F6E: the Website "Evento con boletos" block on the real publication pipeline
// (prepare, activate, serve) against a disposable PostgreSQL (TICKETING_TEST_DATABASE_URL or
// BOOKINGS_TEST_DATABASE_URL, localhost only). Same contract as the Reservaciones block.
import { before, after, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Hono } from 'hono'
import { buildWebsitePublicRuntime } from '../../../../../../scripts/build-website-public-runtime.mjs'
import { createWebsiteService } from '../../website/website-service.js'
import { createWebsiteAccess } from '../../../services/website-authorization-service.js'
import { createWebsitePublicationContext } from '../../../services/website-publication-context.js'
import { serveWebsiteRelease } from '../../website/public-release-routes.js'
import { createTicketingRouter } from '../ticketing-routes.js'

const url = process.env.TICKETING_TEST_DATABASE_URL || process.env.BOOKINGS_TEST_DATABASE_URL
if (url && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)) throw new Error('Requiere una base PostgreSQL local desechable.')
const APP = 'https://app.example.test'

describe('runly.ticketing Website block on the real publication pipeline', { skip: !url }, () => {
  let db, runtime, n = 0
  const tag = () => `tw-${Date.now()}-${++n}`
  before(async () => {
    process.env.PUBLIC_APP_URL = APP
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
    runtime = await buildWebsitePublicRuntime()
  })
  after(async () => { await db?.$disconnect() })

  async function company() {
    const c = await db.company.create({ data: { name: `Foro ${tag()}`, slug: tag() } })
    const user = await db.userProfile.create({ data: { authUserId: crypto.randomUUID(), displayName: 'Admin', email: `${tag()}@example.test` } })
    await db.membership.create({ data: { companyId: c.id, userId: user.id } })
    const app = new Hono()
    app.use('*', async (ctx, next) => { ctx.set('companyId', c.id); ctx.set('userContext', { isAdmin: true, permissionSet: new Set(), profile: { id: user.id } }); return next() })
    app.route('', createTicketingRouter({ prisma: db, requirePermission: () => async (_c, next) => next(), env: { PUBLIC_APP_URL: APP } }))
    const api = async (method, path, body) => {
      const res = await app.request(path, { method, headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
      return { status: res.status, body: await res.json().catch(() => null) }
    }
    const slug = tag()
    const event = (await api('POST', '/ticketing/events', { title: 'Concierto', slug, timezone: 'America/Mexico_City' })).body.data
    await api('PATCH', `/ticketing/events/${event.id}`, { published: true, salesOpen: true })
    return { company: c, user, api, event, slug }
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
    const host = await publication.gateway.reserve({ ...args, slug: `tk-${tag()}` })
    let revision = 0
    const save = async (props) => {
      const doc = { schemaVersion: 1, regions: { main: { children: ['b'] } }, blocks: { b: { id: 'b', type: 'TicketingEventBlock', props } } }
      revision = (await svc.saveDraft({ ...ctx, pageId: page.id, builderData: doc, expectedRevision: revision })).revision
    }
    const publish = async (key) => {
      const current = await db.websiteSite.findUnique({ where: { id: s.id } })
      const r = await publication.releases.prepare({ ...args, kind: 'builder', baseReleaseId: current.activeReleaseId, expectedDraftRevision: current.draftRevision, expectedPublicationRevision: current.publicationRevision, changes: { publishPageIds: [page.id], includeThemeAndMenus: true }, idempotencyKey: `${key}-prepare-${k}-attempt` })
      await publication.releases.activate({ ...args, releaseId: r.id, expectedDraftRevision: r.draftRevision, expectedPublicationRevision: r.publicationRevision, manifestHash: r.manifestHash, idempotencyKey: `${key}-activate-${k}-attempt` })
    }
    const live = async () => {
      const app = new Hono()
      app.get('*', (c) => serveWebsiteRelease(c, publication.gateway, '/', publication.runtime, null))
      const res = await app.request(`http://${host.hostname}/`, { headers: { host: host.hostname } })
      const snapshot = await publication.gateway.resolve({ req: { url: `http://${host.hostname}/`, header: (name) => (name.toLowerCase() === 'host' ? host.hostname : undefined) } })
      return { status: res.status, csp: res.headers.get('content-security-policy'), html: await res.text(), props: snapshot.release.manifest.routes[0].document.blocks.b.props, dynamic: snapshot.release.manifest.dynamic }
    }
    return { save, publish, live }
  }

  it('publishes a published event of the company with its portal pinned and only that origin framable', async () => {
    const a = await company()
    const w = await site(a)
    await w.save({ event: a.slug, display: 'card', buttonLabel: 'Obtener boletos' })
    await w.publish('first')
    const first = await w.live()
    assert.equal(first.status, 200)
    assert.equal(first.props.portalUrl, `${APP}/app/p/boletos/${a.slug}`)
    assert.deepEqual(first.dynamic.filter((d) => d.kind === 'ticketing'), [{ kind: 'ticketing', eventId: a.event.id, slug: a.slug }])
    assert.match(first.csp, new RegExp(`frame-src ${APP.replace(/\./g, '\\.')};`))
    assert.match(first.csp, /frame-ancestors 'none'/)
  })

  it('refuses another company event, unpublished events and an empty block', async () => {
    const [a, b] = [await company(), await company()]
    const w = await site(a)
    const refused = async (props) => { await w.save(props); return w.publish(tag()).then(() => 'published', (e) => e.code) }
    assert.equal(await refused({ event: b.slug, display: 'button' }), 'resource_not_found', 'cross-company event')
    assert.equal(await refused({ event: '', display: 'card' }), 'ticket_event_required')
    await a.api('PATCH', `/ticketing/events/${a.event.id}`, { published: false })
    assert.equal(await refused({ event: a.slug, display: 'link' }), 'ticket_event_unpublished')
  })
})
