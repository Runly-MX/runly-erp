// runly.purchases: settings, capabilities, dashboard and suppliers.
import { Hono } from 'hono'
import { actorId, body, companyOf, createHandler } from './route-helpers.js'
import { PurchasesServiceError } from '../../services/purchases-shared.js'

export function createPurchasesSettingsRouter({ requirePermission, requireAnyPermission, services }) {
  const router = new Hono()
  const anyPurchasesReader = requireAnyPermission
    ? requireAnyPermission(['purchases.access', 'purchases.read', 'purchases.relation.read'])
    : requirePermission('purchases.access')
  const handle = createHandler('[purchases:settings]')
  const { workflow, suppliers, approvalChat } = services

  router.get('/purchases/settings', requirePermission('purchases.settings.read'), c =>
    handle(c, async () => ({ data: await workflow.getSettings(companyOf(c), actorId(c)) })))

  router.put('/purchases/settings', requirePermission('purchases.settings.manage'), c =>
    handle(c, async () => ({ data: await workflow.updateSettings(companyOf(c), actorId(c), await body(c)) })))

  // Chat channel where pending approvals appear as cards with Aprobar / Rechazar.
  const chatErrors = async (callback) => {
    try { return await callback() } catch (error) {
      if (error?.name === 'PurchaseApprovalChatError') throw new PurchasesServiceError(error.message, error.status, 'VALIDATION')
      throw error
    }
  }
  router.get('/purchases/approval-channel', requirePermission('purchases.settings.read'), c =>
    handle(c, async () => ({ data: { channel: await approvalChat.getChannel(companyOf(c)) } })))

  router.put('/purchases/approval-channel', requirePermission('purchases.settings.manage'), c =>
    handle(c, async () => ({ data: await chatErrors(async () => approvalChat.setChannel(companyOf(c), (await body(c)).channel)) })))

  // Any purchases reader (and the inventory "Compra" section) needs the flags.
  router.get('/purchases/capabilities', anyPurchasesReader, c =>
    handle(c, async () => ({ data: await workflow.getCapabilities(companyOf(c), actorId(c)) })))

  // Folio suggestion for editors; any purchases reader may ask.
  router.get('/purchases/numbering/:kind/next', anyPurchasesReader, c =>
    handle(c, async () => ({ data: await workflow.suggestNumber(companyOf(c), c.req.param('kind'), c.req.query('date')) })))

  router.get('/purchases/dashboard', requirePermission('purchases.read'), c =>
    handle(c, async () => ({ data: await workflow.dashboard(companyOf(c), actorId(c)) })))

  router.get('/purchases/suppliers', requirePermission('purchases.supplier.read'), c =>
    handle(c, () => suppliers.list(companyOf(c), c.req.query())))

  router.get('/purchases/suppliers/:contactId', requirePermission('purchases.supplier.read'), c =>
    handle(c, async () => ({ data: await suppliers.get(companyOf(c), c.req.param('contactId')) })))

  router.put('/purchases/suppliers/:contactId/profile', requirePermission('purchases.supplier.manage'), c =>
    handle(c, async () => ({ data: await suppliers.updateProfile(companyOf(c), actorId(c), c.req.param('contactId'), await body(c)) })))

  return router
}
