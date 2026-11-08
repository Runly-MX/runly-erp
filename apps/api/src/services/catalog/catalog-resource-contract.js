// Marketplace RESOURCE feed consumer contract (Hub RESOURCE_FEED_CONTRACT_V1, corrected by ERP E1a).
// Parallel to catalog v1/v2/official: it shares nothing with them except the canonical JSON
// rules, and never relaxes them. Byte formats mirror the Developer Hub producer:
//   release signature   Ed25519 over RELEASE_DOMAIN || canonicalBytes(releaseStatement(entry))
//   snapshot signature  Ed25519 over SNAPSHOT_DOMAIN + sequence + ":" + sha256(canonicalBytes(signed))
// Every object declares its exact key set: an unknown, missing or duplicated key invalidates the
// whole snapshot. Signature trust is decided by the trust store (pinned `resource` keys only).
import { SEMVER } from './catalog-schema.js'
import { canonicalBytes, sha256, keyIdOf, PUBLISHER_HANDLE, RELEASE_DOMAIN as V2_RELEASE_DOMAIN, SNAPSHOT_DOMAIN as V2_SNAPSHOT_DOMAIN } from './catalog-v2-contract.js'
import { OFFICIAL_SNAPSHOT_DOMAIN } from './catalog-official-contract.js'

export const RESOURCE_CATALOG_ID = 'runly-resources-v1'
export const RESOURCE_TRUST_DOMAIN = 'resource'
export const RESOURCE_RELEASE_DOMAIN = 'runly.catalog.resources.v1.release\n'
export const RESOURCE_SNAPSHOT_DOMAIN = 'runly.catalog.resources.v1.snapshot\n'
export const RESOURCE_TYPES = Object.freeze(['studio_template', 'automation', 'website_template', 'solution'])
export const TYPE_NAMESPACE = Object.freeze({ studio_template: 'studio', automation: 'automation', website_template: 'website', solution: 'solution' })
export const FORMAT_NAME = TYPE_NAMESPACE
// Feed section 9 (A-1): maximum package size per type, enforced by the schema.
export const TYPE_MAX_BYTES = Object.freeze({ studio_template: 26_214_400, automation: 204_800, website_template: 26_214_400, solution: 262_144 })
export const MAX_SNAPSHOT_VALIDITY_MS = 7 * 24 * 60 * 60 * 1000
export const MAX_SNAPSHOT_BYTES = 4 * 1024 * 1024

// A-2: five prefixed declarations (official snapshot, v2 release, v2 snapshot, resources release,
// resources snapshot) must be distinct and prefix-free, and the unprefixed v1 statement
// `key@version:sha256` must not start with any of them. Checked at load and exported for tests.
export const SIGNING_DOMAINS = Object.freeze([OFFICIAL_SNAPSHOT_DOMAIN, V2_RELEASE_DOMAIN, V2_SNAPSHOT_DOMAIN, RESOURCE_RELEASE_DOMAIN, RESOURCE_SNAPSHOT_DOMAIN])
export function domainProblem(domains = SIGNING_DOMAINS, v1Sample = 'runly.core@1.0.0:' + 'a'.repeat(64)) {
  if (new Set(domains).size !== domains.length) return 'duplicate'
  for (const a of domains) for (const b of domains) if (a !== b && b.startsWith(a)) return 'prefix'
  if (domains.some((domain) => v1Sample.startsWith(domain))) return 'v1_overlap'
  return null
}
if (domainProblem()) throw new Error('CATALOG_DOMAIN_COLLISION')

export const resourceReleaseStatement = (e) => ({
  publisher: e.publisher, resourceKey: e.resourceKey, type: e.type, version: e.version, releaseId: e.releaseId, sha256: e.sha256, size: e.size, access: e.access,
  license: e.license, locale: e.locale, compatibility: e.compatibility, requirements: e.requirements, provenance: e.provenance,
})
export const resourceReleaseBytes = (entry) => Buffer.concat([Buffer.from(RESOURCE_RELEASE_DOMAIN), canonicalBytes(resourceReleaseStatement(entry))])
// A-12: the snapshot digest is over the canonical bytes WITHOUT a domain; the signed string carries the domain.
export const resourceSnapshotDigest = (signed) => sha256(canonicalBytes(signed))
export const resourceSnapshotBytes = (signed) => Buffer.from(`${RESOURCE_SNAPSHOT_DOMAIN}${signed.sequence}:${resourceSnapshotDigest(signed)}`, 'utf8')
// Digest of a release declaration, WITH its domain (what the producer's vectors publish).
export const resourceReleaseDigest = (entry) => sha256(resourceReleaseBytes(entry))

export class ResourceFeedError extends Error {
  constructor(code, message = code) { super(message); this.code = code; this.status = 422 }
}
const reject = (code = 'RESOURCE_FEED_INVALID') => { throw new ResourceFeedError(code) }

const HEX64 = /^[a-f0-9]{64}$/
const SIGNATURE = /^[A-Za-z0-9+/]{86}==$/
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const SLUG = /^[a-z][a-z0-9-]{1,46}[a-z0-9]$/
const LICENSE = /^[A-Za-z0-9.+:-]{1,128}$/
const KEY_STATES = ['active', 'retired', 'revoked']
// eslint-disable-next-line no-control-regex -- Reject unsafe ASCII controls in feed text.
const text = (value, max, min = 0) => typeof value === 'string' && value.length >= min && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)
const iso = (value) => text(value, 40, 20) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
const uniqueList = (value, max, itemMax) => Array.isArray(value) && value.length <= max && value.every((item) => text(item, itemMax, 1)) && new Set(value).size === value.length
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max

export function validResourceKey(resourceKey, type) {
  if (typeof resourceKey !== 'string') return false
  const [namespace, slug, ...rest] = resourceKey.split('.')
  // `custom.*` (modules) is not a namespace here, and the namespace must match the declared type.
  return rest.length === 0 && TYPE_NAMESPACE[type] === namespace && SLUG.test(slug ?? '') && !slug.includes('--')
}

const ENTRY_KEYS = ['resourceKey', 'type', 'version', 'releaseId', 'sha256', 'size', 'access', 'packageUrl', 'publisher', 'listed', 'status', 'publishedAt', 'title', 'description', 'license', 'locale', 'compatibility', 'requirements', 'provenance', 'signature', 'keyId']
const SNAPSHOT_KEYS = ['schemaVersion', 'catalog', 'sequence', 'generatedAt', 'validUntil', 'previous', 'trust', 'publishers', 'entries', 'revocations']

function validateEntry(entry, publishers) {
  if (!exact(entry, ENTRY_KEYS) || !RESOURCE_TYPES.includes(entry.type) || !validResourceKey(entry.resourceKey, entry.type)) reject()
  if (!text(entry.version, 128, 1) || !SEMVER.test(entry.version) || !UUID_V4.test(entry.releaseId) || !HEX64.test(entry.sha256)) reject()
  // v1 admits only public releases: private metadata never travels in an anonymous feed (A-4).
  if (!integer(entry.size, 1, TYPE_MAX_BYTES[entry.type]) || entry.access !== 'public' || entry.packageUrl !== `packages/${entry.sha256}`) reject()
  if (!publishers.has(entry.publisher) || typeof entry.listed !== 'boolean' || !['published', 'withdrawn'].includes(entry.status) || !iso(entry.publishedAt)) reject()
  if (!text(entry.title, 160, 1) || !text(entry.description, 4000) || typeof entry.license !== 'string' || !LICENSE.test(entry.license) || !['es', 'en'].includes(entry.locale)) reject()
  const c = entry.compatibility
  if (!exact(c, ['runly', 'format']) || !exact(c.runly, ['min', 'max']) || !exact(c.format, ['name', 'version']) || !SEMVER.test(c.runly.min) || (c.runly.max !== null && !SEMVER.test(c.runly.max))) reject()
  if (c.format.name !== FORMAT_NAME[entry.type] || !integer(c.format.version, 1, 1000)) reject()
  const r = entry.requirements
  if (!exact(r, ['modules', 'fonts', 'permissions', 'services', 'builder']) || !uniqueList(r.modules, 50, 160) || !uniqueList(r.fonts, 50, 160) || !uniqueList(r.permissions, 50, 160) || !uniqueList(r.services, 100, 160)) reject()
  if (r.builder !== null && !(typeof r.builder === 'string' && SEMVER.test(r.builder))) reject()
  if (!exact(entry.provenance, ['evidenceSha256', 'validatorId']) || !HEX64.test(entry.provenance.evidenceSha256) || !HEX64.test(entry.provenance.validatorId)) reject()
  if (!SIGNATURE.test(entry.signature) || Buffer.from(entry.signature, 'base64').length !== 64 || !HEX64.test(entry.keyId)) reject()
}

export function validateResourceSnapshot(signed) {
  if (!exact(signed, SNAPSHOT_KEYS)) reject()
  if (signed.schemaVersion !== 1) reject('RESOURCE_FEED_SCHEMA_UNSUPPORTED')
  if (signed.catalog !== RESOURCE_CATALOG_ID || !integer(signed.sequence, 1, Number.MAX_SAFE_INTEGER) || !iso(signed.generatedAt) || !iso(signed.validUntil)) reject()
  const validity = Date.parse(signed.validUntil) - Date.parse(signed.generatedAt)
  if (validity <= 0 || validity > MAX_SNAPSHOT_VALIDITY_MS) reject()
  if (signed.previous === null ? signed.sequence !== 1 : !exact(signed.previous, ['sequence', 'sha256']) || signed.previous.sequence !== signed.sequence - 1 || !HEX64.test(signed.previous.sha256)) reject('RESOURCE_FEED_CHAIN_INVALID')
  if (!exact(signed.trust, ['keys']) || !Array.isArray(signed.trust.keys) || signed.trust.keys.length < 1 || signed.trust.keys.length > 20) reject()
  for (const key of signed.trust.keys) {
    if (!exact(key, ['keyId', 'publicKey', 'role', 'state', 'since', 'until', 'reason']) || key.role !== RESOURCE_TRUST_DOMAIN || !KEY_STATES.includes(key.state) || !HEX64.test(key.keyId) || typeof key.publicKey !== 'string') reject()
    try { if (keyIdOf(key.publicKey) !== key.keyId) reject() } catch { reject() }
    if (!iso(key.since) || (key.until !== null && !iso(key.until)) || (key.reason !== null && !text(key.reason, 400, 1))) reject()
  }
  if (!Array.isArray(signed.publishers) || signed.publishers.length > 1000) reject()
  const publishers = new Set()
  for (const p of signed.publishers) {
    if (!exact(p, ['handle', 'displayName', 'verified', 'state', 'reason', 'revokedAt']) || !PUBLISHER_HANDLE.test(p.handle) || !text(p.displayName, 80, 2) || typeof p.verified !== 'boolean' || !['active', 'revoked'].includes(p.state) || publishers.has(p.handle)) reject()
    if (p.state === 'revoked' ? !text(p.reason, 400, 1) || !iso(p.revokedAt) : p.reason !== null || p.revokedAt !== null) reject()
    publishers.add(p.handle)
  }
  if (!Array.isArray(signed.entries) || signed.entries.length > 2000) reject()
  const identities = new Set(), releases = new Set(), sizes = new Map()
  for (const entry of signed.entries) {
    validateEntry(entry, publishers)
    const identity = `${entry.resourceKey}@${entry.version}`
    if (identities.has(identity) || releases.has(entry.releaseId)) reject()
    identities.add(identity); releases.add(entry.releaseId)
    // A-6: one content hash always means one size (packages are content addressed).
    if (sizes.has(entry.sha256) && sizes.get(entry.sha256) !== entry.size) reject()
    sizes.set(entry.sha256, entry.size)
  }
  if (!Array.isArray(signed.revocations) || signed.revocations.length > 2000) reject()
  for (const r of signed.revocations) {
    if (!exact(r, ['type', 'target', 'reason', 'revokedAt', 'sequence', 'replacement']) || !['release', 'publisher', 'key'].includes(r.type) || !text(r.reason, 400, 1) || !iso(r.revokedAt) || !integer(r.sequence, 1, signed.sequence)) reject()
    if (r.type === 'release' ? !exact(r.target, ['resourceKey', 'version', 'sha256']) || typeof r.target.resourceKey !== 'string' || !RESOURCE_TYPES.some((t) => validResourceKey(r.target.resourceKey, t)) || !SEMVER.test(r.target.version) || !HEX64.test(r.target.sha256)
      : r.type === 'publisher' ? !exact(r.target, ['publisher']) || !PUBLISHER_HANDLE.test(r.target.publisher)
        : !exact(r.target, ['keyId']) || !HEX64.test(r.target.keyId)) reject()
    if (r.replacement !== null && (!exact(r.replacement, ['resourceKey', 'version']) || !SEMVER.test(r.replacement.version) || !RESOURCE_TYPES.some((t) => validResourceKey(r.replacement.resourceKey, t)))) reject()
  }
  if (canonicalBytes(signed).length > MAX_SNAPSHOT_BYTES) reject('RESOURCE_FEED_TOO_LARGE')
  return signed
}

export function validateResourceEnvelope(envelope) {
  if (!exact(envelope, ['signed', 'signatures']) || !Array.isArray(envelope.signatures) || envelope.signatures.length < 1 || envelope.signatures.length > 4) reject()
  for (const s of envelope.signatures) if (!exact(s, ['keyId', 'signature']) || !HEX64.test(s.keyId) || !SIGNATURE.test(s.signature)) reject()
  validateResourceSnapshot(envelope.signed)
  return envelope
}
