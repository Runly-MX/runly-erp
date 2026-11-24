// /modules/:key/trust — quarantine status of an installed custom module and the
// platform owner's decision after reviewing its code (F1B.1, module-trust.js).
// Approving trusts the exact bytes on disk now; quarantining stops its code
// from running. Neither touches the module's tables, rows or company settings.
import { decideModuleTrust, installedModuleDir, isModuleTrustConfigured, moduleTrustStatus } from '../lib/module-trust.js'
import { moduleCodeAuthorityDenied, ownerCodeAuthority } from '../lib/module-code-authority.js'

const KEY_RE = /^(custom|community)\.[a-z][a-z0-9_-]*$/

export function registerModuleTrustRoutes(app, { prisma, authMiddleware, requirePermission, routeLoader = null, cacheInvalidator = async () => {} }) {
  app.get('/:key/trust', authMiddleware, requirePermission('core.modules.read'), async (c) => {
    const key = c.req.param('key')
    if (!KEY_RE.test(key) || !isModuleTrustConfigured()) return c.json({ error: 'MODULE_TRUST_UNAVAILABLE' }, 404)
    const status = await moduleTrustStatus(key, installedModuleDir(key))
    return c.json({ data: { key, state: status.state, reason: status.reason, authority: status.record?.authority ?? null, decidedAt: status.record?.at ?? null } })
  })

  app.post('/:key/trust', authMiddleware, requirePermission('core.modules.manage'), async (c) => {
    if (!ownerCodeAuthority(c.get('tenantContext'))) return moduleCodeAuthorityDenied(c)
    const key = c.req.param('key')
    if (!KEY_RE.test(key) || !isModuleTrustConfigured()) return c.json({ error: 'MODULE_TRUST_UNAVAILABLE' }, 404)
    const body = await c.req.json().catch(() => ({}))
    if (!['approve', 'quarantine'].includes(body?.decision)) return c.json({ error: 'MODULE_TRUST_DECISION_INVALID' }, 422)
    const actorId = c.get('userContext')?.profile?.id ?? null
    const reason = typeof body.reason === 'string' ? body.reason.slice(0, 500) : null
    const record = await decideModuleTrust({ key, decision: body.decision, actorId, reason })
    await prisma.auditLog.create({ data: { actorId, moduleKey: key, entityType: 'RunlyModuleTrust', action: `core.module.trust.${body.decision}`, before: null, after: JSON.stringify({ state: record.state, hash: record.trustedHashes[0] ?? null, reason }), metadata: null } }).catch(() => {})
    if (routeLoader) {
      routeLoader.unloadModule(key)
      if (body.decision === 'approve') await routeLoader.reloadModule(key).catch(() => null)
    }
    await cacheInvalidator()
    return c.json({ data: { key, state: record.state, authority: record.authority } })
  })
}
