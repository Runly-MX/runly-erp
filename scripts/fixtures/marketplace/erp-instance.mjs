// One ERP instance as its own OS process (E4 multi-instance verification). Everything comes from ITS environment:
// its database and Storage, its installation identity and key file, its Hub URL. Runs the real ERP service code
// (E2 catalog, E3a gate and importers, E4 client and receipts) and prints one JSON line. Test fixture only: the
// catalog trust key is the public H4 lab TEST key passed by the verification script.
//   node scripts/fixtures/marketplace/erp-instance.mjs <import|capabilities|enable-receipts|receipt KIND ID|download RELEASE|local>
import { createRequire } from 'node:module'
import prismaPackage from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import { createResourceCatalogService } from '../../../apps/api/src/services/catalog/resource-catalog-service.js'
import { createMarketplaceImportGate } from '../../../apps/api/src/services/marketplace/marketplace-import-gate.js'
import { createAutomationImportService } from '../../../apps/api/src/services/marketplace/automation-import-service.js'
import { createMarketplaceInstallClientFromEnvSafe } from '../../../apps/api/src/services/marketplace/marketplace-install-client.js'
import { createMarketplaceReceiptsService } from '../../../apps/api/src/services/marketplace/marketplace-receipts-service.js'
import { createFilesService } from '../../../apps/api/src/services/files-service.js'
import { createStudioService } from '../../../apps/api/src/routes/studio/studio-service.js'
import { createStudioTemplatesService } from '../../../apps/api/src/routes/studio/studio-templates-service.js'
import { createStudioInterchange } from '../../../apps/api/src/routes/studio/interchange/service.js'
import { PACKAGE_MIME } from '../../../apps/api/src/routes/studio/interchange/zip.js'

const require = createRequire(new URL('../../../apps/api/package.json', import.meta.url))
const { createClient } = require('@supabase/supabase-js')
const env = process.env, [command, ...args] = process.argv.slice(2)
const pool = new pg.Pool({ connectionString: env.E4_DATABASE_URL, max: 4 })
const prisma = new prismaPackage.PrismaClient({ adapter: new PrismaPg(pool) })
const companyId = env.E4_COMPANY_ID, actorId = env.E4_ACTOR_ID
const out = (value) => process.stdout.write(JSON.stringify(value) + '\n')
const client = createMarketplaceInstallClientFromEnvSafe(env, { warn: () => {} })
const receipts = createMarketplaceReceiptsService({ prisma, client })
try {
  if (command === 'import') {
    const catalog = createResourceCatalogService({ prisma, trust: { resource: [env.E4_LAB_TRUST_KEY] } })
    const gate = createMarketplaceImportGate({ catalog })
    const refreshed = await catalog.refresh()
    const items = await catalog.list()
    const studioItem = items.find((i) => i.type === 'studio_template'), automationItem = items.find((i) => i.type === 'automation')
    const ref = (i) => ({ resourceKey: i.resourceKey, version: i.version, releaseId: i.releaseId })
    const verified = await Promise.all([studioItem, automationItem].map(async (i) => (await catalog.downloadPackage(i.resourceKey, i.version)).sha256))
    const admin = createClient(env.E4_SUPABASE_URL, env.E4_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
    const files = createFilesService({ prisma, supabaseAdmin: admin })
    const designs = createStudioService({ prisma, filesService: files })
    const templates = createStudioTemplatesService({ prisma, filesService: files, supabaseAdmin: admin, designService: designs })
    const interchange = createStudioInterchange({ prisma, filesService: files, supabaseAdmin: admin, designs, templates, verifySource: gate.recheck })
    const context = { authUserId: env.E4_AUTH_USER_ID, activeContext: { companyId, profileId: actorId, isAdmin: false, permissionSet: new Set(['files.assets.read', 'files.assets.create']) } }
    const download = await gate.download(ref(studioItem), 'studio_template', { companyId, actorId })
    const job = await interchange.prepare(companyId, actorId, download.bytes, PACKAGE_MIME, { target: 'personal', name: `Menú de ${env.E4_LABEL}` }, context, undefined, download.source)
    const template = await interchange.confirm(companyId, actorId, job.id, { digest: job.digest, acceptWarnings: true }, context)
    interchange.close()
    const automations = createAutomationImportService({ prisma, gate })
    const prepared = await automations.prepare({ companyId, actorId, ref: ref(automationItem) })
    const automation = await automations.confirm({ companyId, actorId, id: prepared.id, input: { definitionDigest: prepared.definitionDigest, services: prepared.services, acceptRisks: true } })
    out({ installClient: Boolean(client), sequence: refreshed.sequence, releases: [studioItem, automationItem].map((i) => ({ releaseId: i.releaseId, sha256: i.sha256 })), verified,
      studioImportId: job.id, templateId: template.id, automationImportId: prepared.id, automationKey: automation.key, automationEnabled: automation.enabled })
  } else if (command === 'capabilities') {
    try { out(await receipts.capabilities()) } catch (error) { out({ error: error.code ?? error.reason, status: error.status ?? null }) }
  } else if (command === 'enable-receipts') {
    out(await receipts.setEnabled(true, actorId))
  } else if (command === 'receipt') {
    out(await receipts.reportImportReceipt({ kind: args[0], importId: args[1], companyId }))
  } else if (command === 'download') {
    try { out(await client.download(args[0], { maxBytes: 26214400 })) } catch (error) { out({ error: error.code, status: error.status }) }
  } else if (command === 'local') {
    const q = async (sql) => (await pool.query(sql)).rows
    out({ companies: (await q('SELECT id FROM company ORDER BY id')).map((r) => r.id), templates: (await q('SELECT id FROM studio_template ORDER BY id')).map((r) => r.id),
      automations: (await q('SELECT key FROM system_automation ORDER BY key')).map((r) => r.key), instanceReceipts: (await q("SELECT value FROM instance_config WHERE key='marketplace.receipts.enabled'"))[0]?.value ?? null })
  } else throw new Error(`UNKNOWN_COMMAND:${command}`)
} finally { await prisma.$disconnect().catch(() => {}); await pool.end().catch(() => {}) }
