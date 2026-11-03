import { createHash } from 'node:crypto'
import { WebsiteServiceError, notFound } from '../routes/website/service-helpers.js'
import { assertWebsiteAccess } from './website-authorization-service.js'
import { RegistryError, RegistryUnavailableError } from './website-registry-client.js'
import { slugProblem } from './website-registry-contract.js'

// Hostname lifecycle for platform subdomains: check, reserve, bind to a site, read status, activate, release.
// The global registry is the only authority over names. The local website_domain row records which of this
// installation's sites owns a hostname and mirrors the registry's liveness; serving a published site never
// calls the registry, so an interruption of the registry cannot take a published site down.
const fail = (status, code, message) => new WebsiteServiceError(message, status, code)
const MESSAGES = {
  NAME_UNAVAILABLE: 'Ese nombre no está disponible.',
  NAME_RESERVED: 'Ese nombre está reservado.',
  SLUG_INVALID: 'Usa de 3 a 50 letras minúsculas, números o guiones, sin guiones dobles.',
  NAMESPACE_NOT_READY: 'La infraestructura de este dominio todavía no está lista.',
  NAMESPACE_NOT_FOUND: 'Este dominio no está disponible en el registro.',
  NAME_NOT_ACTIVATABLE: 'Este nombre no se puede activar en su estado actual.',
  NAME_NOT_RELEASABLE: 'Este nombre no se puede liberar en su estado actual.',
  NAME_LIMIT_REACHED: 'Se alcanzó el máximo de nombres de esta instalación.',
  CLAIM_RATE_LIMITED: 'Demasiadas solicitudes de nombres; inténtalo más tarde.',
  INSTALLATION_NOT_ACTIVE: 'Esta instalación no puede reservar nombres ahora.',
  REGISTRY_AUTH_FAILED: 'Esta instalación no está autorizada en el registro.',
}
const mapError = (error) => {
  if (error instanceof RegistryUnavailableError) return fail(503, 'registry_unavailable', 'El registro de nombres no está disponible ahora. Tus sitios publicados siguen funcionando.')
  if (error instanceof RegistryError) return fail(error.status === 401 ? 503 : error.status, error.code.toLowerCase(), MESSAGES[error.code] ?? 'No se pudo completar la operación.')
  return error
}
// Registry state -> local liveness. Only 'assigned' with a ready namespace is ever served.
// Only laboratory namespaces may be reserved without the global registry; a real one never falls back to a local decision.
export const localFallbackAllowed = (registry, namespaceRoot) => !registry && Boolean(namespaceRoot?.endsWith('.test'))
export const localLiveness = (view) => ({ state: view.state, ready: view.state === 'assigned' && Boolean(view.ready) })
const idemKey = (a, op, ...parts) => a.idempotencyKey && a.idempotencyKey.length >= 16 ? `${a.idempotencyKey}:${op}`.slice(0, 200) : createHash('sha256').update([op, ...parts, Date.now(), Math.random()].join('|')).digest('hex')

export function createWebsiteHostnameService({ prisma, registry, namespaceRoot, gateway }) {
  const guarded = async (a, permission = 'website.domains.manage') => {
    assertWebsiteAccess(a.access, a.companyId, permission)
    if (!a.siteId) throw notFound('Recurso')
    const site = await prisma.websiteSite.findFirst({ where: { id: a.siteId, companyId: a.companyId, enabled: true } })
    if (!site) throw notFound('Recurso')
    return site
  }
  const requireRegistry = () => {
    if (!registry || !namespaceRoot) throw fail(409, 'registry_required', 'Los subdominios automáticos requieren el registro de nombres de Runly en esta instalación.')
    return registry
  }
  const owned = async (a, hostname) => {
    const row = await prisma.websiteDomain.findFirst({ where: { hostname: String(hostname).toLowerCase(), companyId: a.companyId, siteId: a.siteId, registryManaged: true } })
    if (!row) throw notFound('Recurso')
    return row
  }
  const apply = (hostname, view) => prisma.websiteDomain.update({ where: { hostname }, data: { ...localLiveness(view), registryVersion: view.version, registryRedirectTo: view.redirectTo ?? null, registrySyncedAt: new Date() } })
  const publicView = (row, extra = {}) => ({ hostname: row.hostname, state: row.state, ready: row.ready, registryManaged: row.registryManaged, ...extra })

  async function availability(a) {
    await guarded(a)
    const slug = String(a.slug ?? '').toLowerCase()
    const problem = slugProblem(slug)
    if (problem) return { available: false, reason: problem }
    const local = await prisma.websiteDomain.findUnique({ where: { hostname: `${slug}.${namespaceRoot}` } })
    if (local) return { available: false, reason: 'NAME_UNAVAILABLE' }
    try { return await requireRegistry().availability(namespaceRoot, slug) } catch (error) { throw mapError(error) }
  }

  async function reserve(a) {
    const site = await guarded(a)
    if (!registry) {
      // Lab-only fallback kept from before the registry; a real namespace must never be reserved locally.
      if (localFallbackAllowed(registry, namespaceRoot)) return gateway.reserve(a)
      requireRegistry()
    }
    const slug = String(a.slug ?? '').toLowerCase()
    const problem = slugProblem(slug)
    if (problem) throw fail(problem === 'SLUG_INVALID' ? 422 : 409, problem.toLowerCase(), MESSAGES[problem])
    const hostname = `${slug}.${namespaceRoot}`
    const local = await prisma.websiteDomain.findUnique({ where: { hostname } })
    if (local && !(local.registryManaged && local.companyId === a.companyId && local.siteId === site.id)) throw fail(409, 'name_unavailable', MESSAGES.NAME_UNAVAILABLE)
    let view
    try {
      view = await registry.claim({ namespace: namespaceRoot, slug, companyRef: registry.ref('company', a.companyId), siteRef: registry.ref('site', site.id) }, idemKey(a, 'claim', a.companyId, site.id, slug))
    } catch (error) { throw mapError(error) }
    const row = local
      ? await apply(hostname, view)
      : await prisma.websiteDomain.create({ data: { hostname, companyId: a.companyId, siteId: site.id, kind: 'platform', registryManaged: true, ...localLiveness(view), registryVersion: view.version, registrySyncedAt: new Date() } })
    return publicView(row, { namespaceReady: view.namespaceReady })
  }

  async function activate(a) {
    await guarded(a)
    const row = await owned(a, a.hostname)
    try { return publicView(await apply(row.hostname, await requireRegistry().activate(row.hostname, idemKey(a, 'activate', row.hostname)))) } catch (error) { throw mapError(error) }
  }
  async function release(a) {
    await guarded(a)
    const row = await owned(a, a.hostname)
    try { return publicView(await apply(row.hostname, await requireRegistry().release(row.hostname, idemKey(a, 'release', row.hostname)))) } catch (error) { throw mapError(error) }
  }
  // Status prefers the registry but never fails because of it: the local mirror is always returned.
  async function status(a) {
    await guarded(a, 'website.site.read')
    const row = await owned(a, a.hostname)
    if (!registry) return publicView(row, { stale: true })
    try { return publicView(await apply(row.hostname, await registry.status(row.hostname)), { stale: false }) } catch (error) {
      if (error instanceof RegistryUnavailableError) return publicView(row, { stale: true })
      throw mapError(error)
    }
  }

  // Pulls this installation's names and mirrors their liveness. It only advances local rows that already
  // exist: it never creates ownership and never releases or deletes anything.
  async function sync() {
    if (!registry) return { skipped: true }
    const names = await registry.list()
    let updated = 0
    const confirmed = []
    for (const view of names) {
      const row = await prisma.websiteDomain.findFirst({ where: { hostname: view.hostname, registryManaged: true } })
      if (!row) continue
      confirmed.push(row.hostname)
      const next = localLiveness(view)
      if (row.state !== next.state || row.ready !== next.ready || row.registryVersion !== view.version) { await apply(row.hostname, view); updated += 1 }
    }
    // A complete answer from the registry is the freshness proof the gateway checks (registryMaxStaleMs).
    if (confirmed.length) await prisma.websiteDomain.updateMany({ where: { hostname: { in: confirmed }, registryManaged: true }, data: { registrySyncedAt: new Date() } })
    return { checked: names.length, updated }
  }
  return { availability, reserve, activate, release, status, sync }
}
