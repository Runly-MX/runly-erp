// Customer accounts of a published site: the first External Identity realm ('runly.website', siteId).
// Public side: /public/website/account/* on the site's own host. Admin side: /website/sites/:siteId/accounts*.
// Visitors never become Runly users; see docs/architecture/external-identity-realms.md.
import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { createExternalIdentity, createExternalAuthRouter } from '../../services/external-identity/index.js'
import { createCompanyMailer } from '../../services/smtp-service.js'
import { createCompanyBrandService } from '../../services/company-brand-service.js'
import { buildExternalAccountEmail } from '../../services/email-templates.js'
import { createTurnstileVerifier } from '../storefront/storefront-capture-routes.js'
import { requireWebsitePermission, websiteErrorHandler } from '../../services/website-authorization-service.js'

export const WEBSITE_REALM = 'runly.website'
// Pages the template's account block lives on; email links land there.
const ACCOUNT_PATH = '/cuenta'

export function createWebsiteIdentity({ prisma, supabaseAdmin = null, mailer = createCompanyMailer({ prisma }) }) {
  const brands = createCompanyBrandService({ prisma, supabaseAdmin })
  return createExternalIdentity({
    prisma,
    async notify({ realm, account, kind, token, context }) {
      const site = await prisma.websiteSite.findFirst({ where: { id: realm.ownerId, companyId: realm.companyId }, select: { name: true } })
      const action = { verify_email: 'verificar', reset_password: 'restablecer' }[kind]
      const url = `${context?.origin ?? ''}${ACCOUNT_PATH}${action ? `?accion=${action}&t=${encodeURIComponent(token)}` : ''}`
      const brand = await brands.getBrandForCompany(realm.companyId).catch(() => null)
      await mailer.sendEmail({ companyId: realm.companyId, to: account.email, ...buildExternalAccountEmail({ kind, url, siteName: site?.name, brand }) })
    },
    // The customer shows up in runly.contacts: an existing contact with that email is linked, never overwritten.
    async onRegistered({ realm, account }) {
      let contact = await prisma.contact.findFirst({ where: { companyId: realm.companyId, enabled: true, email: { equals: account.email, mode: 'insensitive' } }, select: { id: true } })
      contact ??= await prisma.contact.create({ data: { companyId: realm.companyId, type: 'customer', name: account.displayName, email: account.email, phone: account.phone, tags: ['cliente-web'] }, select: { id: true } })
      await prisma.externalAccount.update({ where: { id: account.id }, data: { contactId: contact.id } })
    },
  })
}

export function createWebsiteAccountsPublicRouter({ prisma, gateway, identity, verifyTurnstile = createTurnstileVerifier() }) {
  // The realm is the site the host resolves to; resolved once per request.
  async function resolveRealm(c) {
    if (c.get('websiteRealm') !== undefined) return c.get('websiteRealm')
    const snapshot = await gateway.resolve(c).catch(() => null)
    const realm = snapshot ? await identity.findRealm({ moduleKey: WEBSITE_REALM, ownerId: snapshot.site.id }) : null
    const scoped = realm && realm.companyId === snapshot.site.companyId ? realm : null
    c.set('websiteRealm', scoped); c.set('websiteSite', snapshot?.site ?? null)
    return scoped
  }
  return createExternalAuthRouter({
    identity, resolveRealm,
    verifyHuman: async ({ c, token }) => {
      const site = c.get('websiteSite')
      return !site?.turnstileSecretKey || verifyTurnstile({ token, encryptedSecretKey: site.turnstileSecretKey })
    },
  })
}

const settingsSchema = z.object({ enabled: z.boolean(), allowSignup: z.boolean(), requireEmailVerification: z.boolean(), sessionDays: z.number().int().min(1).max(365) }).strict()
const statusSchema = z.object({ status: z.enum(['active', 'disabled']) }).strict()
const REALM_DEFAULTS = { enabled: false, allowSignup: true, requireEmailVerification: true, sessionDays: 30 }
const pickSettings = (r) => ({ enabled: r.enabled, allowSignup: r.allowSignup, requireEmailVerification: r.requireEmailVerification, sessionDays: r.sessionDays })

export function createWebsiteAccountsAdminRouter({ prisma, identity, requirePermission }) {
  const app = new Hono()
  const read = requireWebsitePermission(requirePermission, 'website.accounts.read')
  const manage = requireWebsitePermission(requirePermission, 'website.accounts.manage')
  const notFound = (c) => c.json({ error: 'Recurso no encontrado.', code: 'resource_not_found' }, 404)
  const audit = (c, action, entityId, before, after) => prisma.auditLog.create({ data: { companyId: c.get('companyId'), actorId: c.get('userId') ?? null, moduleKey: 'runly.website', entityType: 'external_account', entityId, action, before, after } })

  // Site must belong to the caller's company; the realm (if any) must belong to that site.
  async function scope(c) {
    const site = await prisma.websiteSite.findFirst({ where: { id: c.req.param('siteId'), companyId: c.get('companyId'), enabled: true }, select: { id: true, companyId: true } })
    if (!site) return null
    return { site, realm: await identity.findRealm({ moduleKey: WEBSITE_REALM, ownerId: site.id }) }
  }

  app.get('/sites/:siteId/account-settings', read, async (c) => {
    const s = await scope(c); if (!s) return notFound(c)
    return c.json({ data: s.realm ? pickSettings(s.realm) : REALM_DEFAULTS })
  })
  app.put('/sites/:siteId/account-settings', manage, zValidator('json', settingsSchema), async (c) => {
    const s = await scope(c); if (!s) return notFound(c)
    const realm = s.realm ?? await identity.ensureRealm({ companyId: s.site.companyId, moduleKey: WEBSITE_REALM, ownerId: s.site.id })
    const updated = await identity.updateRealm(realm, c.req.valid('json'))
    await audit(c, 'website.accounts.settings_update', s.site.id, pickSettings(realm), pickSettings(updated))
    return c.json({ data: pickSettings(updated) })
  })

  app.get('/sites/:siteId/accounts', read, async (c) => {
    const s = await scope(c); if (!s) return notFound(c)
    if (!s.realm) return c.json({ data: [], total: 0 })
    const q = c.req.query()
    return c.json(await identity.listAccounts({ realm: s.realm, search: q.search?.slice(0, 120) ?? '', status: ['active', 'disabled'].includes(q.status) ? q.status : null, limit: q.limit, offset: q.offset }))
  })
  app.patch('/sites/:siteId/accounts/:accountId', manage, zValidator('json', statusSchema), async (c) => {
    const s = await scope(c); if (!s?.realm) return notFound(c)
    const { status } = c.req.valid('json')
    const { before, after } = await identity.setAccountStatus({ realm: s.realm, accountId: c.req.param('accountId'), status })
    await audit(c, status === 'active' ? 'website.account.enable' : 'website.account.disable', after.id, { status: before.status }, { status: after.status })
    return c.json({ data: { id: after.id, status: after.status } })
  })
  app.post('/sites/:siteId/accounts/:accountId/revoke-sessions', manage, async (c) => {
    const s = await scope(c); if (!s?.realm) return notFound(c)
    await identity.revokeSessions({ realm: s.realm, accountId: c.req.param('accountId') })
    await audit(c, 'website.account.sessions_revoke', c.req.param('accountId'), null, null)
    return c.body(null, 204)
  })

  app.onError((error, c) => error?.name === 'ExternalIdentityError' ? c.json({ error: error.message, code: error.code }, error.status) : websiteErrorHandler(error, c))
  return app
}
