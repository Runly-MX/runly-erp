// Marketplace RESOURCE catalog consumer (ERP E2). Reads and cryptographically verifies the signed
// resource feed the Developer Hub exports (studio templates, automations, website templates and
// solutions) and downloads public packages with bounded, hash-checked transport.
//
// It is deliberately NOT part of the module catalogs: separate trust category (`resource`), separate
// signing domains, separate high-water mark, separate state. It never installs, never applies a
// package, never validates package content (that is @runly/studio-interchange and the importers) and
// has no UI. Everything fails closed: on any verification failure the last good, previously verified
// snapshot is kept, and nothing expired or stale is ever offered for installation.
//   catalog.resources.url   envelope URL (https, or an explicit local file:// catalog). No default.
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { readCatalogBytes, CatalogDownloadError } from './catalog-download.js'
import { sha256Of } from './catalog-crypto.js'
import { createTrustStore, CatalogTrustError } from './catalog-trust-store.js'
import { createHighWaterStore, domainKey, sequenceDecision } from './catalog-sequence.js'
import { compareVersions } from './catalog-service.js'
import { RESOURCE_CATALOG_ID, RESOURCE_TRUST_DOMAIN, MAX_SNAPSHOT_BYTES, TYPE_MAX_BYTES, FORMAT_NAME, ResourceFeedError, resourceSnapshotDigest, validateResourceEnvelope } from './catalog-resource-contract.js'
import rootPackage from '../../../../../package.json' with { type: 'json' }

export const RESOURCE_CONFIG_KEYS = Object.freeze({ url: 'catalog.resources.url', state: 'catalog.resources.state', revokedKeyIds: 'catalog.trust.revokedKeyIds' })
// Feed section 7 (normative, not configurable): freshness is measured from the last successful verification.
export const RESOURCE_FRESHNESS = Object.freeze({ installFreshHours: 24, installMaxAgeHours: 72, maxCacheAgeDays: 30 })
// Content-format versions this Runly can read per type; a newer feed entry reads "update Runly".
export const SUPPORTED_FORMAT_VERSIONS = Object.freeze({ studio_template: 1, automation: 1, website_template: 1, solution: 1 })
const DAY = 86400000, HOUR = 3600000
const HEX64 = /^[a-f0-9]{64}$/
const PACKAGE_PATH = /^packages\/[a-f0-9]{64}$/

// Only HTTPS (or an explicit local file:// catalog) may be configured; no credentials, no fragments.
function catalogUrlProblem(value) {
  let url
  try { url = new URL(value) } catch { return 'catalog_url_invalid' }
  if (url.protocol === 'file:') return url.hostname || url.search || url.hash ? 'catalog_url_invalid' : null
  return url.protocol !== 'https:' || url.username || url.password || url.hash ? 'catalog_url_rejected' : null
}
const alertCode = (error) => (error?.code && String(error.code).startsWith('RESOURCE_') ? error.code : 'RESOURCE_FEED_INVALID')
const DECISION_CODES = Object.freeze({ rollback: 'RESOURCE_FEED_ROLLBACK', equivocation: 'RESOURCE_FEED_CHAIN_INVALID', chain_broken: 'RESOURCE_FEED_CHAIN_INVALID' })

export function createResourceCatalogService({ prisma, readBytes = readCatalogBytes, trust = {}, now = () => Date.now(), runlyVersion = rootPackage.version } = {}) {
  const highWater = createHighWaterStore({ prisma })
  const config = async (key) => (await prisma.instanceConfig.findUnique({ where: { key } }))?.value ?? null
  const setConfig = (key, value) => prisma.instanceConfig.upsert({ where: { key }, update: { value }, create: { key, value } })
  const jsonConfig = async (key, fallback) => { try { return JSON.parse((await config(key)) ?? 'null') ?? fallback } catch { return fallback } }
  async function trustStore() {
    const revoked = await jsonConfig(RESOURCE_CONFIG_KEYS.revokedKeyIds, [])
    return createTrustStore({ ...trust, managed: [], localRevokedKeyIds: Array.isArray(revoked) ? revoked.filter((id) => HEX64.test(id)) : [] })
  }

  // ---- Verification of one envelope: structure, snapshot signature, every release signature. ----
  function verifyEnvelope(envelope, store, revokedKeyIds) {
    validateResourceEnvelope(envelope)
    // A snapshot may restrict trust at once (revoke keys); it can never be verified by a key it revokes itself.
    revokedKeyIds = keysRevokedBy(envelope.signed, [...revokedKeyIds])
    try {
      const signer = store.verifyResourceSnapshot(envelope, { revokedKeyIds })
      // A cryptographically invalid release signature rejects the WHOLE snapshot; entries signed by an
      // untrusted/revoked/retired key stay listed but are marked untrusted (see describe()).
      for (const entry of envelope.signed.entries) store.classifyResourceEntry(entry, envelope.signed, { revokedKeyIds })
      return signer
    } catch (error) {
      if (error instanceof CatalogTrustError) throw new ResourceFeedError(error.code)
      throw error
    }
  }
  function keysRevokedBy(signed, previous = []) {
    const ids = new Set(previous)
    for (const key of signed.trust.keys) if (key.state === 'revoked') ids.add(key.keyId)
    for (const r of signed.revocations) if (r.type === 'key') ids.add(r.target.keyId)
    return ids
  }

  // ---- Freshness (measured from the last verification, never from the feed's own clock alone). ----
  function gate(state, { acknowledgeStale = false } = {}) {
    const t = now(), age = t - Date.parse(state.fetchedAt)
    const expired = t > Date.parse(state.validUntil)
    const freshness = age < RESOURCE_FRESHNESS.installFreshHours * HOUR ? 'fresh' : age < RESOURCE_FRESHNESS.installMaxAgeHours * HOUR ? 'stale' : 'expired'
    if (expired) return { freshness, installable: false, requiresAcknowledgement: false, reason: 'RESOURCE_FEED_EXPIRED' }
    if (freshness === 'fresh') return { freshness, installable: true, requiresAcknowledgement: false, reason: null }
    if (freshness === 'stale') return { freshness, installable: acknowledgeStale === true, requiresAcknowledgement: true, reason: acknowledgeStale === true ? null : 'RESOURCE_ACKNOWLEDGEMENT_REQUIRED' }
    return { freshness, installable: false, requiresAcknowledgement: false, reason: 'RESOURCE_FEED_STALE' }
  }

  async function sourceUrl() { return (await config(RESOURCE_CONFIG_KEYS.url)) || null }

  // Last verified copy still inside the 30-day view window; re-verified on every read (a tampered cache is not trusted).
  async function cached(url, store) {
    const state = await jsonConfig(RESOURCE_CONFIG_KEYS.state, null)
    if (!state || state.url !== url) return null
    if (now() > Date.parse(state.fetchedAt) + RESOURCE_FRESHNESS.maxCacheAgeDays * DAY) return null
    const row = await prisma.moduleCatalogCache.findUnique({ where: { url } })
    if (!row) return null
    try {
      const envelope = validateResourceEnvelope(row.payload)
      if (resourceSnapshotDigest(envelope.signed) !== state.sha256) return null
      verifyEnvelope(envelope, store, new Set(state.revokedKeyIds ?? []))
      return { envelope, state }
    } catch { return null }
  }

  // ---- Refresh: fetch → validate → verify → anti-rollback → persist. ----
  async function refresh() {
    const url = await sourceUrl()
    if (!url) return { status: 'not_configured', alert: null }
    const problem = catalogUrlProblem(url)
    if (problem) throw new ResourceFeedError('RESOURCE_FEED_URL_REJECTED', problem)
    const store = await trustStore()
    const previous = await jsonConfig(RESOURCE_CONFIG_KEYS.state, null)
    const revokedKeyIds = keysRevokedBy({ trust: { keys: [] }, revocations: [] }, previous?.url === url ? previous.revokedKeyIds : [])
    const lastGood = async (alert, offline = false) => {
      const good = await cached(url, store)
      if (!good) throw new ResourceFeedError(alert ?? 'RESOURCE_FEED_UNREACHABLE', alert ? 'El feed de recursos no superó la verificación y no hay una copia confiable previa.' : 'No se pudo conectar con el feed de recursos.')
      return summary(good, { alert, offline, cachedView: true })
    }
    let buffer
    try {
      const base = new URL(url)
      ;({ buffer } = await readBytes(url, { maxBytes: MAX_SNAPSHOT_BYTES, localRoot: base.protocol === 'file:' ? dirname(fileURLToPath(base)) : null }))
    } catch (error) {
      // Security rejections are alerts; anything else is "offline": keep the last verified copy.
      if (error instanceof CatalogDownloadError && error.code !== 'CATALOG_UNREACHABLE') return lastGood(error.code === 'CATALOG_RESPONSE_TOO_LARGE' ? 'RESOURCE_FEED_TOO_LARGE' : 'RESOURCE_FEED_TRANSPORT_REJECTED')
      return lastGood(null, true)
    }
    let envelope, signer
    try {
      envelope = JSON.parse(buffer.toString('utf8'))
      signer = verifyEnvelope(envelope, store, revokedKeyIds)
    } catch (error) { return lastGood(alertCode(error)) }
    const signed = envelope.signed
    // An authentic but expired snapshot is never accepted: it cannot advance the chain or be offered.
    if (now() > Date.parse(signed.validUntil)) return lastGood('RESOURCE_FEED_EXPIRED')
    const domain = domainKey(RESOURCE_TRUST_DOMAIN, RESOURCE_CATALOG_ID)
    const sha256 = resourceSnapshotDigest(signed)
    const decision = sequenceDecision(await highWater.get(domain), { sequence: signed.sequence, sha256, previous: signed.previous, generatedAt: signed.generatedAt })
    if (decision) return lastGood(DECISION_CODES[decision] ?? 'RESOURCE_FEED_ROLLBACK')
    const all = keysRevokedBy(signed, [...revokedKeyIds])
    const state = { url, domain, sequence: signed.sequence, sha256, generatedAt: signed.generatedAt, validUntil: signed.validUntil, fetchedAt: new Date(now()).toISOString(), signer: signer.category, keyId: signer.keyId, revokedKeyIds: [...all] }
    await prisma.moduleCatalogCache.upsert({ where: { url }, update: { payload: envelope, etag: sha256, fetchedAt: new Date(now()) }, create: { url, payload: envelope, etag: sha256 } })
    await highWater.accept(domain, state)
    await setConfig(RESOURCE_CONFIG_KEYS.state, JSON.stringify(state))
    return summary({ envelope, state }, { alert: null, offline: false, cachedView: false })
  }

  function summary({ envelope, state }, { alert, offline, cachedView }, options) {
    return { status: cachedView ? 'cached' : 'ok', alert, offline, sequence: state.sequence, generatedAt: state.generatedAt, validUntil: state.validUntil, fetchedAt: state.fetchedAt, entries: envelope.signed.entries.length, ...gate(state, options) }
  }

  // ---- Reading ----
  function revocationOf(entry, signed, revokedKeyIds) {
    const release = signed.revocations.find((r) => r.type === 'release' && r.target.resourceKey === entry.resourceKey && r.target.version === entry.version && r.target.sha256 === entry.sha256)
    if (release) return { type: 'release', reason: release.reason, revokedAt: release.revokedAt, replacement: release.replacement }
    const publisher = signed.publishers.find((p) => p.handle === entry.publisher)
    const byPublisher = signed.revocations.find((r) => r.type === 'publisher' && r.target.publisher === entry.publisher)
    if (publisher?.state === 'revoked' || byPublisher) return { type: 'publisher', reason: publisher?.reason ?? byPublisher.reason, revokedAt: publisher?.revokedAt ?? byPublisher?.revokedAt ?? null, replacement: null }
    const byKey = signed.revocations.find((r) => r.type === 'key' && r.target.keyId === entry.keyId)
    if (byKey || revokedKeyIds.has(entry.keyId)) return { type: 'key', reason: byKey?.reason ?? 'La clave de firma fue revocada.', revokedAt: byKey?.revokedAt ?? null, replacement: null }
    return null
  }

  function describe(entry, { envelope, state }, store, options) {
    const signed = envelope.signed, revokedKeyIds = new Set(state.revokedKeyIds ?? [])
    const verdict = store.classifyResourceEntry(entry, signed, { revokedKeyIds })
    const revocation = revocationOf(entry, signed, revokedKeyIds)
    const publisher = signed.publishers.find((p) => p.handle === entry.publisher)
    const availability = revocation ? 'revoked' : entry.status === 'withdrawn' ? 'withdrawn' : 'available'
    const catalogGate = gate(state, options)
    const blockedBy = []
    if (!verdict.trusted) blockedBy.push('RESOURCE_KEY_UNTRUSTED')
    if (availability !== 'available') blockedBy.push(availability === 'revoked' ? 'RESOURCE_REVOKED' : 'RESOURCE_WITHDRAWN')
    if (!catalogGate.installable && catalogGate.reason) blockedBy.push(catalogGate.reason)
    const { runly, format } = entry.compatibility
    if (format.version > SUPPORTED_FORMAT_VERSIONS[entry.type]) blockedBy.push('RESOURCE_FORMAT_UNSUPPORTED')
    if (compareVersions(runlyVersion, runly.min) < 0 || (runly.max && compareVersions(runlyVersion, runly.max) > 0)) blockedBy.push('RESOURCE_RUNLY_VERSION')
    return {
      resourceKey: entry.resourceKey, type: entry.type, version: entry.version, releaseId: entry.releaseId, sha256: entry.sha256, size: entry.size,
      title: entry.title, description: entry.description, license: entry.license, locale: entry.locale, listed: entry.listed, status: entry.status, publishedAt: entry.publishedAt,
      compatibility: entry.compatibility, requirements: entry.requirements, provenance: entry.provenance,
      publisher: publisher ? { handle: publisher.handle, displayName: publisher.displayName, verified: publisher.verified && publisher.state === 'active', state: publisher.state } : null,
      trust: verdict.trusted ? RESOURCE_TRUST_DOMAIN : 'untrusted', trustReason: verdict.trusted ? null : verdict.reason,
      revocation, availability,
      // `eligible`: could be downloaded for installation right now. Never true for anything stale-unacknowledged, expired, revoked or untrusted.
      eligible: blockedBy.length === 0, blockedBy,
    }
  }

  async function snapshot(options) {
    const url = await sourceUrl()
    if (!url) throw new ResourceFeedError('RESOURCE_FEED_NOT_CONFIGURED')
    const store = await trustStore()
    const good = await cached(url, store)
    if (!good) throw new ResourceFeedError('RESOURCE_FEED_UNAVAILABLE', 'No hay una copia verificada del feed de recursos.')
    return { good, store, options }
  }

  async function status(options) {
    const url = await sourceUrl()
    if (!url) return { configured: false }
    const store = await trustStore()
    const good = await cached(url, store)
    return { configured: true, url, verified: Boolean(good), ...(good ? summary(good, { alert: null, offline: false, cachedView: true }, options) : { status: 'empty' }) }
  }

  async function list({ type = null, query = '', includeUnavailable = false, acknowledgeStale = false } = {}) {
    if (type !== null && !(type in TYPE_MAX_BYTES)) throw new ResourceFeedError('RESOURCE_TYPE_INVALID')
    const { good, store } = await snapshot({ acknowledgeStale })
    const needle = String(query).trim().toLowerCase()
    return good.envelope.signed.entries
      .filter((e) => e.listed && (!type || e.type === type) && (!needle || `${e.resourceKey} ${e.title} ${e.description}`.toLowerCase().includes(needle)))
      .map((e) => describe(e, good, store, { acknowledgeStale }))
      .filter((d) => includeUnavailable || d.availability === 'available')
      .sort((a, b) => (a.resourceKey < b.resourceKey ? -1 : a.resourceKey > b.resourceKey ? 1 : compareVersions(b.version, a.version)))
  }

  async function find(resourceKey, version, options) {
    const { good, store } = await snapshot(options)
    const entries = good.envelope.signed.entries.filter((e) => e.resourceKey === resourceKey && (!version || e.version === version))
    if (!entries.length) throw Object.assign(new ResourceFeedError('RESOURCE_NOT_FOUND'), { status: 404 })
    const entry = entries.sort((a, b) => compareVersions(b.version, a.version))[0]
    return { entry, good, store, description: describe(entry, good, store, options) }
  }
  async function get(resourceKey, version = null, { acknowledgeStale = false } = {}) {
    return (await find(resourceKey, version, { acknowledgeStale })).description
  }

  // Read-only inspection for future consumers (E3): the verification verdict, never a plan or an action.
  async function inspect(resourceKey, version = null, { acknowledgeStale = false } = {}) {
    const { description, good } = await find(resourceKey, version, { acknowledgeStale })
    return { resource: description, catalog: { sequence: good.state.sequence, ...gate(good.state, { acknowledgeStale }) }, verification: { snapshotSignature: 'verified', releaseSignature: description.trust === RESOURCE_TRUST_DOMAIN ? 'verified' : 'untrusted', formatName: FORMAT_NAME[description.type], maxBytes: TYPE_MAX_BYTES[description.type] } }
  }

  // ---- Download of a PUBLIC package: relative URL of the feed only, bounded by type, length and SHA-256 checked. ----
  async function downloadPackage(resourceKey, version, { acknowledgeStale = false } = {}) {
    const { entry, good, description } = await find(resourceKey, version, { acknowledgeStale })
    if (!description.eligible) throw Object.assign(new ResourceFeedError(description.blockedBy[0], `El recurso no se puede descargar: ${description.blockedBy.join(', ')}.`), { blockedBy: description.blockedBy, status: 409 })
    const feed = new URL(good.state.url)
    if (!PACKAGE_PATH.test(entry.packageUrl) || entry.packageUrl !== `packages/${entry.sha256}`) throw new ResourceFeedError('RESOURCE_PACKAGE_URL_REJECTED')
    // Resolved against the feed that was verified; it must stay on the same origin and directory.
    const target = new URL(entry.packageUrl, feed)
    const directory = feed.pathname.slice(0, feed.pathname.lastIndexOf('/') + 1)
    if (target.protocol !== feed.protocol || target.host !== feed.host || target.username || target.password || target.search || target.hash || target.pathname !== `${directory}${entry.packageUrl}`) throw new ResourceFeedError('RESOURCE_PACKAGE_URL_REJECTED')
    let buffer
    try {
      ;({ buffer } = await readBytes(target.href, { maxBytes: TYPE_MAX_BYTES[entry.type], localRoot: feed.protocol === 'file:' ? dirname(fileURLToPath(feed)) : null, httpsOnly: feed.protocol === 'https:' }))
    } catch (error) {
      if (error instanceof CatalogDownloadError && error.code === 'CATALOG_RESPONSE_TOO_LARGE') throw new ResourceFeedError('RESOURCE_PACKAGE_MISMATCH', 'El paquete supera el tamaño máximo de su tipo.')
      throw new ResourceFeedError('RESOURCE_PACKAGE_UNAVAILABLE', 'No se pudo descargar el paquete.')
    }
    if (!Buffer.isBuffer(buffer) || buffer.length !== entry.size || sha256Of(buffer) !== entry.sha256) throw new ResourceFeedError('RESOURCE_PACKAGE_MISMATCH', 'El paquete no coincide con el tamaño o la huella del feed.')
    return { bytes: buffer, sha256: entry.sha256, size: entry.size, resource: description }
  }

  return { refresh, status, list, get, inspect, downloadPackage }
}
