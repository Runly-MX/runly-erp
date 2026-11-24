#!/usr/bin/env node
// F1B Stage 2 vertical: the reference "Solicitudes" module end to end in two
// companies on a disposable Supabase (Docker): declarative runtime + gateway
// on real PostgreSQL (records, contacts relation, runly.files visibility,
// notifications, events, audit), the isolated backend extension in a runner
// container, and the isolated frontend component in Chromium.
//   node scripts/security/verify-secure-runtime-vertical.mjs [--keep]
import assert from 'node:assert/strict'
import http from 'node:http'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import path from 'node:path'
import { join, resolve } from 'node:path'
import { createStudioStack, command } from '../fixtures/studio/supabase-stack.mjs'
import { checks } from './lib/disposable-stack.mjs'
import { createHostSigner } from '../../apps/api/src/secure-runtime/protocol.js'
import { createCapabilityGateway } from '../../apps/api/src/secure-runtime/gateway/gateway.js'
import { createPgStore } from '../../apps/api/src/secure-runtime/gateway/stores.js'
import { startGatewayServer } from '../../apps/api/src/secure-runtime/gateway/server.js'
import { loadDeclarativeModule } from '../../apps/api/src/secure-runtime/declarative/schema.js'
import { createIsolatedRuntime } from '../../apps/api/src/secure-runtime/isolated/orchestrator.js'
import { renderIsolatedFrame } from '../../apps/api/src/secure-runtime/frontend/frame-document.js'
import { createGatewayHostServices } from '../../apps/api/src/secure-runtime/host-services.js'
import { createFilesService } from '../../apps/api/src/services/files-service.js'

const FIXTURE = resolve('apps/api/src/secure-runtime/fixtures/solicitudes')
const def = loadDeclarativeModule(JSON.parse(readFileSync(join(FIXTURE, 'module.json'), 'utf8')))
const apiRequire = createRequire(resolve('apps/api/package.json'))
const stack = await createStudioStack({ apiImage: 'runly-security-unused:local' })
const q = (sql, params) => stack.pool.query(sql, params)
const { check, report } = checks()
let runtime, server, browser, prisma
try {
  await stack.compose(['up', '-d', '--wait', '--wait-timeout', '180', 'supabase-db', 'supabase-auth', 'supabase-rest', 'supabase-realtime', 'supabase-storage', 'supabase-kong'], { log: join(stack.directory, 'startup.log') })
  await stack.verifyTarget()
  const dbUrl = `postgresql://postgres:${stack.secret.SUPABASE_POSTGRES_PASSWORD}@127.0.0.1:${stack.ports.db}/postgres`
  const env = { ...process.env, DIRECT_URL: dbUrl, DATABASE_URL: dbUrl }
  await command(process.execPath, [createRequire(resolve('package.json')).resolve('prisma/build/index.js'), 'migrate', 'deploy'], { env, log: join(stack.directory, 'migrate.log') })
  await command(process.execPath, [resolve('prisma/seed.js')], { env, log: join(stack.directory, 'seed.log') })

  const [A, B] = (await q(`INSERT INTO company(name,slug,enabled,updated_at) VALUES ('Empresa A','empresa-a',true,now()),('Empresa B','empresa-b',true,now()) RETURNING id`)).rows.map((r) => r.id)
  const profile = async (email, companyId) => {
    const id = (await q(`INSERT INTO user_profile(auth_user_id,email,display_name,enabled,updated_at) VALUES ($1,$2,$2,true,now()) RETURNING id`, [randomUUID(), email])).rows[0].id
    await q(`INSERT INTO membership(user_id,company_id,enabled,updated_at) VALUES ($1,$2,true,now())`, [id, companyId]); return id
  }
  const requesterA = await profile('solicitante-a@example.com', A), approverA = await profile('aprobador-a@example.com', A), userB = await profile('usuario-b@example.com', B)
  const contact = async (companyId, name) => (await q(`INSERT INTO contact(company_id,type,name,updated_at) VALUES ($1,'COMPANY',$2,now()) RETURNING id`, [companyId, name])).rows[0].id
  const provA = await contact(A, 'Proveedor A'), provB = await contact(B, 'Proveedor B')
  const file = async (companyId, name) => (await q(`INSERT INTO file_asset(bucket,object_key,original_name,mime_type,size_bytes,module_key,entity_type,entity_id,access_scope,enabled,updated_at)
    VALUES ('runly-files',$1,$2,'application/pdf',100,'runly.files','AtlasFile',$3,'COMPANY',true,now()) RETURNING id`, [`${companyId}/${randomUUID()}.pdf`, name, companyId])).rows[0].id
  const fileA = await file(A, 'cotizacion-a.pdf'), fileB = await file(B, 'cotizacion-b.pdf')

  const { PrismaClient } = apiRequire('@prisma/client'), { PrismaPg } = apiRequire('@prisma/adapter-pg')
  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: dbUrl }) })
  const store = createPgStore({ pool: stack.pool })
  const gateway = createCapabilityGateway({ signer: createHostSigner(), store, services: createGatewayHostServices({ filesService: createFilesService({ prisma, supabaseAdmin: null }) }), limits: { callsPerMinute: 1000 } })
  gateway.register(def, { approvedCapabilities: def.capabilities, packageHash: 'fixture' })
  const P = def.permissions
  const roles = { requester: new Set([P.read, P.create, P.update]), approver: new Set(Object.values(P)) }
  const tok = (companyId, profileId, perms, caps = def.capabilities) => gateway.issueCallToken({ moduleKey: def.key, companyId, profileId, permissionSet: perms, capabilities: caps })
  const call = (t, operation, args) => gateway.call({ operation, token: t, args, nonce: randomUUID().replaceAll('-', ''), idempotencyKey: randomUUID().replaceAll('-', '') })
  const reqA = tok(A, requesterA, roles.requester), apprA = tok(A, approverA, roles.approver), tB = tok(B, userB, roles.approver)
  let solicitud

  await check('company A: create a request with an authorized relation and a company file', async () => {
    solicitud = (await call(reqA, 'records.create', { entity: 'solicitud', data: { titulo: 'Laptops', monto: 42000, proveedor: provA, solicitante: requesterA } })).data
    assert.deepEqual((await call(reqA, 'relations.resolve', { entity: 'solicitud', field: 'proveedor', ids: [provA, provB] })).data, [{ id: provA, label: 'Proveedor A' }])
    assert.equal((await call(reqA, 'files.attach', { entity: 'solicitud', id: solicitud.id, fileId: fileA })).data.attachments[0].fileId, fileA)
    await assert.rejects(call(reqA, 'files.attach', { entity: 'solicitud', id: solicitud.id, fileId: fileB }), (e) => e.code === 'NOT_FOUND')
  })
  await check('company A: requester cannot approve; approver approves; automation notifies and emits', async () => {
    await call(reqA, 'records.transition', { entity: 'solicitud', id: solicitud.id, action: 'enviar' })
    await assert.rejects(call(reqA, 'records.transition', { entity: 'solicitud', id: solicitud.id, action: 'aprobar' }), (e) => e.code === 'PERMISSION_DENIED')
    const done = (await call(apprA, 'records.transition', { entity: 'solicitud', id: solicitud.id, action: 'aprobar' })).data
    assert.equal(done.record.data.estado, 'aprobada'); assert.equal(done.record.data.resolucion, 'Aprobada: Laptops')
    const n = (await q(`SELECT company_id, title FROM notification WHERE user_id=$1 AND source_type=$2`, [requesterA, def.key])).rows
    assert.deepEqual(n.map((r) => [r.company_id, r.title]), [[A, 'Tu solicitud fue aprobada']])
    assert.equal((await q(`SELECT count(*)::int AS n FROM runly_secure_runtime.event WHERE company_id=$1 AND event='ref_solicitudes.solicitud.aprobada'`, [A])).rows[0].n, 1)
  })
  await check('company B: sees nothing of A and works on its own data', async () => {
    assert.equal((await call(tB, 'records.list', { entity: 'solicitud' })).data.length, 0)
    await assert.rejects(call(tB, 'records.get', { entity: 'solicitud', id: solicitud.id }), (e) => e.code === 'NOT_FOUND')
    await assert.rejects(call(tB, 'records.transition', { entity: 'solicitud', id: solicitud.id, action: 'rechazar' }), (e) => e.code === 'NOT_FOUND')
    await call(tB, 'records.create', { entity: 'solicitud', data: { titulo: 'Toner', proveedor: provB, solicitante: userB } })
    await assert.rejects(call(tB, 'notifications.publish', { to: [requesterA], title: 'x' }), (e) => e.code === 'PERMISSION_DENIED')
  })
  await check('audit trail records writes and denials per company', async () => {
    const rows = (await q(`SELECT company_id, action FROM audit_log WHERE entity_type='RunlyModuleCapability'`)).rows
    assert.ok(rows.some((r) => r.company_id === A && r.action === 'runtime.records.transition'))
    assert.ok(rows.some((r) => r.company_id === A && r.action === 'runtime.denied.records.transition'))
    assert.ok(rows.some((r) => r.company_id === B && r.action === 'runtime.denied.notifications.publish'))
  })
  await check('runtime schema is not exposed through PostgREST', async () => {
    const res = await fetch(`${stack.urls.kong}/rest/v1/record?select=id`, { headers: { apikey: stack.secret.SUPABASE_ANON_KEY, Authorization: `Bearer ${stack.secret.SUPABASE_ANON_KEY}`, 'Accept-Profile': 'runly_secure_runtime' } })
    assert.ok(res.status >= 400, `status ${res.status}`)
  })

  server = await startGatewayServer({ gateway, host: '0.0.0.0' })
  runtime = createIsolatedRuntime({ gatewayPort: server.port })
  await runtime.start()
  await check('isolated backend extension summarizes each company separately', async () => {
    const ra = await runtime.run({ extDir: FIXTURE, handler: 'backend/resumen.mjs', token: tok(A, approverA, roles.approver, ['records.read']) })
    assert.deepEqual(ra.result, { total: 1, porEstado: { aprobada: 1 }, montoAprobado: 42000 }, JSON.stringify(ra))
    const rb = await runtime.run({ extDir: FIXTURE, handler: 'backend/resumen.mjs', token: tok(B, userB, roles.approver, ['records.read']) })
    assert.deepEqual(rb.result, { total: 1, porEstado: { borrador: 1 }, montoAprobado: 0 })
  })

  await check('isolated frontend component shows each company its own requests', async () => {
    const panel = readFileSync(join(FIXTURE, 'frontend/panel.js'), 'utf8')
    const bridge = readFileSync(resolve('packages/ui/src/secure-runtime/isolated-frame-host.js'), 'utf8')
    const listen = (h) => new Promise((r) => { const s = http.createServer(h); s.listen(0, '127.0.0.1', () => r(s)) })
    let hostOrigin = ''
    const frames = await listen((req, res) => { const f = renderIsolatedFrame({ componentSource: panel, frameAncestors: [hostOrigin] }); res.writeHead(200, f.headers); res.end(f.html) })
    const hostFor = (companyId, profileId) => listen(async (req, res) => {
      if (req.url === '/bridge.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(bridge) }
      if (req.url === '/call') { let b = ''; for await (const c of req) b += c; const { op, args } = JSON.parse(b); try { const r = await call(tok(companyId, profileId, roles.approver, ['records.read']), op, args); res.writeHead(200); return res.end(JSON.stringify(r.data)) } catch (e) { res.writeHead(403); return res.end(JSON.stringify({ code: e.code })) } }
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end(`<!doctype html><div id="c" style="height:200px"></div><script type="module">import { mountIsolatedComponent } from '/bridge.js'
        mountIsolatedComponent({ container: document.getElementById('c'), src: 'http://localhost:${frames.address().port}/panel', title: 'Panel', allowedOperations: ['records.list'],
          capabilities: { call: async (op, args) => { const r = await fetch('/call', { method: 'POST', body: JSON.stringify({ op, args }) }); const b = await r.json(); if (!r.ok) throw Object.assign(new Error(b.code), { code: b.code }); return b } } })</script>`)
    })
    browser = await apiRequire('playwright').chromium.launch().catch(() => createRequire(resolve('package.json'))('playwright').chromium.launch())
    for (const [companyId, profileId, expected] of [[A, approverA, 'Solicitudes: 1'], [B, userB, 'Solicitudes: 1']]) {
      const host = await hostFor(companyId, profileId)
      hostOrigin = `http://127.0.0.1:${host.address().port}`
      const page = await browser.newPage()
      await page.goto(hostOrigin)
      let text = null
      for (let i = 0; i < 60 && !text; i++) { await page.waitForTimeout(100); text = await page.frames().find((f) => f.url().endsWith('/panel'))?.locator('h2').textContent({ timeout: 100 }).catch(() => null) }
      assert.equal(text, expected)
      const estado = await page.frames().find((f) => f.url().endsWith('/panel')).locator('li').getAttribute('data-estado')
      assert.equal(estado, companyId === A ? 'aprobada' : 'borrador')
      await page.close(); host.close()
    }
    frames.close()
  })
} finally {
  report()
  await browser?.close().catch(() => {})
  await runtime?.stop().catch(() => {})
  await server?.close().catch(() => {})
  await prisma?.$disconnect().catch(() => {})
  if (!process.argv.includes('--keep')) await stack.close()
}
