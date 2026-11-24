// Experimental Secure Runtime integration into the real API (F1B Stage 3).
// Off unless RUNLY_SECURE_RUNTIME=experimental: with the flag off nothing is
// mounted, no schema is created and the existing runtime keeps its Stage 1
// trust/quarantine rules (this file never relaxes them).
//
// The API is the host: company, user and permissions come from the session's
// tenantContext; module identity comes from the registry below (a declarative
// package whose exact bytes are trusted, module-trust.js); capabilities come
// only from the platform owner's grant. Call tokens are minted per request,
// server side, and never leave the API.
import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { Hono } from 'hono'
import { createHostSigner, GatewayError } from './protocol.js'
import { createRestFacade } from './rest-facade.js'
import { allPermissionKeys, createCapabilityGateway, GATEWAY_OPERATIONS } from './gateway/gateway.js'
import { createPgStore } from './gateway/stores.js'
import { createRme3TableStore } from './gateway/rme3-table-store.js'
import { loadDeclarativeModule, CAPABILITIES } from './declarative/schema.js'
import { toBlueprints } from './declarative/runtime.js'
import { renderIsolatedFrame } from './frontend/frame-document.js'
import { createGatewayHostServices } from './host-services.js'
import { currentModuleHash, hashModuleDirectory } from '../lib/module-trust.js'
import { moduleCodeAuthorityDenied, ownerCodeAuthority } from '../lib/module-code-authority.js'

export const SECURE_RUNTIME_FLAG = 'RUNLY_SECURE_RUNTIME'
const KEY_RE = /^custom\.[a-z][a-z0-9_]{1,40}$/
const GRANTS_PREFIX = 'secure_runtime.grants.'
const MAX_INFLIGHT_PER_COMPANY = 20

export function isSecureRuntimeEnabled(env = process.env) {
  return env[SECURE_RUNTIME_FLAG] === 'experimental'
}

const normalize = (c, error) => {
  const e = error instanceof GatewayError ? error : new GatewayError('CAPABILITY_FAILED', 'La operación falló.', 500)
  return c.json({ error: e.code, message: e.message, ...(e.details ? { details: e.details } : {}), ...(e.correlationId ? { correlationId: e.correlationId } : {}) }, e.status)
}

export function createSecureRuntimeIntegration({ prisma, pool, filesService, relationTargets = null, activityService = null, supervisor = null, env = process.env }) {
  if (!isSecureRuntimeEnabled(env)) return { enabled: false }
  const modulesDir = env.RUNLY_SECURE_RUNTIME_MODULES_DIR ? path.resolve(env.RUNLY_SECURE_RUNTIME_MODULES_DIR) : null
  const frameAncestors = String(env.RUNLY_SECURE_RUNTIME_FRAME_ANCESTORS ?? '').split(/\s+/).filter(Boolean)
  // Per module and company. 120/min suits a few users; a busy company raises it (bounded) per instance.
  const callsPerMinute = Math.min(6000, Math.max(10, Number.parseInt(env.RUNLY_SECURE_RUNTIME_CALLS_PER_MINUTE ?? '', 10) || 120))
  const signer = createHostSigner()
  // Converted Builder modules (entities with `table`) read/write their existing RME3 tables.
  const tableStores = new WeakMap()
  const storeFor = (def) => {
    if (!def.entities.every((e) => e.table)) return null
    if (!tableStores.has(def)) tableStores.set(def, createRme3TableStore({ pool, def }))
    return tableStores.get(def)
  }
  const gateway = createCapabilityGateway({ signer, store: createPgStore({ pool }), storeFor, services: createGatewayHostServices({ filesService, prisma, relationTargets, activityService }), limits: { callsPerMinute } })
  const registry = new Map() // key -> { def, dir, hash }
  const inflight = new Map() // companyId -> count

  async function trustedHashes(key) {
    const row = await prisma.instanceConfig.findUnique({ where: { key: `module.trust.${key}` }, select: { value: true } })
    try { const record = JSON.parse(row?.value ?? 'null'); return record?.state === 'trusted' ? record.trustedHashes ?? [] : [] } catch { return [] }
  }
  async function grantsOf(key) {
    const row = await prisma.instanceConfig.findUnique({ where: { key: GRANTS_PREFIX + key }, select: { value: true } })
    try { const value = JSON.parse(row?.value ?? 'null'); return Array.isArray(value?.capabilities) ? value.capabilities.filter((c) => CAPABILITIES.includes(c)) : [] } catch { return [] }
  }

  // (Re)loads a declarative package from disk: JSON only, never imported. It
  // registers only if its exact bytes are trusted; otherwise it stays out of
  // the gateway (calls answer MODULE_NOT_AVAILABLE) and nothing falls back.
  async function load(key) {
    if (!modulesDir || !KEY_RE.test(key)) return null
    const dir = path.join(modulesDir, key)
    let raw
    try { raw = JSON.parse(await fs.readFile(path.join(dir, 'module.json'), 'utf8')) } catch { registry.delete(key); gateway.revoke(key); return null }
    let hash
    try { hash = await hashModuleDirectory(dir) } catch { registry.delete(key); gateway.revoke(key); return null }
    if (!(await trustedHashes(key)).includes(hash)) { registry.delete(key); gateway.revoke(key); return null }
    const def = loadDeclarativeModule(raw)
    if (def.key !== key) return null
    gateway.register(def, { approvedCapabilities: await grantsOf(key), packageHash: hash })
    registry.set(key, { def, dir, hash })
    return registry.get(key)
  }
  async function moduleFor(key) {
    let entry = registry.get(key)
    // Bytes changed on disk since registration: reload, which re-checks trust.
    if (entry && (await currentModuleHash(entry.dir).catch(() => null)) !== entry.hash) entry = null
    entry ??= await load(key)
    if (!entry || gateway.moduleOf(key)?.revoked) throw new GatewayError('MODULE_NOT_AVAILABLE', 'El módulo no está disponible en el runtime seguro.', 404)
    return entry
  }

  // Host-side context: never from the request body or the module.
  function hostContext(c, entry) {
    const tenant = c.get('tenantContext')
    const profileId = c.get('userContext')?.profile?.id ?? c.get('userId')
    if (!tenant?.companyId || !profileId) throw new GatewayError('CONTEXT_INVALID', 'Selecciona una empresa.', 400)
    const modulePerms = allPermissionKeys(entry.def)
    const held = new Set(tenant.isAdmin ? modulePerms : modulePerms.filter((p) => tenant.permissionSet?.has?.(p)))
    return { companyId: tenant.companyId, profileId, permissionSet: held }
  }
  async function withCompanySlot(companyId, fn) {
    const n = inflight.get(companyId) ?? 0
    if (n >= MAX_INFLIGHT_PER_COMPANY) throw new GatewayError('QUOTA_EXCEEDED', 'Demasiadas operaciones simultáneas para esta empresa.', 429)
    inflight.set(companyId, n + 1)
    try { return await fn() } finally { const left = (inflight.get(companyId) ?? 1) - 1; if (left > 0) inflight.set(companyId, left); else inflight.delete(companyId) }
  }

  // Authenticated routes (mount behind auth + requireActiveCompany).
  function createRouter({ requireActiveCompany }) {
    const app = new Hono()
    const guard = async (c, next) => {
      if (!KEY_RE.test(c.req.param('key'))) return c.json({ error: 'MODULE_NOT_AVAILABLE', message: 'Módulo no válido.' }, 404)
      return requireActiveCompany(c, next)
    }
    app.get('/secure-runtime/v1/modules/:key', guard, async (c) => {
      try {
        const entry = await moduleFor(c.req.param('key'))
        return c.json({ data: { key: entry.def.key, name: entry.def.name, version: entry.def.version, grants: [...(gateway.moduleOf(entry.def.key)?.approved ?? [])], views: entry.def.entities.map((e) => toBlueprints(entry.def, e)) } })
      } catch (error) { return normalize(c, error) }
    })
    // One call path for the JSON endpoint and the REST facade: the host derives
    // company, user and permissions from the session; the module chooses none.
    const invoke = (c, entry, operation, args) => {
      const ctx = hostContext(c, entry)
      return withCompanySlot(ctx.companyId, async () => {
        const token = gateway.issueCallToken({ moduleKey: entry.def.key, ...ctx, capabilities: [...gateway.moduleOf(entry.def.key).approved], ttlMs: 30_000 })
        const idempotencyKey = c.req.header('Idempotency-Key') ?? randomUUID().replaceAll('-', '')
        return gateway.call({ operation, token, nonce: randomUUID().replaceAll('-', ''), idempotencyKey, args })
      })
    }
    app.post('/secure-runtime/v1/modules/:key/call', guard, async (c) => {
      try {
        const entry = await moduleFor(c.req.param('key'))
        const body = await c.req.json().catch(() => null)
        if (!body || typeof body.operation !== 'string' || !GATEWAY_OPERATIONS.includes(body.operation)) throw new GatewayError('INVALID_ARGS', 'Operación no válida.', 422)
        return c.json(await invoke(c, entry, body.operation, body.args))
      } catch (error) { return normalize(c, error) }
    })
    app.route('/', createRestFacade({ guard, moduleFor, invoke, normalize }))
    app.post('/secure-runtime/v1/modules/:key/extensions/:ext/run', guard, async (c) => {
      try {
        if (!supervisor) throw new GatewayError('RUNTIME_UNAVAILABLE', 'El ejecutor aislado no está configurado.', 503)
        const entry = await moduleFor(c.req.param('key'))
        const ext = entry.def.extensions?.backend?.find((x) => x.key === c.req.param('ext'))
        if (!ext) throw new GatewayError('NOT_FOUND', 'Extensión no encontrada.', 404)
        const ctx = hostContext(c, entry)
        const approved = gateway.moduleOf(entry.def.key).approved
        const jobId = randomUUID()
        const token = gateway.issueCallToken({ moduleKey: entry.def.key, ...ctx, capabilities: ext.capabilities.filter((cap) => approved.has(cap)), jobId, ttlMs: ext.timeoutMs + 15_000 })
        const body = await c.req.json().catch(() => ({}))
        const result = await withCompanySlot(ctx.companyId, () => supervisor.run({ jobId, moduleKey: entry.def.key, packageHash: entry.hash, handler: ext.handler, timeoutMs: ext.timeoutMs, input: body?.input ?? {}, callToken: token }))
        if (!result.ok) throw new GatewayError(result.error?.code ?? 'RUNTIME_FAILED', 'La extensión no terminó correctamente.', result.error?.code === 'RUNTIME_BUSY' ? 429 : 502)
        return c.json({ data: result.result, jobId })
      } catch (error) { return normalize(c, error) }
    })
    // Platform owner: grant or revoke capabilities (deny by default).
    app.put('/secure-runtime/v1/modules/:key/grants', guard, async (c) => {
      if (!ownerCodeAuthority(c.get('tenantContext'))) return moduleCodeAuthorityDenied(c)
      const key = c.req.param('key')
      const body = await c.req.json().catch(() => ({}))
      const capabilities = Array.isArray(body?.capabilities) ? [...new Set(body.capabilities.filter((cap) => CAPABILITIES.includes(cap)))] : []
      await prisma.instanceConfig.upsert({ where: { key: GRANTS_PREFIX + key }, update: { value: JSON.stringify({ capabilities }) }, create: { key: GRANTS_PREFIX + key, value: JSON.stringify({ capabilities }) } })
      gateway.revoke(key); registry.delete(key) // old tokens die now; next call re-registers with the new grant
      if (!capabilities.length) await supervisor?.cancelModule(key).catch(() => {})
      await prisma.auditLog.create({ data: { actorId: c.get('userContext')?.profile?.id ?? null, moduleKey: key, entityType: 'RunlyModuleCapability', action: 'runtime.grants.set', after: JSON.stringify({ capabilities }), before: null, metadata: null } }).catch(() => {})
      return c.json({ data: { key, capabilities } })
    })
    return app
  }

  // Public route: frame documents load in an iframe without credentials. The
  // component code is the module's trusted package bytes; nothing user- or
  // company-specific is served here.
  function createPublicRouter() {
    const app = new Hono()
    app.get('/secure-runtime/v1/frames/:key/:component', async (c) => {
      try {
        if (!frameAncestors.length) throw new GatewayError('RUNTIME_UNAVAILABLE', 'Orígenes de host no configurados.', 503)
        const entry = await moduleFor(c.req.param('key'))
        const component = entry.def.extensions?.frontend?.find((x) => x.key === c.req.param('component'))
        if (!component) throw new GatewayError('NOT_FOUND', 'Componente no encontrado.', 404)
        const frame = renderIsolatedFrame({ componentSource: await fs.readFile(path.join(entry.dir, component.entry), 'utf8'), title: entry.def.name, frameAncestors })
        return c.body(frame.html, 200, frame.headers)
      } catch (error) { return normalize(c, error) }
    })
    return app
  }

  return { enabled: true, gateway, signer, createRouter, createPublicRouter, reload: load, registry }
}
