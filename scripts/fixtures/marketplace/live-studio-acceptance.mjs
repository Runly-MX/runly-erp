import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createResourceCatalogService, RESOURCE_CONFIG_KEYS } from '../../../apps/api/src/services/catalog/resource-catalog-service.js'
import { createMarketplaceImportGate } from '../../../apps/api/src/services/marketplace/marketplace-import-gate.js'
import { createStudioInterchange } from '../../../apps/api/src/routes/studio/interchange/service.js'
import { inspectNativePackage, PACKAGE_MIME } from '../../../packages/studio-interchange/src/inspect.js'
import { documentPages } from '../../../apps/shared/studio/pages.js'

// Invoked only by verify-marketplace-imports on its disposable Auth/DB/Storage.
// Trust uses the shipped production pins; no production data is ever written.
export async function verifyLiveStudio({ url, resourceKey, prisma, files, storage, designs, templates, users, companies }) {
  const config = new Map([[RESOURCE_CONFIG_KEYS.url, url]]), cache = new Map()
  const catalog = createResourceCatalogService({ prisma: {
    instanceConfig: { findUnique: async ({ where }) => ({ value: config.get(where.key) }), upsert: async ({ where, create, update }) => { config.set(where.key, (update ?? create).value) } },
    moduleCatalogCache: { findUnique: async ({ where }) => cache.get(where.url), upsert: async ({ where, create, update }) => { cache.set(where.url, update ?? create) } },
  } })
  assert.equal((await catalog.refresh()).status, 'ok')
  const resource = (await catalog.list({ type: 'studio_template' })).find(r => r.resourceKey === resourceKey)
  assert.ok(resource?.eligible && resource.official, 'live resource must be eligible and institutionally verified by shipped pins')
  const downloaded = await catalog.downloadPackage(resource.resourceKey, resource.version)
  const originalDigest = createHash('sha256').update(downloaded.bytes).digest('hex')
  assert.equal(originalDigest, resource.sha256)
  const original = await inspectNativePackage(downloaded.bytes)
  const gate = createMarketplaceImportGate({ catalog })
  const interchange = createStudioInterchange({ prisma, filesService: files, supabaseAdmin: storage, designs, templates, verifySource: gate.recheck })
  const companyId = companies[0].id, actorId = users[0].id
  const permissionSet = new Set((await prisma.$queryRaw`SELECT p.key FROM role_permission rp JOIN permission p ON p.id=rp.permission_id WHERE rp.role_id=${companies[0].roleId}::uuid`).map(p => p.key))
  const context = { authUserId: users[0].authId, activeContext: { companyId, profileId: actorId, isAdmin: false, permissionSet } }
  try {
    const input = { resourceKey: resource.resourceKey, version: resource.version, releaseId: resource.releaseId }
    await assert.rejects(interchange.authorize(companyId, users[1].id, 'design'))
    const pkg = await gate.download(input, 'studio_template', { actorId, companyId })
    const job = await interchange.prepare(companyId, actorId, pkg.bytes, PACKAGE_MIME, { target: 'design', name: 'Acceptance editable copy' }, context, undefined, pkg.source)
    assert.equal(job.state, 'ready')
    await assert.rejects(interchange.confirm(companies[1].id, actorId, job.id, { digest: job.digest, acceptWarnings: true }, context))
    const confirmed = await interchange.confirm(companyId, actorId, job.id, { digest: job.digest, acceptWarnings: true }, context)
    const saved = await designs.get(companyId, actorId, confirmed.id)
    const exported = await inspectNativePackage(await interchange.exportPackage(companyId, actorId, 'design', saved.id, { acknowledgeImageCopies: true }, context))
    assert.deepEqual(exported.manifest.resources.map(r => r.sha256).sort(), original.manifest.resources.map(r => r.sha256).sort(), 'embedded resource bytes preserved')
    const before = documentPages(original.portable), after = documentPages(saved.document)
    assert.equal(after.length, before.length)
    for (let i = 0; i < before.length; i++) {
      assert.equal(after[i].objects.length, before[i].objects.length)
      assert.deepEqual(after[i].objects.map(o => o.type), before[i].objects.map(o => o.type))
      assert.deepEqual(after[i].objects.filter(o => o.type === 'text').map(o => o.text), before[i].objects.filter(o => o.type === 'text').map(o => o.text))
    }
    const edited = structuredClone(saved.document), text = documentPages(edited).flatMap(p => p.objects).find(o => o.type === 'text')
    assert.ok(text, 'editable text layer preserved'); text.text = 'Acceptance edit'
    await designs.update(companyId, actorId, saved.id, { name: saved.name, revision: saved.revision, document: edited }, context)
    assert.ok(documentPages((await designs.get(companyId, actorId, saved.id)).document).flatMap(p => p.objects).some(o => o.text === 'Acceptance edit'))
    assert.equal(createHash('sha256').update(downloaded.bytes).digest('hex'), originalDigest, 'original bytes preserved')
    return { version: resource.version, sha256: resource.sha256, bytes: downloaded.size, pages: after.length, layers: after.reduce((n, p) => n + p.objects.length, 0), assets: original.manifest.resources.length, edited: true }
  } finally { interchange.close() }
}
