// Two independent disposable Supabase installations, real Auth/Storage/Prisma,
// current HTTP router + SDK. Never reads .env or a supplied database URL.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { Hono } from 'hono'
import prismaPackage from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { createStudioStack } from './fixtures/studio/supabase-stack.mjs'
import { seedStudioScenario } from './fixtures/studio/supabase-data.mjs'
import { commitStudioMcpUpdate } from './fixtures/studio/operations-mcp.mjs'
import { createStudioService } from '../apps/api/src/routes/studio/studio-service.js'
import { createStudioTemplatesService } from '../apps/api/src/routes/studio/studio-templates-service.js'
import { createFilesService } from '../apps/api/src/services/files-service.js'
import { createStudioInterchange } from '../apps/api/src/routes/studio/interchange/service.js'
import { createStudioInterchangeRouter } from '../apps/api/src/routes/studio/interchange/router.js'
import { createRunlyClient } from '../packages/sdk/src/index.js'
import { appendObject, blankDocument } from '../apps/shared/studio/document.js'
import { documentPages } from '../apps/shared/studio/pages.js'
import { studioAssetIds } from '../apps/api/src/routes/studio/studio-document-data.js'
import { inspectNativePackage, mapReferences, hash } from '../apps/api/src/routes/studio/interchange/package.js'
import { PACKAGE_MIME } from '../apps/api/src/routes/studio/interchange/zip.js'

const require = createRequire(new URL('../apps/api/package.json', import.meta.url)), sharp = require('sharp'), { serve } = require('@hono/node-server')
const { createClient } = require('@supabase/supabase-js')
const image = process.argv.find(a => a.startsWith('--image='))?.slice(8)
if (!image || !/^runly-studio[^:]*:[a-zA-Z0-9_.-]+$/.test(image)) throw Error('EXPLICIT_LOCAL_STUDIO_IMAGE_REQUIRED')
const directory = resolve('.artifacts/studio/interchange'), environments = [], checks = []
await mkdir(directory, { recursive: true })
const ok = message => { checks.push(message); console.log(message) }
const unpack = result => result.data ?? result
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
async function setup() {
  const stack = await createStudioStack({ apiImage: image, enableMcp: true })
  const env = { stack, faults: { uploads: 0 } }; environments.push(env)
  await stack.compose(['up','-d','--wait','--wait-timeout','120','supabase-db','supabase-auth','supabase-rest','supabase-realtime','supabase-storage','supabase-kong'])
  await stack.verifyTarget(); await stack.initialize()
  assert.equal((await stack.pool.query('SELECT id FROM runly_studio_test.environment')).rows[0]?.id, stack.name)
  assert.equal((await stack.pool.query("SELECT to_regclass('studio_interchange_job') n")).rows[0].n, null)
  await stack.pool.query(await readFile('prisma/migrations/20261209000000_studio_interchange/migration.sql', 'utf8'))
  env.data = await seedStudioScenario(stack)
  const { admin, users, companies } = env.data
  const created = await admin.storage.createBucket('runly-files', { public: false })
  assert.ok(!created.error || created.error.statusCode === '409')
  env.prisma = new prismaPackage.PrismaClient({ adapter: new PrismaPg(stack.pool) })
  env.admin = admin
  // Fail points wrap real Storage; all successful operations use the local bucket.
  env.storage = { ...admin, storage: { from: bucket => {
    const original = admin.storage.from(bucket)
    return {
      upload: async (...args) => {
        env.faults.uploads++
        if (env.faults.failUploadAt === env.faults.uploads) return { error: Error('Synthetic Storage interruption') }
        const result = await original.upload(...args)
        await env.faults.afterUpload?.(); return result
      },
      remove: async (...args) => { if (env.faults.failRemove) return { error: Error('Synthetic cleanup outage') }; return original.remove(...args) },
      download: async (...args) => { const result = await original.download(...args); await env.faults.afterDownload?.(); return result },
    }
  } } }
  env.files = createFilesService({ prisma: env.prisma, supabaseAdmin: env.storage })
  env.designs = createStudioService({ prisma: env.prisma, filesService: env.files })
  env.templates = createStudioTemplatesService({ prisma: env.prisma, filesService: env.files, supabaseAdmin: env.storage, designService: env.designs })
  env.interchange = createStudioInterchange({ prisma: env.prisma, filesService: env.files, supabaseAdmin: env.storage, designs: env.designs, templates: env.templates })
  const app = new Hono()
  // Real Supabase token validation. SQL guards still authorize every operation.
  app.use('*', async (c, next) => {
    const { data, error } = await admin.auth.getUser(c.req.header('Authorization')?.replace(/^Bearer /, ''))
    if (error || !data.user) return c.json({ error: 'Unauthorized' }, 401)
    const profile = await env.prisma.userProfile.findUnique({ where: { authUserId: data.user.id } })
    if (!profile) return c.json({ error: 'Unauthorized' }, 401)
    const companyId = c.req.header('X-Runly-Company-Id')
    const permissions = (await stack.pool.query('SELECT p.key FROM membership m JOIN role_permission rp ON rp.role_id=m.role_id JOIN permission p ON p.id=rp.permission_id WHERE m.company_id=$1 AND m.user_id=$2', [companyId, profile.id])).rows
    c.set('authUserId', data.user.id); c.set('userId', profile.id); c.set('userContext', { profile }); c.set('companyId', companyId)
    c.set('tenantContext', { isAdmin: false, permissionSet: new Set(permissions.map(p => p.key)) }); await next()
  })
  const requirePermission = key => async (c, next) => { await env.designs.access.member(c.get('companyId'), c.get('userId'), key); await next() }
  app.route('/', createStudioInterchangeRouter({ prisma: env.prisma, filesService: env.files, supabaseAdmin: env.storage, service: env.designs, templates: env.templates, requirePermission, interchange: env.interchange, onInternalError: error => console.error(error) }))
  app.onError((error, c) => c.json({ error: error.message }, error.status ?? 500))
  env.server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' })
  await new Promise(resolve => env.server.once('listening', resolve))
  env.url = `http://127.0.0.1:${env.server.address().port}`
  env.token = []
  for (const user of users) {
    const auth = createClient(stack.urls.kong, stack.secret.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
    const session = await auth.auth.signInWithPassword({ email: user.email, password: user.password }); assert.ok(!session.error)
    env.token.push(session.data.session.access_token)
  }
  env.client = (actor = 0, company = 0) => createRunlyClient({ baseUrl: env.url, getActiveCompanyId: () => companies[company].id })
  env.context = (actor = 0, company = 0) => ({ authUserId: users[actor].authId, activeContext: { companyId: companies[company].id, profileId: users[actor].id, isAdmin: false, permissionSet: new Set(['files.assets.read','files.assets.create']) } })
  env.countFiles = async () => Number((await stack.pool.query('SELECT count(*) n FROM file_asset')).rows[0].n)
  return env
}

let passed = false
try {
  const setups = await Promise.allSettled([setup(), setup()])
  for (const result of setups) if (result.status === 'rejected') throw result.reason
  const [a, b] = setups.map(result => result.value)
  ok('Two identity-checked fresh Supabase installations, independent Auth/DB/private Storage')
  const { companies, users } = a.data
  const png = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#eab308' } }).png().toBuffer()
  const second = await sharp({ create: { width: 30, height: 40, channels: 3, background: '#059669' } }).png().toBuffer()
  const file = await a.files.upload({ ...a.context(), file: new File([png], 'private.png', { type: 'image/png' }) })
  const file2 = await a.files.upload({ ...a.context(), file: new File([second], 'private-2.png', { type: 'image/png' }) })
  let doc = appendObject(blankDocument(320, 240), 'image', { id: 'photo', fileAssetId: file.id, x: 12, y: 120, width: 80, height: 60, groupId: 'group', image: { mask: 'star' } })
  doc = appendObject(doc, 'text', { id: 'text', text: 'Plantilla portable\nTexto editable', x: 12, y: 16, width: 250, height: 175, fontFamily: 'Lato', fontVariant: 'bold', fontSize: 24, groupId: 'group' })
  let page2 = appendObject(blankDocument(240, 320), 'rectangle', { id: 'shape', x: 10, y: 10, width: 80, height: 70, fillPaint: { type: 'image', fileAssetId: file2.id } })
  page2 = appendObject(page2, 'rectangle', { id: 'gradient', x: 10, y: 120, width: 100, height: 70, fillPaint: { type: 'gradient', gradientType: 'linear', angle: 35, stops: [{ offset: 0, color: '#ff0000', opacity: 1 }, { offset: 1, color: '#0000ff', opacity: 1 }] } })
  doc.additionalPages = [{ page: { ...page2.page, id: 'p2' }, objects: page2.objects }]
  const original = await a.designs.create(companies[0].id, users[0].id, { name: 'Portable source', document: doc }, a.context())
  const sdk = a.client().studio
  await assert.rejects(sdk.exportPackage('design', original.id, { acknowledgeImageCopies: false }, a.token[0]))
  const blob = await sdk.exportPackage('design', original.id, { acknowledgeImageCopies: true }, a.token[0])
  const bytes = Buffer.from(await blob.arrayBuffer()), decoded = await inspectNativePackage(bytes), packageFile = new File([bytes], 'template.runlystudio', { type: PACKAGE_MIME })
  await writeFile(join(directory, 'fixture.runlystudio'), bytes)
  assert.ok(!JSON.stringify(decoded.portable).includes(file.id)); assert.ok(!JSON.stringify(decoded.manifest).includes(companies[0].id))
  const dst = b.client().studio, beforeFiles = await b.countFiles()
  const inspected = unpack(await dst.inspectPackage(packageFile, b.token[0])); assert.equal(inspected.pages.length, 2); assert.deepEqual(inspected.blockingErrors, [])
  const job = unpack(await dst.preparePackageImport(packageFile, { target: 'design', name: 'Imported' }, b.token[0]))
  assert.equal(await b.countFiles(), beforeFiles, 'Staging must expose no FileAsset')
  const preview = Buffer.from(await (await dst.packageImportAsset(job.id, job.resources[0].id, b.token[0])).arrayBuffer())
  assert.equal(hash(preview), job.resources[0].sha256)
  await assert.rejects(dst.confirmPackageImport(job.id, { digest: '0'.repeat(64), acceptWarnings: true }, b.token[0]))
  await assert.rejects(dst.confirmPackageImport(job.id, { digest: job.digest }, b.token[0]))
  const confirmed = unpack(await dst.confirmPackageImport(job.id, { digest: job.digest, acceptWarnings: true }, b.token[0]))
  assert.deepEqual(unpack(await dst.confirmPackageImport(job.id, { digest: job.digest, acceptWarnings: true }, b.token[0])), confirmed)
  assert.equal(await b.countFiles(), beforeFiles + 2)
  const imported = await b.designs.get(b.data.companies[0].id, b.data.users[0].id, confirmed.id)
  assert.equal(documentPages(imported.document).length, 2); assert.equal(imported.document.objects[1].height, 175)
  assert.ok(studioAssetIds(imported.document).every(id => !studioAssetIds(doc).includes(id)))
  assert.notEqual(imported.document.objects[0].groupId, 'group'); assert.equal(imported.document.objects[0].groupId, imported.document.objects[1].groupId)
  const reexport = Buffer.from(await (await dst.exportPackage('design', confirmed.id, { acknowledgeImageCopies: true }, b.token[0])).arrayBuffer())
  const restored = await inspectNativePackage(reexport)
  assert.deepEqual(restored.manifest.resources.map(r => r.sha256).sort(), decoded.manifest.resources.map(r => r.sha256).sort())
  const normalize = d => { const x = structuredClone(d); for (const scene of documentPages(x)) { delete scene.page.id; for (const o of scene.objects) { delete o.id; if (o.groupId) o.groupId = 'group' } }; return x }
  assert.deepEqual(normalize(restored.portable), normalize(decoded.portable))
  await writeFile(join(directory, 'roundtrip.json'), JSON.stringify({ source: original.document, imported: imported.document, resources: { [file.id]: png.toString('base64'), [file2.id]: second.toString('base64'), ...Object.fromEntries(await Promise.all(studioAssetIds(imported.document).map(async id => { const content = await b.files.readForCompany({companyId:b.data.companies[0].id,id}); return [id,content.content.toString('base64')] }))) } }))
  ok('HTTP + SDK roundtrip preserves multipage editable document/private originals; DB generates new Files/content identities; confirmation is idempotent')
  await a.stack.compose(['up','-d','runly-api'])
  for (let attempt = 0; ; attempt++) {
    if (await fetch(a.stack.urls.api + '/health').then(r => r.ok).catch(() => false)) break
    if (attempt >= 60) throw Error('LOCAL_MCP_API_NOT_READY')
    await wait(500)
  }
  const mcp = await commitStudioMcpUpdate(a.stack, { token: a.token[0], companyId: companies[0].id, designId: original.id, name: 'MCP portable template', template: 'personal' })
  assert.equal(mcp.source, 'ai')
  const mcpBytes = Buffer.from(await (await sdk.exportPackage('template', mcp.id, { acknowledgeImageCopies: true }, a.token[0])).arrayBuffer())
  const mcpJob = unpack(await dst.preparePackageImport(new File([mcpBytes], 'mcp.runlystudio', { type: PACKAGE_MIME }), { target: 'personal', name: 'MCP imported' }, b.token[0]))
  const mcpImported = unpack(await dst.confirmPackageImport(mcpJob.id, { digest: mcpJob.digest, acceptWarnings: true }, b.token[0]))
  assert.equal(documentPages((await b.templates.get(b.data.companies[0].id, b.data.users[0].id, mcpImported.id)).document).length, 2)
  ok('Template created through real MCP OAuth/PKCE proposal approval and commit exports/imports independently')
  for (const target of ['personal', 'company']) {
    const prepared = unpack(await dst.preparePackageImport(packageFile, { target, name: `Imported ${target}` }, b.token[0]))
    const count = await b.stack.pool.query('SELECT count(*) n FROM studio_template')
    const result = unpack(await dst.confirmPackageImport(prepared.id, { digest: prepared.digest, acceptWarnings: true }, b.token[0]))
    const template = await b.templates.get(b.data.companies[0].id, b.data.users[0].id, result.id)
    assert.equal(template.scope, target); assert.equal(Number((await b.stack.pool.query('SELECT count(*) n FROM studio_template')).rows[0].n), Number(count.rows[0].n) + 1)
    if (target === 'company') await b.templates.get(b.data.companies[0].id, b.data.users[2].id, result.id)
    else await assert.rejects(b.templates.get(b.data.companies[0].id, b.data.users[2].id, result.id))
  }
  await assert.rejects(b.client(3, 1).studio.packageImportStatus(job.id, b.token[3]))
  await assert.rejects(dst.packageImportStatus(job.id, b.token[2]))
  ok('Personal/company template targets are explicit; private resources obey template delegation; other actors/companies cannot inspect or confirm jobs')
  const storedFiles = await b.countFiles()
  b.faults.uploads = 0; b.faults.failUploadAt = 2; b.faults.failRemove = true
  await assert.rejects(dst.preparePackageImport(packageFile, { target: 'design', name: 'Interrupted' }, b.token[0]))
  assert.equal(await b.countFiles(), storedFiles)
  assert.equal(Number((await b.stack.pool.query("SELECT count(*) n FROM studio_interchange_job WHERE state='cleanup'")).rows[0].n), 1)
  b.faults.failUploadAt = null; b.faults.failRemove = false
  b.interchange.close()
  const restarted = createStudioInterchange({ prisma: b.prisma, filesService: b.files, supabaseAdmin: b.storage, designs: b.designs, templates: b.templates })
  await restarted.recover(b.data.companies[0].id, b.data.users[0].id)
  assert.equal(Number((await b.stack.pool.query("SELECT count(*) n FROM studio_interchange_job WHERE state='cleanup'")).rows[0].n), 0)
  const stagedKeys = (await b.stack.pool.query("SELECT staged FROM studio_interchange_job WHERE name='Interrupted'")).rows[0].staged
  for (const key of stagedKeys) assert.ok((await b.admin.storage.from(key.bucket).download(key.objectKey)).error)
  ok('Interrupted upload + failed compensation survives service restart; recovery removes only journaled blobs and leaves no FileAssets')
  const jobs = []
  for (let i = 0; i < 2; i++) jobs.push(unpack(await dst.preparePackageImport(packageFile, { target: 'design', name: `Quota ${i}` }, b.token[0])))
  await assert.rejects(dst.preparePackageImport(packageFile, { target: 'design', name: 'Quota blocked' }, b.token[0]))
  for (const row of jobs) await dst.cancelPackageImport(row.id, b.token[0])
  assert.equal(await b.countFiles(), storedFiles)
  const companyJob = unpack(await dst.preparePackageImport(packageFile, { target: 'company', name: 'Permission changed' }, b.token[0]))
  const role = b.data.companies[0].roleId
  await b.stack.pool.query("DELETE FROM role_permission WHERE role_id=$1 AND permission_id IN (SELECT id FROM permission WHERE key='studio.templates.publish')", [role])
  await assert.rejects(dst.confirmPackageImport(companyJob.id, { digest: companyJob.digest, acceptWarnings: true }, b.token[0]))
  await dst.cancelPackageImport(companyJob.id, b.token[0])
  await b.stack.pool.query("INSERT INTO role_permission(id,role_id,permission_id) SELECT uuidv7(),$1,id FROM permission WHERE key='studio.templates.publish'", [role])
  assert.equal(await b.countFiles(), storedFiles)
  ok('Staging quotas and permission changes block confirmation without partial targets or orphan FileAssets')
  const expired = unpack(await dst.preparePackageImport(packageFile, { target: 'design', name: 'Expired' }, b.token[0]))
  await b.stack.pool.query("UPDATE studio_interchange_job SET expires_at=now()-interval '1 second',next_cleanup_at=now()-interval '1 second',lease_until=now() WHERE id=$1", [expired.id])
  await assert.rejects(dst.confirmPackageImport(expired.id, { digest: expired.digest, acceptWarnings: true }, b.token[0]))
  await restarted.recoverExpired()
  assert.equal(unpack(await dst.packageImportStatus(expired.id, b.token[0])).state, 'cancelled')
  const controller = new AbortController()
  b.faults.afterUpload = () => controller.abort()
  await assert.rejects(b.interchange.prepare(b.data.companies[0].id, b.data.users[0].id, bytes, PACKAGE_MIME, { target: 'design', name: 'Aborted' }, b.context(), controller.signal))
  b.faults.afterUpload = null
  assert.equal(await b.countFiles(), storedFiles)
  a.faults.afterDownload = async () => { a.faults.afterDownload = null; await a.stack.pool.query('UPDATE file_asset SET enabled=false WHERE id=$1', [file.id]) }
  await assert.rejects(sdk.exportPackage('design', original.id, { acknowledgeImageCopies: true }, a.token[0]))
  await a.stack.pool.query('UPDATE file_asset SET enabled=true WHERE id=$1', [file.id])
  ok('Expiration, abort after actual Storage write and resource revocation during export fail safely')
  const svg = new File(['<svg width="320" height="240"><g transform="translate(20,30)"><rect width="80" height="50" fill="#ff0000"/><circle cx="150" cy="60" r="20" fill="#0000ff"/></g></svg>'], 'drawing.svg', { type: 'image/svg+xml' })
  const svgJob = unpack(await dst.preparePackageImport(svg, { target: 'personal', name: 'SVG template' }, b.token[0]))
  const svgResult = unpack(await dst.confirmPackageImport(svgJob.id, { digest: svgJob.digest, acceptWarnings: true }, b.token[0]))
  const svgBytes = Buffer.from(await (await dst.exportPackage('template', svgResult.id, { acknowledgeImageCopies: true }, b.token[0])).arrayBuffer())
  const svgPackage = await inspectNativePackage(svgBytes)
  assert.equal(svgPackage.portable.objects.length, 2); assert.ok(svgPackage.files.get('licenses/original-svg.txt'))
  ok('SVG subset imports as editable personal template and exports native with original source retained as inert text')
  const forged = new File(['<svg width="320" height="240"><script>alert(1)</script></svg>'], 'bad.svg', { type: 'image/svg+xml' })
  assert.ok(unpack(await dst.inspectPackage(forged, b.token[0])).blockingErrors.length)
  const permissions = await b.stack.pool.query("SELECT has_table_privilege('authenticated','studio_interchange_job','SELECT') allowed")
  assert.equal(permissions.rows[0].allowed, false)
  passed = true
} finally {
  for (const env of environments.reverse()) {
    env.interchange?.close(); env.server?.closeAllConnections()
    if (env.server) await new Promise(resolve => env.server.close(resolve))
    await env.prisma?.$disconnect().catch(() => {}); await env.stack.close()
  }
  await writeFile(join(directory, 'integration-result.json'), JSON.stringify({ passed, checks }, null, 2))
}
