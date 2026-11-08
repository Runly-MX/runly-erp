// Instance settings of the Marketplace installations channel (E4). Instance-wide, so only the platform owner (or
// the admin of a single-company instance) may change them; never a company permission alone.
import { Hono } from 'hono'
import { createRequireInstanceAdmin } from '../lib/platform-owner.js'
import { createMarketplaceReceiptsService } from '../services/marketplace/marketplace-receipts-service.js'

export function createMarketplaceInstallationRouter({ prisma, requirePermission, client = null, receipts = createMarketplaceReceiptsService({ prisma, client }) }) {
  const app = new Hono()
  const guard = [requirePermission('platform.settings.manage'), createRequireInstanceAdmin({ prisma })]
  const fail = (c, error) => {
    if (error?.status === 400) return c.json({ error: 'Valor no válido.', code: error.message }, 400)
    // The Hub being unreachable or refusing is a diagnostic, not an ERP failure.
    if (error?.name === 'InstallChannelError' || error?.name === 'InstallChannelUnavailableError') return c.json({ data: { configured: true, reachable: false, code: error.code ?? error.reason } })
    console.error('[marketplace-installation]', error?.message)
    return c.json({ error: 'No se pudo completar la operación.' }, 500)
  }
  app.use('/settings/marketplace/*', async (c, next) => { c.header('Cache-Control', 'private, no-store'); await next() })
  app.get('/settings/marketplace/installation', ...guard, async (c) => c.json({ data: await receipts.status() }))
  app.put('/settings/marketplace/receipts', ...guard, async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}))
      return c.json({ data: await receipts.setEnabled(body?.enabled, c.get('userContext')?.profile?.id ?? null) })
    } catch (error) { return fail(c, error) }
  })
  app.get('/settings/marketplace/installation/capabilities', ...guard, async (c) => {
    try { return c.json({ data: { reachable: true, ...(await receipts.capabilities()) } }) } catch (error) { return fail(c, error) }
  })
  return app
}
