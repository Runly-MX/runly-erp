// ERP E4: opt-in install receipts. Instance-wide consent (the platform owner / instance administrator), OFF by
// default and never switched on by an upgrade. Receipts carry only the verified E3a provenance (releaseId, sha256),
// never company, user, site, instance URL, IP or free text. Sending is explicit; it is not wired into E3a, and a
// failure never touches an import that is already confirmed.
export const RECEIPTS_CONFIG_KEY = 'marketplace.receipts.enabled'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function createMarketplaceReceiptsService({ prisma, client = null }) {
  async function enabled() {
    const row = await prisma.instanceConfig.findUnique({ where: { key: RECEIPTS_CONFIG_KEY }, select: { value: true } })
    return row?.value === 'true'
  }
  async function status() {
    return { channelConfigured: Boolean(client), receiptsEnabled: await enabled(), privateDownloads: 'inactive' }
  }
  async function setEnabled(value, actorId = null) {
    if (typeof value !== 'boolean') throw Object.assign(new Error('RECEIPTS_ENABLED_INVALID'), { status: 400 })
    await prisma.instanceConfig.upsert({ where: { key: RECEIPTS_CONFIG_KEY }, update: { value: String(value) }, create: { key: RECEIPTS_CONFIG_KEY, value: String(value) } })
    await prisma.auditLog.create({ data: { companyId: null, actorId, moduleKey: 'runly.marketplace', entityType: 'InstanceConfig', entityId: null, action: value ? 'marketplace.receipts.enabled' : 'marketplace.receipts.disabled', after: { enabled: value } } })
    return status()
  }
  // Diagnostics: what the Hub authorizes for this installation (no download attempt).
  async function capabilities() {
    if (!client) return { configured: false, capabilities: [] }
    return { configured: true, ...(await client.capabilities()) }
  }

  // The committed E3a import (this company only) and its verified Marketplace provenance.
  async function provenance(kind, importId, companyId) {
    if (!UUID.test(String(importId ?? '')) || !UUID.test(String(companyId ?? ''))) return null
    const rows = kind === 'studio'
      ? await prisma.$queryRaw`SELECT j.source, j.created_at AS started, COALESCE(d.created_at, t.created_at, j.created_at) AS finished FROM studio_interchange_job j
          LEFT JOIN studio_design d ON j.result->>'kind'='design' AND d.id::text=j.result->>'id'
          LEFT JOIN studio_template t ON j.result->>'kind'='template' AND t.id::text=j.result->>'id'
          WHERE j.id=${importId}::uuid AND j.company_id=${companyId}::uuid AND j.state='committed' AND j.source->>'kind'='marketplace'`
      : kind === 'automation'
        ? await prisma.$queryRaw`SELECT source, created_at AS started, confirmed_at AS finished FROM marketplace_automation_import WHERE id=${importId}::uuid AND company_id=${companyId}::uuid AND state='committed'`
        : []
    return rows[0] ?? null
  }

  // Explicit, opt-in "component" receipt for one confirmed E3a import. Returns { sent, ... }; never throws.
  async function reportImportReceipt({ kind, importId, companyId }) {
    if (!(await enabled())) return { sent: false, reason: 'disabled' }
    if (!client) return { sent: false, reason: 'not_configured' }
    const row = await provenance(kind, importId, companyId)
    if (!row?.source?.releaseId || !row.source.sha256) return { sent: false, reason: 'no_marketplace_provenance' }
    const startedAt = new Date(row.started).toISOString(), finishedAt = new Date(row.finished ?? row.started).toISOString()
    const receipt = { schemaVersion: 1, kind: 'component', solutionReleaseId: null, state: 'applied',
      components: [{ releaseId: row.source.releaseId, sha256: row.source.sha256, state: 'applied', errorCode: null }], startedAt, finishedAt }
    // Stable per import: a retry of the same import is the same receipt (the Hub answers 200 with the same id).
    const idempotencyKey = `e3a-${kind}-${String(importId).toLowerCase()}`
    try {
      return { sent: true, ...(await client.sendReceipt(receipt, idempotencyKey)) }
    } catch (error) {
      return { sent: false, reason: error?.code ?? error?.reason ?? 'error', status: error?.status ?? null, retryable: Boolean(error?.retryable) }
    }
  }

  return { enabled, status, setEnabled, capabilities, reportImportReceipt }
}
