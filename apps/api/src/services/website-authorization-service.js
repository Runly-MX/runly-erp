import { WebsiteServiceError } from '../routes/website/service-helpers.js'

// Explicit compatibility only: editing never implies permission to publish.
export const WEBSITE_PERMISSION_ALIASES = Object.freeze({
  'website.forms.read': ['website.pages.read'],
  'website.forms.create': ['website.pages.create'],
  'website.forms.update': ['website.pages.update'],
  'website.forms.delete': ['website.pages.delete'],
  'website.submissions.read': ['website.pages.read'],
  'website.submissions.delete': ['website.pages.delete'],
  // Roles that already configure the site keep managing its customer accounts without a reseed.
  'website.accounts.read': ['website.site.read'],
  'website.accounts.manage': ['website.site.update'],
})
const issuedAccess = new WeakSet()

// Called only by authenticated server adapters, never with a request body.
export function createWebsiteAccess({ companyId, actorId, can, isAdmin = false }) {
  if (!companyId || !actorId || typeof can !== 'function') {
    throw new WebsiteServiceError('No autorizado.', 401, 'unauthorized')
  }
  const access = Object.freeze({ companyId, actorId, isAdmin: isAdmin === true, can: permission =>
    Boolean(can(permission) || WEBSITE_PERMISSION_ALIASES[permission]?.some(alias => can(alias))) })
  issuedAccess.add(access)
  return access
}

export function websiteAccessFromRequest(c) {
  const tenant = c.get('tenantContext')
  return createWebsiteAccess({
    companyId: tenant?.companyId,
    actorId: c.get('userId'),
    isAdmin: tenant?.isAdmin,
    can: permission => Boolean(tenant?.isAdmin || tenant?.permissionSet?.has(permission)),
  })
}

export function assertWebsiteAccess(access, companyId, permission) {
  if (!access || !issuedAccess.has(access)) throw new WebsiteServiceError('No autorizado.', 401, 'unauthorized')
  if (!companyId || access.companyId !== companyId) throw new WebsiteServiceError('Recurso no encontrado.', 404, 'resource_not_found')
  if (!access.can(permission)) throw new WebsiteServiceError('No tienes permiso para esta operación.', 403, 'permission_denied')
}

export function secureWebsiteMethods(methods, permissions, before = async () => {}) {
  return Object.fromEntries(Object.entries(methods).map(([name, method]) => [name, async args => {
    assertWebsiteAccess(args?.access, args?.companyId, permissions[name])
    // Actor identity always comes from the issued server context.
    const scoped = { ...args, actorId: args.access.actorId }
    await before(name, scoped)
    return method(scoped)
  }]))
}

export function requireWebsitePermission(requirePermission, permission) {
  return async (c, next) => {
    for (const key of [permission, ...(WEBSITE_PERMISSION_ALIASES[permission] ?? [])]) {
      let granted = false
      const response = await requirePermission(key)(c, async () => { granted = true; await next() })
      if (granted || response?.status !== 403) return response
    }
    return c.json({ error: 'No tienes permiso para esta operación.', code: 'permission_denied' }, 403)
  }
}

export function websiteErrorHandler(error, c) {
  if (error instanceof WebsiteServiceError) return c.json({ error: error.message, code: error.code }, error.status)
  // The client only sees a generic message; the operator needs the cause (name and code only, never request data).
  console.error('[website] unhandled error:', error?.name, error?.code, String(error?.message ?? '').slice(0, 400))
  return c.json({ error: 'No se pudo completar la operación.' }, 500)
}
