// ERP E3a: the only door between the importers (Studio, Automations) and the Marketplace.
// Resources come exclusively from the verified E2 resource feed: lookup by resourceKey + version +
// releaseId, trust/compatibility/eligibility/revocation from the signed snapshot, bytes only from
// catalog.downloadPackage (feed-relative URL, bounded, SHA-256 checked). It never accepts bytes from
// the browser, an arbitrary URL or the Hub's storage, and it never imports anything by itself.
import { z } from 'zod'
import { ResourceFeedError } from '../catalog/catalog-resource-contract.js'

export class MarketplaceImportError extends Error {
  constructor(code, message, status = 409, details = null) {
    super(message); this.name = 'MarketplaceImportError'; this.code = code; this.status = status; this.details = details
  }
}

export const resourceRefSchema = z.strictObject({
  resourceKey: z.string().regex(/^[a-z][a-z0-9_-]{0,31}\.[a-z0-9][a-z0-9-]{0,79}$/),
  version: z.string().min(1).max(128),
  releaseId: z.string().uuid(),
  acknowledgeStale: z.boolean().default(false),
})

const STATUS_BY_CODE = { RESOURCE_NOT_FOUND: 404, RESOURCE_FEED_NOT_CONFIGURED: 503, RESOURCE_FEED_UNAVAILABLE: 503, RESOURCE_FEED_UNREACHABLE: 503, RESOURCE_PACKAGE_UNAVAILABLE: 502, RESOURCE_PACKAGE_MISMATCH: 502, RESOURCE_PACKAGE_URL_REJECTED: 502 }
const MESSAGES = {
  RESOURCE_NOT_FOUND: 'El recurso no existe en el catálogo verificado.',
  RESOURCE_FEED_NOT_CONFIGURED: 'El catálogo de recursos no está configurado en esta instancia.',
  RESOURCE_FEED_UNAVAILABLE: 'No hay una copia verificada del catálogo de recursos.',
  RESOURCE_FEED_UNVERIFIED: 'No se pudo comprobar ahora en el catálogo que la publicación sigue vigente. No se creó nada; vuelve a intentarlo.',
  RESOURCE_KEY_UNTRUSTED: 'La firma del recurso no es de una clave de confianza.',
  RESOURCE_REVOKED: 'El recurso fue revocado.',
  RESOURCE_WITHDRAWN: 'El recurso fue retirado por su autor.',
  RESOURCE_FEED_EXPIRED: 'El catálogo caducó; actualízalo antes de importar.',
  RESOURCE_FEED_STALE: 'El catálogo es demasiado antiguo para importar.',
  RESOURCE_ACKNOWLEDGEMENT_REQUIRED: 'El catálogo no está al día: confirma que quieres importar con la copia actual.',
  RESOURCE_FORMAT_UNSUPPORTED: 'El recurso usa un formato más nuevo; actualiza Runly.',
  RESOURCE_RUNLY_VERSION: 'El recurso no es compatible con esta versión de Runly.',
  RESOURCE_PACKAGE_MISMATCH: 'El paquete descargado no coincide con el catálogo.',
  RESOURCE_PACKAGE_UNAVAILABLE: 'No se pudo descargar el paquete.',
  MARKETPLACE_RELEASE_MISMATCH: 'La publicación ya no corresponde a esa versión del recurso.',
  MARKETPLACE_TYPE_MISMATCH: 'El recurso no es del tipo esperado.',
}
const REFRESH_AFTER_MS = 60 * 60 * 1000

const toImportError = (error) => {
  if (error instanceof MarketplaceImportError) return error
  if (error instanceof ResourceFeedError) {
    const code = error.blockedBy?.[0] ?? error.code
    return new MarketplaceImportError(code, MESSAGES[code] ?? 'El catálogo de recursos rechazó la operación.', STATUS_BY_CODE[code] ?? 409, error.blockedBy ? { blockedBy: error.blockedBy } : null)
  }
  return error
}

export function createMarketplaceImportGate({ catalog, now = () => Date.now() }) {
  // A missing or old verified copy is refreshed once before a lookup; on failure the
  // catalog keeps its last verified copy (or reports there is none).
  async function ensureFresh(force = false) {
    const status = await catalog.status()
    if (!status.configured) throw toImportError(new ResourceFeedError('RESOURCE_FEED_NOT_CONFIGURED'))
    if (!force && status.verified && now() - Date.parse(status.fetchedAt) < REFRESH_AFTER_MS) return
    return catalog.refresh().catch(error => ({ alert: error?.code ?? 'RESOURCE_FEED_UNREACHABLE', offline: true }))
  }

  function check(inspection, ref, type) {
    const r = inspection.resource
    if (r.type !== type) throw new MarketplaceImportError('MARKETPLACE_TYPE_MISMATCH', MESSAGES.MARKETPLACE_TYPE_MISMATCH, 409)
    if (r.releaseId !== ref.releaseId || r.version !== ref.version) throw new MarketplaceImportError('MARKETPLACE_RELEASE_MISMATCH', MESSAGES.MARKETPLACE_RELEASE_MISMATCH, 409)
    if (!r.eligible) throw new MarketplaceImportError(r.blockedBy[0], MESSAGES[r.blockedBy[0]] ?? 'El recurso no se puede importar.', 409, { blockedBy: r.blockedBy })
    return r
  }

  async function list(type, { query = '', acknowledgeStale = false } = {}) {
    try {
      const refreshed = await ensureFresh()
      const status = await catalog.status({ acknowledgeStale })
      return { catalog: { ...status, alert: refreshed?.alert ?? status.alert ?? null, offline: refreshed?.offline ?? status.offline ?? false }, items: await catalog.list({ type, query, acknowledgeStale }) }
    } catch (error) { throw toImportError(error) }
  }

  // Verdict of one exact release, without downloading.
  async function resolve(input, type, { refresh = true } = {}) {
    const ref = resourceRefSchema.parse(input)
    try {
      if (refresh) await ensureFresh(refresh === 'force')
      const inspection = await catalog.inspect(ref.resourceKey, ref.version, { acknowledgeStale: ref.acknowledgeStale })
      return { ref, inspection, resource: check(inspection, ref, type) }
    } catch (error) { throw toImportError(error) }
  }

  // Authentic bytes of one exact release plus the provenance the importer persists.
  async function download(input, type, { actorId, companyId }) {
    const { ref, inspection, resource } = await resolve(input, type)
    let pkg
    try { pkg = await catalog.downloadPackage(ref.resourceKey, ref.version, { acknowledgeStale: ref.acknowledgeStale }) } catch (error) { throw toImportError(error) }
    // Identity re-checked on what was actually downloaded (the feed may have moved meanwhile).
    if (pkg.resource.releaseId !== resource.releaseId || pkg.sha256 !== resource.sha256 || pkg.size !== resource.size || pkg.bytes.length !== resource.size) throw new MarketplaceImportError('RESOURCE_PACKAGE_MISMATCH', MESSAGES.RESOURCE_PACKAGE_MISMATCH, 502)
    const source = {
      kind: 'marketplace', type, resourceKey: resource.resourceKey, version: resource.version, releaseId: resource.releaseId, sha256: resource.sha256, size: resource.size,
      title: resource.title, license: resource.license, publisher: resource.publisher?.handle ?? null, publisherVerified: Boolean(resource.publisher?.verified),
      catalogSequence: inspection.catalog.sequence, acknowledgedStale: ref.acknowledgeStale, importedBy: actorId, companyId, downloadedAt: new Date(now()).toISOString(),
    }
    return { bytes: pkg.bytes, resource, source, inspection }
  }

  // Before creating anything: the same release must still be eligible in a feed verified RIGHT NOW. A copy kept
  // from earlier (Hub unreachable, transport rejected, rollback or chain alert) never proves that the release was
  // not revoked meanwhile: the confirmation is refused with a retryable 503 and nothing is created.
  async function recheck(source) {
    let fresh
    try { fresh = await catalog.refresh() } catch (error) { throw new MarketplaceImportError('RESOURCE_FEED_UNVERIFIED', MESSAGES.RESOURCE_FEED_UNVERIFIED, 503, { reason: error?.code ?? 'unreachable' }) }
    if (fresh?.status !== 'ok' || fresh.alert || fresh.offline) throw new MarketplaceImportError('RESOURCE_FEED_UNVERIFIED', MESSAGES.RESOURCE_FEED_UNVERIFIED, 503, { reason: fresh?.alert ?? (fresh?.offline ? 'offline' : fresh?.status ?? 'unverified') })
    const { resource } = await resolve({ resourceKey: source.resourceKey, version: source.version, releaseId: source.releaseId, acknowledgeStale: source.acknowledgedStale === true }, source.type, { refresh: false })
    if (resource.sha256 !== source.sha256) throw new MarketplaceImportError('RESOURCE_PACKAGE_MISMATCH', MESSAGES.RESOURCE_PACKAGE_MISMATCH, 409)
    return resource
  }

  return { list, resolve, download, recheck }
}
