// Module trust and quarantine (F1B.1).
//
// Every import() of an installed custom module's code (manifest, models,
// views, api, public api, components, connections) goes through
// assertModuleCodeTrusted(). It allows the import only when the exact bytes
// on disk were trusted: published through a code authority
// (module-code-authority.js) or approved by the platform owner after review.
// Anything else - modules installed before F1A/F1B, files changed on disk,
// unknown provenance - is quarantined: its code never runs; its data, tables
// and rows are untouched and it can be approved or republished later.
//
// Record: InstanceConfig "module.trust.<key>" =
//   { v: 1, state: 'trusted'|'quarantined', trustedHashes: [...], authority,
//     actorId, at, reason }
// Only this file writes those keys; no route writes InstanceConfig with a
// client-chosen key (verified in F1B.0).
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

export const MODULE_TRUST_PREFIX = 'module.trust.'
// Only build output is excluded. node_modules stays hashed: Node resolves a
// module's bare imports from its own node_modules first (Stage 2 review).
const SKIPPED_DIRS = new Set(['.bundle', '.git'])
const KEEP_HASHES = 10 // rollback/backup restore of a recently trusted revision stays allowed
const RECORD_TTL_MS = 30_000

export class ModuleQuarantinedError extends Error {
  constructor(key, reason) {
    super(`El módulo ${key} está en cuarentena: su código no se ejecuta hasta que el propietario de la plataforma lo apruebe o se vuelva a publicar desde una fuente autorizada.`)
    this.name = 'ModuleQuarantinedError'
    this.code = 'MODULE_QUARANTINED'
    this.statusCode = 423
    this.moduleKey = key
    this.reason = reason
  }
}

// Same path+content scheme as staging's package hash, skipping build output.
export async function hashModuleDirectory(directory) {
  const files = []
  async function walk(current) {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name)
      // A symlink is neither hashed nor followable safely: an import would follow it. Fail closed.
      if (entry.isSymbolicLink()) throw Object.assign(new Error('SYMLINK_IN_PACKAGE'), { code: 'SYMLINK_IN_PACKAGE' })
      if (entry.isDirectory()) { if (!SKIPPED_DIRS.has(entry.name)) await walk(absolute) } else if (entry.isFile()) files.push(absolute)
      else throw Object.assign(new Error('UNSUPPORTED_FILE_IN_PACKAGE'), { code: 'UNSUPPORTED_FILE_IN_PACKAGE' })
    }
  }
  await walk(directory)
  const hash = createHash('sha256')
  for (const file of files.sort()) {
    hash.update(`/${path.relative(directory, file).split(path.sep).join('/')}`)
    hash.update(await fs.readFile(file))
  }
  return hash.digest('hex')
}

let config = null
const records = new Map() // key -> { value, at }
const hashes = new Map() // dir -> { rev, hash }

// Called once at API boot (index.js) before any module is discovered or loaded.
// Unconfigured (unit tests that build fixtures outside the modules dir) the
// gate is inactive; module-trust-contract.test.js pins the boot call.
export function configureModuleTrust({ prisma, modulesDir, now = () => Date.now() }) {
  config = { prisma, modulesDir: modulesDir ? path.resolve(modulesDir) : null, now }
  records.clear()
  hashes.clear()
}

export function isModuleTrustConfigured() {
  return Boolean(config?.prisma && config?.modulesDir)
}

function parseRecord(value) {
  try {
    const record = JSON.parse(value ?? 'null')
    return record && record.v === 1 && Array.isArray(record.trustedHashes) ? record : null
  } catch { return null }
}

export async function readModuleTrust(key, { fresh = false } = {}) {
  if (!config?.prisma?.instanceConfig) return null
  const cached = records.get(key)
  if (!fresh && cached && config.now() - cached.at < RECORD_TTL_MS) return cached.value
  const row = await config.prisma.instanceConfig.findUnique({ where: { key: MODULE_TRUST_PREFIX + key }, select: { value: true } })
  const value = parseRecord(row?.value)
  records.set(key, { value, at: config.now() })
  return value
}

async function writeRecord(key, record) {
  const value = JSON.stringify(record)
  await config.prisma.instanceConfig.upsert({ where: { key: MODULE_TRUST_PREFIX + key }, update: { value }, create: { key: MODULE_TRUST_PREFIX + key, value } })
  records.set(key, { value: record, at: config.now() })
}

// Cheap change detector over exactly the hashed files (count, sizes, mtimes):
// the full hash is recomputed whenever any of them changes.
async function revisionOf(directory) {
  let count = 0, bytes = 0, latest = 0
  async function walk(current) {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) { count = -1; return }
      const absolute = path.join(current, entry.name)
      if (entry.isDirectory()) { if (!SKIPPED_DIRS.has(entry.name)) await walk(absolute) } else {
        const stat = await fs.stat(absolute)
        count++; bytes += stat.size; latest = Math.max(latest, stat.mtimeMs)
      }
      if (count < 0) return
    }
  }
  await walk(directory)
  return `${count}:${bytes}:${Math.floor(latest)}`
}

export async function currentModuleHash(moduleDir) {
  const dir = path.resolve(moduleDir)
  const rev = await revisionOf(dir)
  const cached = hashes.get(dir)
  if (cached && cached.rev === rev) return cached.hash
  const hash = await hashModuleDirectory(dir)
  hashes.set(dir, { rev, hash })
  return hash
}

// Installed custom module directory that `filePath` belongs to, or null for
// anything else (official code, staging/backup/preview copies, fixtures).
export function installedModuleOf(filePath) {
  if (!config?.modulesDir) return null
  const relative = path.relative(config.modulesDir, path.resolve(filePath))
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null
  const [key] = relative.split(path.sep)
  if (!key || key.startsWith('.')) return null
  return { key, dir: path.join(config.modulesDir, key) }
}

export async function moduleTrustStatus(key, moduleDir) {
  const record = await readModuleTrust(key)
  let hash = null, hashError = null
  try { hash = await currentModuleHash(moduleDir) } catch (error) { hashError = error?.code ?? 'PACKAGE_UNREADABLE' }
  if (hashError) return { state: 'quarantined', reason: hashError, hash: null, record }
  if (!record) return { state: 'quarantined', reason: 'NO_TRUST_RECORD', hash, record: null }
  if (record.state !== 'trusted') return { state: 'quarantined', reason: record.reason ?? 'QUARANTINED_BY_OWNER', hash, record }
  if (!hash || !record.trustedHashes.includes(hash)) return { state: 'quarantined', reason: 'CODE_CHANGED_SINCE_TRUSTED', hash, record }
  return { state: 'trusted', reason: null, hash, record }
}

export async function assertModuleCodeTrusted(filePath) {
  if (!isModuleTrustConfigured()) return
  const installed = installedModuleOf(filePath)
  if (!installed) return
  const status = await moduleTrustStatus(installed.key, installed.dir)
  if (status.state !== 'trusted') throw new ModuleQuarantinedError(installed.key, status.reason)
}

// For code served outside import() (browser bundles): true when an installed
// custom module directory exists and its bytes are not trusted.
export async function isQuarantinedCustomModule(key) {
  if (!isModuleTrustConfigured() || !/^(custom|community)\.[\w-]+$/.test(String(key))) return false
  const dir = path.join(config.modulesDir, key)
  if (!(await fs.stat(dir).then((s) => s.isDirectory(), () => false))) return false
  return (await moduleTrustStatus(key, dir)).state !== 'trusted'
}

export function installedModuleDir(key) {
  return config?.modulesDir ? path.join(config.modulesDir, key) : null
}

// After a package passed a code authority and was swapped into place.
export async function trustModulePackage({ key, moduleDir, authority, actorId = null }) {
  if (!config?.prisma?.instanceConfig) return null
  const hash = await currentModuleHash(moduleDir)
  const previous = await readModuleTrust(key, { fresh: true })
  const kept = (previous?.state === 'trusted' ? previous.trustedHashes : []).filter((item) => item !== hash)
  const record = { v: 1, state: 'trusted', trustedHashes: [hash, ...kept].slice(0, KEEP_HASHES), authority, actorId, at: new Date(config.now()).toISOString(), reason: null }
  await writeRecord(key, record)
  return record
}

// Platform owner decision after reviewing the code on disk (route-gated).
export async function decideModuleTrust({ key, decision, actorId, reason = null }) {
  if (!config?.prisma?.instanceConfig || !config.modulesDir) throw new Error('MODULE_TRUST_NOT_CONFIGURED')
  if (decision === 'approve') return trustModulePackage({ key, moduleDir: path.join(config.modulesDir, key), authority: 'platform-owner-review', actorId })
  if (decision !== 'quarantine') throw new Error('MODULE_TRUST_DECISION_INVALID')
  const previous = await readModuleTrust(key, { fresh: true })
  const record = { v: 1, state: 'quarantined', trustedHashes: previous?.trustedHashes ?? [], authority: previous?.authority ?? null, actorId, at: new Date(config.now()).toISOString(), reason: reason ?? 'QUARANTINED_BY_OWNER' }
  await writeRecord(key, record)
  return record
}
