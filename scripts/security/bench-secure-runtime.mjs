#!/usr/bin/env node
// F1B Stage 2 measurements (local workstation; numbers are indicative, not a
// capacity claim): gateway latency in-process and over HTTP, and the trust
// gate's hashing cost for a Builder-compiled module.
//   node scripts/security/bench-secure-runtime.mjs
import { readFileSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { compileModule } from '../../packages/module-compiler/src/index.js'
import { buildDefinitionFromTemplate } from '../../apps/api/src/services/module-builder-templates.js'
import { hashModuleDirectory, currentModuleHash, configureModuleTrust } from '../../apps/api/src/lib/module-trust.js'
import { createHostSigner } from '../../apps/api/src/secure-runtime/protocol.js'
import { createCapabilityGateway } from '../../apps/api/src/secure-runtime/gateway/gateway.js'
import { createMemoryStore } from '../../apps/api/src/secure-runtime/gateway/stores.js'
import { startGatewayServer } from '../../apps/api/src/secure-runtime/gateway/server.js'
import { loadDeclarativeModule } from '../../apps/api/src/secure-runtime/declarative/schema.js'

const pct = (values, p) => { const s = [...values].sort((a, b) => a - b); return Math.round(s[Math.min(s.length - 1, Math.floor(s.length * p))] * 1000) / 1000 }
const stats = (values) => ({ n: values.length, p50: pct(values, 0.5), p95: pct(values, 0.95), p99: pct(values, 0.99) })
const out = {}

const def = loadDeclarativeModule(JSON.parse(readFileSync(path.resolve('apps/api/src/secure-runtime/fixtures/solicitudes/module.json'), 'utf8')))
const gateway = createCapabilityGateway({ signer: createHostSigner(), store: createMemoryStore(), limits: { callsPerMinute: 1e9 } })
gateway.register(def, { approvedCapabilities: def.capabilities, packageHash: 'bench' })
const companyId = randomUUID(), profileId = randomUUID()
const token = gateway.issueCallToken({ moduleKey: def.key, companyId, profileId, permissionSet: new Set(Object.values(def.permissions)), capabilities: def.capabilities })
const nonce = () => randomUUID().replaceAll('-', '')
for (let i = 0; i < 50; i++) await gateway.call({ operation: 'records.create', token, nonce: nonce(), idempotencyKey: nonce(), args: { entity: 'solicitud', data: { titulo: `Solicitud ${i}`, solicitante: profileId } } })
const heap0 = process.memoryUsage().heapUsed
const inproc = []
for (let i = 0; i < 2000; i++) { const t = performance.now(); await gateway.call({ operation: 'records.list', token, nonce: nonce(), args: { entity: 'solicitud', limit: 20 } }); inproc.push(performance.now() - t) }
out.gatewayInProcessMs = stats(inproc)
out.gatewayHeapDeltaMb = Math.round((process.memoryUsage().heapUsed - heap0) / 1048576 * 10) / 10

const server = await startGatewayServer({ gateway })
const viaHttp = []
for (let i = 0; i < 500; i++) {
  const t = performance.now()
  const res = await fetch(`http://127.0.0.1:${server.port}/v1/call`, { method: 'POST', headers: { authorization: `Module ${token}`, 'x-runly-call-nonce': nonce(), 'content-type': 'application/json' }, body: JSON.stringify({ operation: 'records.list', args: { entity: 'solicitud', limit: 20 } }) })
  await res.json(); viaHttp.push(performance.now() - t)
}
out.gatewayHttpMs = stats(viaHttp)
await server.close()

const tmp = await fs.mkdtemp(path.resolve('.tmp-bench-'))
try {
  const { files } = compileModule(buildDefinitionFromTemplate('inventory-lite', { moduleKey: 'custom.bench_inv', name: 'Bench', description: 'Bench', icon: 'Package', color: '#2563EB' }))
  const dir = path.join(tmp, 'custom.bench_inv')
  for (const f of files) { await fs.mkdir(path.dirname(path.join(dir, f.path)), { recursive: true }); await fs.writeFile(path.join(dir, f.path), f.content) }
  configureModuleTrust({ prisma: { instanceConfig: { findUnique: async () => null, upsert: async () => {} } }, modulesDir: tmp })
  const cold = [], cached = []
  for (let i = 0; i < 20; i++) { const t = performance.now(); await hashModuleDirectory(dir); cold.push(performance.now() - t) }
  await currentModuleHash(dir)
  for (let i = 0; i < 200; i++) { const t = performance.now(); await currentModuleHash(dir); cached.push(performance.now() - t) }
  out.trustHash = { files: files.length, bytes: files.reduce((n, f) => n + Buffer.byteLength(f.content), 0), fullHashMs: stats(cold), cachedCheckMs: stats(cached) }
} finally {
  configureModuleTrust({ prisma: null, modulesDir: null })
  await fs.rm(tmp, { recursive: true, force: true })
}
console.log(JSON.stringify(out, null, 2))
