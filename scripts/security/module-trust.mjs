#!/usr/bin/env node
// Installed custom module inventory and trust decisions (F1B.1).
//
//   node scripts/security/module-trust.mjs inventory [--json]
//   node scripts/security/module-trust.mjs approve <key> --reviewed
//   node scripts/security/module-trust.mjs quarantine <key> [--reason "..."]
//
// Reads DIRECT_URL (or DATABASE_URL) and RUNLY_MODULES_DIR from the
// environment; prints no secrets and no record data. `inventory` is read-only
// and never imports module code: it reads files on disk and the manifest
// already stored in runly_module. `approve` trusts the exact bytes on disk now
// (after a human reviewed them) and is the recovery path for an instance
// without a platform owner; it requires server access, which is already full
// authority over the instance. Nothing here deletes data or uninstalls.
import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { hashModuleDirectory, MODULE_TRUST_PREFIX } from '../../apps/api/src/lib/module-trust.js'

const require = createRequire(import.meta.url)
const pg = require('pg')
const [command, key] = process.argv.slice(2)
const flag = (name) => process.argv.includes(name)
const option = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null }

const exists = (p) => fs.stat(p).then(() => true, () => false)
async function countFiles(dir, re = /\.m?js$/) {
  let n = 0
  for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (entry.isDirectory()) n += await countFiles(path.join(dir, entry.name), re)
    else if (re.test(entry.name)) n++
  }
  return n
}
const parse = (value) => { try { return JSON.parse(value ?? 'null') } catch { return null } }

async function inventory(db, modulesDir) {
  const { rows } = await db.query(`
    SELECT m.id, m.key, m.status::text AS status, m.enabled, m.version, m.has_bundle, m.manifest,
      (SELECT count(*)::int FROM company_module cm WHERE cm.module_id = m.id AND cm.enabled) AS companies_enabled,
      p.id IS NOT NULL AS builder_project, p.detached_at IS NOT NULL AS builder_detached,
      coalesce(jsonb_array_length(p.definition -> 'extensions' -> 'files'), 0) AS builder_extension_files,
      (SELECT value FROM instance_config WHERE key = $1 || m.key) AS trust,
      (SELECT value FROM instance_config WHERE key = 'catalog.installed.' || m.key) AS catalog
    FROM runly_module m LEFT JOIN module_builder_project p ON p.module_key = m.key
    WHERE m.key ~ '^(custom|community)\\.' ORDER BY m.key`, [MODULE_TRUST_PREFIX])
  const out = []
  for (const row of rows) {
    const dir = path.join(modulesDir, row.key)
    const onDisk = await exists(path.join(dir, 'module.manifest.js'))
    const hash = onDisk ? await hashModuleDirectory(dir) : null
    const trust = parse(row.trust), catalog = parse(row.catalog)
    const trusted = Boolean(trust?.state === 'trusted' && hash && trust.trustedHashes?.includes(hash))
    const backend = onDisk ? (await Promise.all(['api/index.js', 'api/public.js', 'api/automations.js', 'api/events.js', 'seed.js', 'teardown.js'].map(async (f) => (await exists(path.join(dir, f))) ? f : null))).filter(Boolean) : []
    const consumes = row.manifest?.consumes ? Object.entries(row.manifest.consumes).map(([provider, services]) => `${provider}:${[].concat(services).join('|')}`) : []
    const verdict = !onDisk ? 'NO_CODE_ON_DISK'
      : trusted ? 'TRUSTED'
      : row.builder_project && !row.builder_detached && !row.builder_extension_files ? 'REPUBLISH_FROM_BUILDER'
      : catalog?.official === true ? 'REINSTALL_FROM_OFFICIAL_CATALOG'
      : 'OWNER_CODE_REVIEW'
    out.push({
      key: row.key, status: row.status, enabled: row.enabled, version: row.version, companiesEnabled: row.companies_enabled,
      provenance: { builder: row.builder_project, detached: row.builder_detached, extensionFiles: row.builder_extension_files, catalog: catalog ? { official: catalog.official === true, trust: catalog.trust ?? null, sha256: catalog.sha256 ?? null } : null },
      trust: trust ? { state: trust.state, authority: trust.authority, at: trust.at } : null,
      diskHash: hash, trusted,
      backendCode: backend, frontendCode: onDisk && await exists(path.join(dir, 'components', 'index.js')), bundle: row.has_bundle,
      serverImportedFiles: onDisk ? 1 + await countFiles(path.join(dir, 'models')) + await countFiles(path.join(dir, 'views')) : 0,
      migrations: onDisk ? await countFiles(path.join(dir, 'migrations'), /\.(sql|m?js)$/) : 0,
      consumes, verdict,
    })
  }
  return out
}

async function decide(db, modulesDir, decision) {
  if (!/^(custom|community)\.[a-z][a-z0-9_-]*$/.test(key ?? '')) throw Error('Indica la clave del módulo (custom.<nombre>).')
  const dir = path.join(modulesDir, key)
  const current = parse((await db.query('SELECT value FROM instance_config WHERE key = $1', [MODULE_TRUST_PREFIX + key])).rows[0]?.value)
  let record
  if (decision === 'approve') {
    if (!flag('--reviewed')) throw Error('Aprobar ejecuta este código en el servidor. Revísalo y repite con --reviewed.')
    const hash = await hashModuleDirectory(dir)
    const kept = (current?.state === 'trusted' ? current.trustedHashes : []).filter((h) => h !== hash)
    record = { v: 1, state: 'trusted', trustedHashes: [hash, ...kept].slice(0, 10), authority: 'operator-review', actorId: null, at: new Date().toISOString(), reason: null }
  } else {
    record = { v: 1, state: 'quarantined', trustedHashes: current?.trustedHashes ?? [], authority: current?.authority ?? null, actorId: null, at: new Date().toISOString(), reason: option('--reason') ?? 'QUARANTINED_BY_OPERATOR' }
  }
  await db.query(`INSERT INTO instance_config(key, value, updated_at) VALUES ($1, $2, now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`, [MODULE_TRUST_PREFIX + key, JSON.stringify(record)])
  await db.query(`INSERT INTO audit_log(id, module_key, entity_type, action, after, created_at) VALUES (uuidv7(), $1, 'RunlyModuleTrust', $2, to_jsonb($3::text), now())`, [key, `core.module.trust.${decision}`, JSON.stringify({ state: record.state, hash: record.trustedHashes[0] ?? null, by: 'operator-cli' })])
  return { key, state: record.state, note: 'Reinicia la API y el worker (o espera 30 s) para que el cambio se aplique.' }
}

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL
const modulesDir = path.resolve(process.env.RUNLY_MODULES_DIR || 'modules/custom')
if (!connectionString || !['inventory', 'approve', 'quarantine'].includes(command)) {
  console.error('Uso: module-trust.mjs inventory [--json] | approve <key> --reviewed | quarantine <key> [--reason "..."] (requiere DIRECT_URL)')
  process.exit(2)
}
const db = new pg.Client({ connectionString })
await db.connect()
try {
  if (command === 'inventory') {
    const rows = await inventory(db, modulesDir)
    if (flag('--json')) console.log(JSON.stringify(rows, null, 2))
    else for (const r of rows) console.log([r.verdict.padEnd(32), r.key.padEnd(32), `${r.status}/${r.enabled ? 'on' : 'off'}`, `empresas=${r.companiesEnabled}`, `backend=${r.backendCode.join(',') || '-'}`, `frontend=${r.frontendCode ? 'sí' : 'no'}`].join('  '))
  } else console.log(JSON.stringify(await decide(db, modulesDir, command)))
} finally { await db.end() }
