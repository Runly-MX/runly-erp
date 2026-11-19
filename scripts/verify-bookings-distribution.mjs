// End-to-end verification of runly.bookings phase 4 (distribution) on a disposable full
// stack: real Supabase, every migration + seed, API, web build, the real worker process
// and nginx with infra/nginx/spa.conf. Nothing touches 4010/5173 or the regular database.
//   node scripts/verify-bookings-distribution.mjs [--keep]
// Topology (all local):
//   APP   http://127.0.0.1:<p>      the ERP web, behind a proxy that applies the same
//                                    frame-ancestors rule as nginx (asks the API per URL)
//   EXT_A http://localhost:<p>      an external website the business authorized
//   EXT_B http://localhost:<p>      an external website nobody authorized
//   SITE  http://<x>.sites.localhost:<p>  a Runly Website published with the block
//   NGINX http://127.0.0.1:<p>      nginx:alpine running infra/nginx/spa.conf (headers only)
import { spawn, spawnSync } from 'node:child_process'
import http from 'node:http'
import net from 'node:net'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { bootBookingsStack } from './fixtures/bookings/bookings-stack.mjs'
import { buildWebsitePublicRuntime, buildWebsiteSsr } from './build-website-public-runtime.mjs'
import { embedSnippets } from '../apps/desktop/src/modules/runly.bookings/lib/embedSnippets.js'

const results = [], errors = [], openPages = [], cleanups = []
const ok = (name, cond, detail = '') => { results.push({ name, ok: Boolean(cond) }); console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`) }
const freePort = () => new Promise((done) => { const srv = net.createServer(); srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => done(port)) }) })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
async function until(fn, timeout = 30000) { const end = Date.now() + timeout; while (Date.now() < end) { const v = await fn().catch(() => null); if (v) return v; await wait(500) } return null }

const ports = { app: await freePort(), extA: await freePort(), extB: await freePort(), site: await freePort(), nginx: await freePort() }
const APP = `http://127.0.0.1:${ports.app}`, EXT_A = `http://localhost:${ports.extA}`, EXT_B = `http://localhost:${ports.extB}`
const runtimeDir = resolve('.artifacts/website-public-runtime/bookings-distribution')
Object.assign(process.env, { PUBLIC_APP_URL: APP, RUNLY_APP_URL: APP, RUNLY_WEBSITE_RUNTIME_DIR: runtimeDir, RUNLY_WEBSITE_NAMESPACE_ROOT: 'sites.localhost' })
const runtimeFiles = await buildWebsitePublicRuntime(runtimeDir)
await buildWebsiteSsr(runtimeDir, runtimeFiles['entry.js'].hash)

const s = await bootBookingsStack({ keep: process.argv.includes('--keep'), env: (stack) => ({
  CORS_ORIGIN: `${stack.urls.web},${APP}`, PUBLIC_APP_URL: APP, RUNLY_APP_URL: APP, RUNLY_WEBSITE_RUNTIME_DIR: runtimeDir, RUNLY_WEBSITE_NAMESPACE_ROOT: 'sites.localhost',
}) })
const shots = join(s.stack.directory, 'shots')
await mkdir(shots, { recursive: true })
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: s.dbUrl }) })
const PW = `Bk-${s.run}-Aa1!x`

// ---- Local servers ---------------------------------------------------------------
function forward(req, res, target, path, extraHeaders = {}) {
  const t = new URL(target)
  const up = http.request({ host: t.hostname, port: t.port, method: req.method, path, headers: req.headers }, (u) => { res.writeHead(u.statusCode, { ...u.headers, ...extraHeaders }); u.pipe(res) })
  up.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end() })
  req.pipe(up)
}
const askApi = (path, headers) => new Promise((done) => {
  const t = new URL(s.urls.api)
  http.get({ host: t.hostname, port: t.port, path, headers }, (r) => { r.resume(); done({ status: r.statusCode, headers: r.headers }) }).on('error', () => done({ status: 502, headers: {} }))
})
function serve(port, handler, host) {
  const srv = http.createServer(handler)
  return new Promise((done) => srv.listen(port, host, () => { cleanups.push(() => new Promise((r) => { srv.closeAllConnections(); srv.close(r) })); done(srv) }))
}
// APP: same rule as the nginx location for /app/p/reservar/ (auth_request to the API).
await serve(ports.app, async (req, res) => {
  if (req.method === 'GET' && req.url.startsWith('/app/p/reservar/')) {
    const gate = await askApi('/public/bookings/frame-policy', { host: req.headers.host, 'x-original-uri': req.url })
    if (gate.status !== 204) { res.writeHead(gate.status); return res.end() }
    return forward(req, res, s.urls.web, req.url, { 'content-security-policy': `frame-ancestors ${gate.headers['x-booking-frame-ancestors'] ?? ''}` })
  }
  forward(req, res, s.urls.web, req.url)
}, '127.0.0.1')
// SITE: what nginx does for a website hostname (/ -> /public/site/, /public/* as is).
await serve(ports.site, (req, res) => forward(req, res, s.urls.api, req.url.startsWith('/public/') ? req.url : `/public/site${req.url}`))
const externalSite = (title, snippet) => (req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="margin:0;font-family:system-ui,sans-serif"><header style="padding:16px;border-bottom:1px solid #ddd"><strong>${title}</strong></header><main style="padding:12px">${snippet}</main></body></html>`) }

const watch = (page, who) => {
  openPages.push(page)
  page.on('pageerror', (e) => errors.push(`${who}: ${e.message}`))
  page.on('response', (r) => { if (r.url().startsWith(s.urls.api) && r.status() >= 500) errors.push(`${who}: ${r.status()} ${r.url()}`) })
  return page
}
const shot = (page, name) => page.screenshot({ path: join(shots, `${name}.png`), fullPage: true })
const visible = (locator, timeout = 20000) => locator.first().waitFor({ timeout }).then(() => true, () => false)
const overflow = (page) => page.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth)
async function visitor({ phone = false, dark = false } = {}) {
  const context = await s.newContext({ phone, dark })
  await context.addInitScript((isDark) => { try { localStorage.setItem('runly-theme', JSON.stringify({ state: { isDark }, version: 0 })) } catch { /* ignore */ } }, dark)
  const page = watch(await context.newPage(), phone ? 'visitor-phone' : 'visitor')
  page.on('console', (m) => { if (/Refused to frame|frame-ancestors/.test(m.text())) page.cspRefusals = (page.cspRefusals ?? 0) + 1 })
  return page
}
// Inside the portal (page or iframe): first free time, details, review, accept, confirm.
async function book(root, { name, email, touch = false, nextWeek = true, slotIndex = 0 }) {
  const press = (locator) => (touch ? locator.tap() : locator.click())
  if (nextWeek) await press(root.getByRole('button', { name: 'Semana siguiente' }))
  const slot = root.getByRole('radiogroup', { name: 'Horario' }).getByRole('radio').nth(slotIndex)
  await slot.waitFor({ timeout: 30000 })
  await press(slot)
  await press(root.getByRole('button', { name: 'Continuar' }))
  await root.getByLabel('Nombre').fill(name)
  await root.getByLabel('Correo electrónico').fill(email)
  await root.getByLabel(/^Teléfono/).fill('5551002000')
  await press(root.getByRole('button', { name: 'Revisar' }))
  await press(root.getByText('Acepto las políticas'))
  await press(root.getByRole('button', { name: 'Confirmar reservación' }))
  return visible(root.getByRole('heading', { name: 'Reservación confirmada' }), 30000)
}

let worker = null
const workerLog = []
try {
  // ---- Company, people and catalog --------------------------------------------------
  const A = await s.createCompany('Clinica Distribucion')
  const adminRole = (await s.q(`INSERT INTO role(id,company_id,key,name,updated_at) VALUES(uuidv7(),$1,'runly.admin','Administrador',now()) RETURNING id`, [A])).rows[0].id
  const agentRole = await s.createRole(A, 'bk-dist-agent', ['bookings.access', 'calendar.access', 'calendar.events.read'])
  const admin = await s.createUser(`dist-admin-${s.run}@example.test`, PW, A, adminRole, 'Admin Distribución')
  const agent = await s.createUser(`dist-agent-${s.run}@example.test`, PW, A, agentRole, 'Agente Recepción')
  const outsider = await s.createUser(`dist-outsider-${s.run}@example.test`, PW, A, agentRole, 'Otra Área')
  const api = s.client(await s.login(admin), A)
  const agentApi = s.client(await s.login(agent), A), outsiderApi = s.client(await s.login(outsider), A)
  const space = (await api('POST', '/bookings/spaces', { name: 'Consultorio Sur', slug: `sur-${s.run}`, timezone: 'America/Mexico_City', policy: { horizonDays: 60, cancelUntilMinutes: 60, rescheduleUntilMinutes: 60 } })).body.data
  await api('PUT', `/bookings/spaces/${space.id}/members/${agent.id}`, { role: 'agent' })
  const resource = (await api('POST', '/bookings/resources', { name: 'Dra. Salas', type: 'staff' })).body.data
  await api('PUT', `/bookings/spaces/${space.id}/resources`, { resourceIds: [resource.id] })
  const service = (await api('POST', `/bookings/spaces/${space.id}/services`, { name: 'Valoración', kind: 'appointment', durationMinutes: 30, slotStepMinutes: 30 })).body.data
  await api('PUT', `/bookings/services/${service.id}/resources`, { resourceIds: [resource.id] })
  await api('PUT', `/bookings/spaces/${space.id}/schedule`, { rules: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startTime: '08:00', endTime: '20:00' })) })
  await api('PATCH', `/bookings/spaces/${space.id}`, { published: true })
  const slug = `sur-${s.run}`
  const page = (await api('POST', `/bookings/spaces/${space.id}/pages`, { slug, title: 'Reserva tu valoración', serviceIds: [service.id], published: true, accentColor: '#0f766e' })).body.data
  ok('catalog and a published page prepared', page?.id && page.url === `${APP}/app/p/reservar/${slug}`, page?.url)

  // An automation of the company on bookings.booking.created (delivered by the real worker).
  const automation = await api('POST', '/automations', { key: `reserva_contacto_${s.run}`, label: 'Contacto por reservación', enabled: true, trigger: { type: 'event', event: 'bookings.booking.created' },
    steps: [{ service: 'runly.contacts:contacts.create', args: { name: { from: 'template', template: 'Reserva {{id}}' }, type: { from: 'value', value: 'person' } } }] })
  ok('Automations accepts bookings.booking.created as a trigger', automation.status === 201, `${automation.status} ${JSON.stringify(automation.body?.error ?? '')}`)

  // ---- The real worker process -------------------------------------------------------
  worker = spawn(process.execPath, [resolve('apps/worker/src/index.js')], { env: { ...process.env, ...s.apiEnv, RUNLY_BOOKINGS_TICK_MS: '1500', RUNLY_DOMAIN_EVENTS_INTERVAL_MS: '1500' }, stdio: ['ignore', 'pipe', 'pipe'] })
  worker.stdout.on('data', (c) => workerLog.push(String(c))); worker.stderr.on('data', (c) => workerLog.push(String(c)))
  ok('the worker starts as a real process', await until(async () => workerLog.join('').includes('Runly Worker started'), 30000))

  // ---- F4A: no ERP splash, frame policy and the real nginx rule ---------------------
  const plain = await visitor()
  await plain.goto(`${APP}/app/p/reservar/${slug}`, { waitUntil: 'domcontentloaded' })
  const splash = await plain.evaluate(() => Boolean(document.querySelector('.runly-bootstrap')) || /Abriendo Runly|Iniciando Runly/.test(document.body?.innerText ?? ''))
  await plain.getByRole('heading', { name: 'Reserva tu valoración' }).waitFor({ timeout: 30000 })
  const splashLater = await plain.evaluate(() => /Abriendo Runly|Iniciando Runly/.test(document.body?.innerText ?? ''))
  ok('F4A public portal opens without the ERP boot splash', !splash && !splashLater)
  const policy = async (uri, host = `127.0.0.1:${ports.app}`) => { const r = await askApi('/public/bookings/frame-policy', { host, 'x-original-uri': uri }); return r.status === 204 ? r.headers['x-booking-frame-ancestors'] : r.status }
  ok('F4A frame policy: manage links never framed, plain portal only by the ERP', (await policy('/app/p/reservar/gestion')) === "'none'" && (await policy(`/app/p/reservar/${slug}`)) === "'self'")
  ok('F4A frame policy: a website hostname never gets the SPA', (await policy(`/app/p/reservar/${slug}?embed=1`, 'www.sitio-ajeno.mx')) === 403)

  // nginx:alpine with the real spa.conf; "api" is a TCP relay to the stack API.
  const net$ = `bk-dist-${s.run}`
  const docker = (...args) => spawnSync('docker', args, { encoding: 'utf8' })
  docker('network', 'create', net$)
  cleanups.push(async () => { docker('rm', '-f', `${net$}-nginx`, `${net$}-api`); docker('network', 'rm', net$) })
  const html = join(s.stack.directory, 'nginx-html')
  await mkdir(html, { recursive: true }); await writeFile(join(html, 'index.html'), '<!doctype html><title>spa</title>')
  const apiPort = new URL(s.urls.api).port
  docker('run', '-d', '--name', `${net$}-api`, '--network', net$, '--network-alias', 'api', 'node:22.22.3-alpine', 'node', '-e',
    `require('net').createServer(c=>{const u=require('net').connect(${apiPort},'host.docker.internal');c.pipe(u).pipe(c);u.on('error',()=>c.destroy());c.on('error',()=>u.destroy())}).listen(4010)`)
  const conf = resolve('infra/nginx/spa.conf').replace(/\\/g, '/')
  const started = docker('run', '-d', '--name', `${net$}-nginx`, '--network', net$, '-p', `127.0.0.1:${ports.nginx}:80`, '-v', `${conf}:/etc/nginx/conf.d/default.conf:ro`, '-v', `${html.replace(/\\/g, '/')}:/usr/share/nginx/html:ro`, 'nginx:alpine')
  const nginxGet = (path, host = `127.0.0.1:${ports.nginx}`) => new Promise((done) => http.get({ host: '127.0.0.1', port: ports.nginx, path, headers: { host } }, (r) => { r.resume(); done({ status: r.statusCode, csp: [].concat(r.headers['content-security-policy'] ?? []).join(' | ') }) }).on('error', () => done({ status: 0, csp: '' })))
  const ready = started.status === 0 && await until(async () => (await nginxGet('/app/p/reservar/gestion')).status === 200, 30000)
  await api('PATCH', `/bookings/pages/${page.id}`, { embedOrigins: [EXT_A] })
  const ngEmbed = await nginxGet(`/app/p/reservar/${slug}?embed=1`), ngManage = await nginxGet('/app/p/reservar/gestion'), ngForeign = await nginxGet(`/app/p/reservar/${slug}?embed=1`, 'www.sitio-ajeno.mx')
  ok('F4A nginx spa.conf: embed CSP lists the authorized site', ready && ngEmbed.status === 200 && ngEmbed.csp === `frame-ancestors 'self' ${EXT_A}`, ngEmbed.csp)
  ok('F4A nginx spa.conf: manage link CSP is none; foreign host is refused', ngManage.csp === "frame-ancestors 'none'" && ngForeign.status === 403, `${ngManage.csp} / ${ngForeign.status}`)
  await api('PATCH', `/bookings/pages/${page.id}`, { embedOrigins: [] })

  // ---- F4C: the admin shares and authorizes from "Compartir e integrar" --------------
  const adminPage = watch(await s.loginPage(admin, A), 'admin')
  await adminPage.goto(`${s.urls.web}/app/m/runly.bookings/spaces/${space.id}?tab=online`)
  await adminPage.getByRole('button', { name: 'Compartir e integrar' }).first().click()
  const dialog = adminPage.getByRole('dialog', { name: 'Compartir e integrar' })
  await dialog.getByLabel('Agregar sitio').fill('http://tienda.example.com')
  await dialog.getByRole('button', { name: 'Agregar' }).click()
  ok('F4C a site without HTTPS is refused with a clear message', await visible(dialog.getByText(/Escribe la dirección del sitio/), 5000))
  await dialog.getByLabel('Agregar sitio').fill(EXT_A)
  await dialog.getByRole('button', { name: 'Agregar' }).click()
  const iframeSnippet = await dialog.getByRole('textbox', { name: 'Calendario integrado', exact: true }).inputValue()
  const buttonSnippet = await dialog.getByRole('textbox', { name: 'Botón de reservación', exact: true }).inputValue()
  await shot(adminPage, 'f4c-01-share-dialog')
  await dialog.getByRole('button', { name: 'Guardar sitios autorizados' }).click()
  ok('F4C authorized site saved from the dialog', await until(async () => (await api('GET', `/bookings/spaces/${space.id}/pages`)).body.data[0].embedOrigins.includes(EXT_A)))
  ok('F4C snippets are generated for this page', iframeSnippet === embedSnippets({ url: page.url }).iframe && buttonSnippet.includes(`href="${page.url}"`))
  await serve(ports.extA, externalSite('Clínica socia (autorizada)', `${iframeSnippet}<p>${buttonSnippet}</p>`))
  await serve(ports.extB, externalSite('Sitio no autorizado', iframeSnippet))

  // ---- External authorized site: desktop light, then phone dark with touch -----------
  const ext = await visitor()
  await ext.goto(EXT_A)
  const frame = ext.frameLocator('iframe[data-runly-booking]')
  await frame.getByRole('heading', { name: 'Reserva tu valoración' }).waitFor({ timeout: 30000 })
  const bookedA = await book(frame, { name: 'Elena Sitio', email: 'elena@example.test' })
  ok('F4C a real booking from an authorized external site', bookedA)
  ok('F4C manage link from the iframe opens in a new tab', (await frame.getByRole('link', { name: /Ver o gestionar/ }).getAttribute('target')) === '_blank')
  const height = await until(async () => { const h = await ext.evaluate(() => document.querySelector('iframe[data-runly-booking]').style.height); return h !== '760px' ? h : null }, 10000)
  ok('F4C the embed script resizes the iframe to its content', Boolean(height), height ?? '')
  await shot(ext, 'f4c-02-external-desktop')
  const extBooking = await until(async () => (await api('GET', `/bookings/spaces/${space.id}/reservations?q=elena%40example.test`)).body.data?.[0])
  ok('E2E the iframe booking is in the backoffice', extBooking?.status === 'CONFIRMED' && extBooking.channel === 'portal')
  // Calendario's own API, as each person sees it (GET /calendar/events returns an array).
  const eventsAs = async (who, id) => {
    const res = await who('GET', `/calendar/events?start=${new Date(Date.now() - 86400000).toISOString()}&end=${new Date(Date.now() + 60 * 86400000).toISOString()}&source_module=runly.bookings&source_entity_id=${id}`)
    return Array.isArray(res.body) ? res.body : []
  }
  const calendarEvent = (who, id, title = null) => until(async () => { const [e] = await eventsAs(who, id); return e && (!title || e.title === title) ? e : null }, 20000)
  const seen = await calendarEvent(agentApi, extBooking.id)
  ok('E2E it appears in Calendario for a space member', seen?.title === 'Valoración · Elena Sitio', seen?.title)
  ok('E2E without the customer email or phone in the event', seen && !/elena@example|5551002000/.test(`${seen.title} ${seen.description}`))
  ok('E2E a company user outside the space does not see it', (await eventsAs(outsiderApi, extBooking.id)).length === 0)

  const phone = await visitor({ phone: true, dark: true })
  await phone.goto(EXT_A)
  const pframe = phone.frameLocator('iframe[data-runly-booking]')
  await pframe.getByRole('heading', { name: 'Reserva tu valoración' }).waitFor({ timeout: 30000 })
  ok('F4C phone: the host page has no horizontal overflow', (await overflow(phone)) <= 0)
  ok('F4C phone dark: the embedded portal follows dark mode', await pframe.locator('html.dark').count() === 1)
  ok('F4C phone: booking with touch inside the iframe', await book(pframe, { name: 'Pablo Movil', email: 'pablo@example.test', touch: true, slotIndex: 2 }))
  await shot(phone, 'f4c-03-external-phone-dark')

  // ---- External site nobody authorized ------------------------------------------------
  const bad = await visitor()
  await bad.goto(EXT_B)
  await wait(4000)
  const childUrl = bad.frames().find((f) => f !== bad.mainFrame())?.url() ?? ''
  const rendered = await bad.frameLocator('iframe[data-runly-booking]').getByRole('heading', { name: 'Reserva tu valoración' }).count()
  ok('F4C an unauthorized site cannot show the portal (CSP frame-ancestors)', rendered === 0 && (bad.cspRefusals > 0 || !childUrl.startsWith(APP)), `refusals=${bad.cspRefusals ?? 0} url=${childUrl.slice(0, 40)}`)
  await shot(bad, 'f4c-04-unauthorized-site')

  // ---- F4B: a Runly Website published with the Reservaciones block -------------------
  const { createWebsiteService } = await import('../apps/api/src/routes/website/website-service.js')
  const { createWebsiteAccess } = await import('../apps/api/src/services/website-authorization-service.js')
  const { createWebsitePublicationContext } = await import('../apps/api/src/services/website-publication-context.js')
  const { createSupabaseAdminClient } = await import('../apps/api/src/services/supabase-admin.js')
  const supabaseAdmin = createSupabaseAdminClient({ ...process.env, ...s.apiEnv })
  const publication = createWebsitePublicationContext({ prisma: db, supabaseAdmin, namespaceRoot: 'sites.localhost' })
  const access = createWebsiteAccess({ companyId: A, actorId: admin.id, can: () => true })
  const wctx = { companyId: A, access }
  const wsvc = createWebsiteService({ prisma: db, publicationContext: publication })
  const site = await wsvc.createSite({ ...wctx, data: { name: 'Sitio Consultorio' } })
  const home = await wsvc.createPage({ ...wctx, siteId: site.id, data: { title: 'Inicio', slug: 'inicio', routePath: '/' } })
  // A verified custom domain (*.localhost resolves to this machine in the browser; DNS checks are out of scope here).
  const host = await db.websiteDomain.create({ data: { hostname: `consultorio-${s.run}.sites.localhost`, companyId: A, siteId: site.id, kind: 'custom', state: 'assigned', ready: true } })
  const SITE = `http://${host.hostname}:${ports.site}`
  await api('PATCH', `/bookings/pages/${page.id}`, { embedOrigins: [EXT_A, SITE] })
  // Same page shape the editor saves (parsePage refuses partial documents).
  const doc = { schemaVersion: 1, id: 'page_inicio', slug: '/', title: 'Inicio', visibility: 'public', seo: { title: 'Inicio', description: '', canonical: null, ogImageAssetId: null }, updatedAt: new Date().toISOString(), regions: { main: { id: 'region_main', children: ['h', 'b'] } }, blocks: { h: { id: 'h', type: 'HeroBlock', props: { title: 'Consultorio Sur' } }, b: { id: 'b', type: 'BookingPortalBlock', props: { bookingPage: slug, serviceId: service.id, display: 'calendar', buttonLabel: 'Reservar' } } } }
  await wsvc.saveDraft({ ...wctx, pageId: home.id, builderData: doc, expectedRevision: 0 })
  const cur = await db.websiteSite.findUnique({ where: { id: site.id } })
  const release = await publication.releases.prepare({ ...wctx, siteId: site.id, kind: 'builder', baseReleaseId: null, expectedDraftRevision: cur.draftRevision, expectedPublicationRevision: cur.publicationRevision, changes: { publishPageIds: [home.id], includeThemeAndMenus: true }, idempotencyKey: `dist-prepare-${s.run}-attempt` })
  await publication.releases.activate({ ...wctx, siteId: site.id, releaseId: release.id, expectedDraftRevision: release.draftRevision, expectedPublicationRevision: release.publicationRevision, manifestHash: release.manifestHash, idempotencyKey: `dist-activate-${s.run}-attempt` })
  ok('F4B the site is published with the block bound to the page', release.manifest.dynamic.some((d) => d.kind === 'booking' && d.slug === slug))
  const visitorSite = await visitor()
  const response = await visitorSite.goto(`${SITE}/`)
  ok('F4B the published page allows only the portal origin in frame-src', /frame-src http:\/\/127\.0\.0\.1:\d+;/.test(response.headers()['content-security-policy'] ?? ''), (response.headers()['content-security-policy'] ?? '').match(/frame-src [^;]*/)?.[0])
  const sframe = visitorSite.frameLocator('iframe[title="Reservaciones en línea"]')
  ok('F4B the embedded calendar loads on the published site', await visible(sframe.getByRole('heading', { name: 'Reserva tu valoración' }), 30000))
  ok('F4B a real booking from the Runly Website', await book(sframe, { name: 'Sara Web', email: 'sara@example.test', slotIndex: 4 }))
  await shot(visitorSite, 'f4b-01-website-booking')
  const webBooking = await until(async () => (await api('GET', `/bookings/spaces/${space.id}/reservations?q=sara%40example.test`)).body.data?.[0])
  ok('E2E the Website booking is in the backoffice and in Calendario', webBooking?.status === 'CONFIRMED' && Boolean(await calendarEvent(agentApi, webBooking.id, 'Valoración · Sara Web')))

  // ---- Backoffice Calendario UI: the mirrored event links back --------------------------
  await adminPage.goto(`${s.urls.web}/app/m/runly.bookings/reservations?reservacion=${webBooking.id}`)
  ok('F4D deep link from Calendario opens the reservation', await visible(adminPage.getByRole('dialog').getByText('Sara Web')) && await visible(adminPage.getByRole('dialog').getByText('Cliente (portal)')))
  await shot(adminPage, 'f4d-01-deep-link')

  // ---- F4D with the real worker: hold expiry leaves the calendar; automation ran -----
  await api('PATCH', `/bookings/spaces/${space.id}`, { policy: { horizonDays: 60, requiresApproval: true, holdMinutes: 30 } })
  const hold = (await api('POST', `/bookings/spaces/${space.id}/reservations`, { serviceId: service.id, startsAt: new Date(Date.now() + 3 * 86400000).toISOString().replace(/T.*/, 'T18:00:00.000Z'), guestName: 'Hold Vencido' })).body.data
  ok('F4D a pending hold is mirrored as pending', Boolean(await calendarEvent(agentApi, hold.id, 'Pendiente · Valoración · Hold Vencido')))
  await db.$executeRaw`UPDATE booking SET hold_expires_at = now() - interval '1 minute' WHERE id = ${hold.id}::uuid`
  const expired = await until(async () => (await db.booking.findUnique({ where: { id: hold.id } })).status === 'EXPIRED', 30000)
  const gone = expired && await until(async () => (await db.calendarEvent.count({ where: { sourceModule: 'runly.bookings', sourceEntityId: hold.id } })) === 0, 30000)
  ok('F4D the worker process expires the hold and removes it from Calendario', expired && gone)
  const contact = await until(async () => (await db.contact.count({ where: { companyId: A, name: `Reserva ${extBooking.id}` } })) === 1, 45000)
  ok('F4D the worker delivers bookings.booking.created to the automation (once)', contact)
  const skipped = await until(async () => (await db.bookingNotification.count({ where: { companyId: A, status: 'skipped' } })) > 0, 20000)
  ok('F4A the worker processes customer emails (no SMTP here: skipped, not lost)', skipped)
  const duplicates = (await db.$queryRaw`SELECT source_entity_id, count(*)::int AS n FROM calendar_event WHERE source_module = 'runly.bookings' GROUP BY 1 HAVING count(*) > 1`).length
  ok('F4D no duplicated calendar events', duplicates === 0)

  ok('no page errors or 5xx', errors.length === 0, errors.slice(0, 5).join(' | '))
} catch (error) {
  ok('journey completed', false, error.stack?.split('\n').slice(0, 4).join(' '))
  console.log('PAGE ERRORS:', errors.slice(0, 8).join('\n'))
  for (const [i, p] of openPages.entries()) await p.screenshot({ path: join(shots, `zz-fail-${i}.png`), fullPage: true }).catch(() => {})
  console.log('API LOG TAIL:', s.apiLog.join('').slice(-1500))
  console.log('WORKER LOG TAIL:', workerLog.join('').slice(-1500))
} finally {
  worker?.kill()
  for (const fn of cleanups.reverse()) await fn().catch(() => {})
  await db.$disconnect()
  await s.close()
  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} passed · screenshots: ${shots}`)
  process.exitCode = failed.length ? 1 : 0
}
