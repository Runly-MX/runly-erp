// STAGING-ONLY trust for the Marketplace resource feed. Production trust is ONLY the keys pinned in
// catalog-resource-public-key.js (unchanged). An operator of an explicitly non-production environment may mount
// a read-only file with resource PUBLIC keys (e.g. the staging Hub's test key) and opt in:
//   NODE_ENV=staging (or development/test), RUNLY_RESOURCE_TRUST_MODE=staging,
//   RUNLY_RESOURCE_TRUSTED_KEYS_FILE=/run/secrets/runly-resource-trust.json   (absolute, outside the repository)
// File: { "format": "runly.resource-trust.v1", "role": "resource", "keys": [{ "keyId": "<sha256 of SPKI>", "publicKey": "<base64 SPKI Ed25519>" }] }
// Keys announced by a feed are never trusted by themselves; only these files (and the release pins) are.
import { createPublicKey } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { keyIdOf } from './catalog-v2-contract.js'
import { RESOURCE_CATALOG_PUBLIC_KEYS } from './catalog-resource-public-key.js'

export const STAGING_TRUST_FORMAT = 'runly.resource-trust.v1'
const NON_PRODUCTION = new Set(['staging', 'development', 'test'])
const REPOSITORY = resolve(fileURLToPath(new URL('../../../../../', import.meta.url)))
const HEX64 = /^[a-f0-9]{64}$/
const MAX_BYTES = 16 * 1024, MAX_KEYS = 4

export class StagingTrustError extends Error {
  constructor(code) { super(code); this.name = 'StagingTrustError'; this.code = code }
}
const fail = (code) => { throw new StagingTrustError(code) }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join() === [...keys].sort().join()

// [] when not configured (behaviour identical to before). Throws StagingTrustError on any misuse.
export function loadStagingResourceKeys(env = process.env, { read = readFileSync, stat = statSync, platform = process.platform } = {}) {
  const file = env.RUNLY_RESOURCE_TRUSTED_KEYS_FILE
  if (!file) return []
  if (env.NODE_ENV === 'production' || !NON_PRODUCTION.has(env.NODE_ENV)) fail('RESOURCE_STAGING_TRUST_REQUIRES_NON_PRODUCTION')
  if (env.RUNLY_RESOURCE_TRUST_MODE !== 'staging') fail('RESOURCE_STAGING_TRUST_NOT_ENABLED')
  if (!isAbsolute(file)) fail('RESOURCE_STAGING_TRUST_PATH_INVALID')
  const inside = relative(REPOSITORY, resolve(file))
  if (!inside.startsWith('..') && !isAbsolute(inside)) fail('RESOURCE_STAGING_TRUST_FILE_IN_REPOSITORY')
  const info = stat(file)
  if (!info.isFile() || info.size > MAX_BYTES) fail('RESOURCE_STAGING_TRUST_FILE_INVALID')
  // A mounted secret must not be writable by anyone but its owner (POSIX; Windows has no mode bits).
  if (platform !== 'win32' && (info.mode & 0o022)) fail('RESOURCE_STAGING_TRUST_FILE_WRITABLE')
  let document
  try { document = JSON.parse(read(file, 'utf8')) } catch { fail('RESOURCE_STAGING_TRUST_FILE_INVALID') }
  if (!exact(document, ['format', 'role', 'keys']) || document.format !== STAGING_TRUST_FORMAT || document.role !== 'resource') fail('RESOURCE_STAGING_TRUST_FORMAT')
  if (!Array.isArray(document.keys) || !document.keys.length || document.keys.length > MAX_KEYS) fail('RESOURCE_STAGING_TRUST_FORMAT')
  const pinned = new Set(RESOURCE_CATALOG_PUBLIC_KEYS.map((pin) => keyIdOf(typeof pin === 'string' ? pin : pin.publicKey)))
  const seen = new Set()
  return document.keys.map((key) => {
    if (!exact(key, ['keyId', 'publicKey']) || !HEX64.test(key.keyId) || typeof key.publicKey !== 'string') fail('RESOURCE_STAGING_TRUST_KEY_INVALID')
    try { if (createPublicKey({ key: Buffer.from(key.publicKey, 'base64'), format: 'der', type: 'spki' }).asymmetricKeyType !== 'ed25519') throw new Error() } catch { fail('RESOURCE_STAGING_TRUST_KEY_INVALID') }
    if (keyIdOf(key.publicKey) !== key.keyId) fail('RESOURCE_STAGING_TRUST_KEY_ID_MISMATCH')
    // A staging key is never a production identity, and is listed once.
    if (pinned.has(key.keyId) || seen.has(key.keyId)) fail('RESOURCE_STAGING_TRUST_KEY_DUPLICATE')
    seen.add(key.keyId)
    return key.publicKey
  })
}

// Trust option for createResourceCatalogService: {} without staging keys (release pins only, exactly as before).
// A misconfiguration never widens trust: it is reported without contents and only the release pins remain.
export function resourceTrustFromEnv(env = process.env, { warn = console.error, ...options } = {}) {
  try {
    const staging = loadStagingResourceKeys(env, options)
    if (!staging.length) return {}
    warn('[resource-catalog] STAGING resource trust active:', staging.length, 'key(s) from RUNLY_RESOURCE_TRUSTED_KEYS_FILE (never in production)')
    return { resource: [...RESOURCE_CATALOG_PUBLIC_KEYS, ...staging] }
  } catch (error) {
    warn('[resource-catalog] staging resource trust refused:', error instanceof StagingTrustError ? error.code : 'unreadable')
    return {}
  }
}
