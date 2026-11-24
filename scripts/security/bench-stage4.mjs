#!/usr/bin/env node
// F1B Stage 4 measurements on a disposable stack (workstation numbers: relative
// cost between configurations, not a capacity claim).
//   node scripts/security/bench-stage4.mjs --mode off|experimental|declarative [--out file.json]
// off          flag unset: nothing mounted.
// experimental flag on, no declarative modules.
// declarative  flag on + a converted Builder module serving its existing table.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { bootSecurityStack } from './lib/disposable-stack.mjs'
import { convertModuleDefinition } from '../../apps/api/src/secure-runtime/converter.js'

const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback }
const mode = arg('--mode', 'off')
const base = await mkdtemp(resolve('.tmp-bench4-'))
const runtimeDir = join(base, 'secure-modules'), modulesDir = join(base, 'external-modules')
await mkdir(runtimeDir, { recursive: true }); await mkdir(modulesDir, { recursive: true }); await mkdir(join(base, 'root', 'modules'), { recursive: true })
await writeFile(join(base, 'root', 'package.json'), '{}'); await writeFile(join(base, 'root', 'pnpm-workspace.yaml'), '')
process.env.RUNLY_PROJECT_ROOT = join(base, 'root')
if (mode !== 'off') Object.assign(process.env, { RUNLY_SECURE_RUNTIME_CALLS_PER_MINUTE: '6000', RUNLY_SECURE_RUNTIME: 'experimental', RUNLY_SECURE_RUNTIME_MODULES_DIR: runtimeDir, RUNLY_SECURE_RUNTIME_FRAME_ANCESTORS: 'http://127.0.0.1:5173' })
else delete process.env.RUNLY_SECURE_RUNTIME

const pct = (values, p) => { const s = [...values].sort((a, b) => a - b); return Math.round(s[Math.min(s.length - 1, Math.floor(s.length * p))] * 100) / 100 }
const lat = (values) => ({ n: values.length, p50: pct(values, 0.5), p95: pct(values, 0.95), p99: pct(values, 0.99), unit: 'ms' })
const rssMb = async (pid) => Math.round(Number((await promisify(execFile)('powershell', ['-NoProfile', '-Command', `(Get-Process -Id ${pid}).WorkingSet64`])).stdout) / 1048576)
const cpuSeconds = async (pid) => Math.round(Number((await promisify(execFile)('powershell', ['-NoProfile', '-Command', `(Get-Process -Id ${pid}).CPU`])).stdout.replace(',', '.')) * 100) / 100

const s = await bootSecurityStack({ modulesDir }).catch(async (e) => { await rm(base, { recursive: true, force: true }); throw e })
const result = { mode, apiBootMs: s.apiBootMs }
try {
  result.rssIdleMb = await rssMb(s.apiPid)
  const adminRole = await s.adminRole()
  const A = await s.createCompany('Empresa A'), B = await s.createCompany('Empresa B')
  const adminA = await s.createUser('admin-a@example.com', 'Prueba-Bn-1', [[A, adminRole]])
  const owner = await s.createUser('owner@example.com', 'Prueba-Bn-2', [[B, adminRole]])
  await s.q(`INSERT INTO instance_config(key,value,updated_at) VALUES ('platform_owner_profile_id',$1,now()) ON CONFLICT(key) DO UPDATE SET value=$1`, [owner.id])
  const tA = await s.login(adminA), tOwner = await s.login(owner)
  const apiA = s.client(tA, A)
  const KEY = 'custom.bn_items', SLUG = 'bn_items'
  const project = (await apiA('POST', '/module-builder/projects', { name: 'Bench', moduleKey: KEY, template: 'simple-crud' })).body.data
  await apiA('POST', `/module-builder/projects/${project.id}/publish`, {})
  const definition = (await apiA('GET', `/module-builder/projects/${project.id}`)).body.data.definition
  const entity = definition.entities[0], textField = entity.fields.find((f) => f.type === 'text').key
  for (let i = 0; i < 60; i++) await apiA('POST', `/${SLUG}/${entity.key}s`, { [textField]: `Fila ${i}` })

  let target
  if (mode === 'declarative') {
    const converted = convertModuleDefinition(definition)
    await mkdir(join(runtimeDir, KEY), { recursive: true })
    await writeFile(join(runtimeDir, KEY, 'module.json'), JSON.stringify(converted.declarative))
    await promisify(execFile)(process.execPath, ['scripts/security/module-trust.mjs', 'approve', KEY, '--reviewed'], { env: { ...process.env, DIRECT_URL: s.dbUrl, RUNLY_MODULES_DIR: runtimeDir } })
    await s.client(tOwner, B)('PUT', `/secure-runtime/v1/modules/${KEY}/grants`, { capabilities: ['records.read', 'records.write'] })
    target = (page) => fetch(`${s.urls.api}/secure-runtime/v1/modules/${KEY}/rest/${converted.declarative.entities[0].key}?page=${page}&pageSize=20&sortBy=${textField}`, { headers: { Authorization: `Bearer ${tA}`, 'X-Runly-Company-Id': A } })
  }
  const legacy = (page) => fetch(`${s.urls.api}/${SLUG}/${entity.key}s?page=${page}&pageSize=20`, { headers: { Authorization: `Bearer ${tA}`, 'X-Runly-Company-Id': A } })

  const measure = async (fn, { sequential = 200, concurrency = 20, rounds = 15 } = {}) => {
    for (let i = 0; i < 20; i++) await (await fn(1)).arrayBuffer() // warm-up
    const seq = []
    for (let i = 0; i < sequential; i++) { const t = performance.now(); const r = await fn(1 + (i % 3)); await r.arrayBuffer(); if (!r.ok) throw new Error(`HTTP ${r.status}`); seq.push(performance.now() - t) }
    const conc = []; let requests = 0, failures = 0
    const wallStart = performance.now()
    for (let round = 0; round < rounds; round++) await Promise.all(Array.from({ length: concurrency }, async () => { const t = performance.now(); const r = await fn(1); await r.arrayBuffer(); requests++; if (!r.ok) failures++; conc.push(performance.now() - t) }))
    return { sequential: lat(seq), concurrent: { ...lat(conc), concurrency, requests, failures, throughputPerSec: Math.round(requests / ((performance.now() - wallStart) / 1000)) } }
  }
  const cpu0 = await cpuSeconds(s.apiPid)
  result.existingRuntimeList = await measure(legacy)
  if (target) result.declarativeRestList = await measure(target)
  result.cpuSecondsDuringMeasurements = Math.round((await cpuSeconds(s.apiPid) - cpu0) * 100) / 100
  result.rssAfterMb = await rssMb(s.apiPid)
} finally {
  console.log(JSON.stringify(result, null, 2))
  if (arg('--out')) await writeFile(arg('--out'), JSON.stringify(result, null, 2))
  await s.close()
  await rm(base, { recursive: true, force: true })
}
