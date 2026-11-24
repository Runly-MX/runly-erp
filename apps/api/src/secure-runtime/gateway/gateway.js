// Capability Gateway v1 (experimental). Contract:
// docs/architecture/2026-11-23-rme3-capability-gateway-contract.md
//
// The only door between module code (declarative runtime, isolated backend
// extensions, isolated frontend components) and Runly data. Deny by default:
// every call needs a host-signed call token, a fresh nonce, a registered and
// unrevoked module whose package hash matches, a capability that is both
// declared by the module and approved for the instance, the user's permission
// for that operation, valid arguments, quota and time budget. Company and user
// come only from the token; a companyId/userId in the arguments is rejected.
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { GatewayError, PROTOCOL_VERSION } from '../protocol.js'
import { externalTypeOf } from '../declarative/schema.js'
import { applyTransition, entityOf, permissionKey, prepareRecord, RecordError } from '../declarative/runtime.js'

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
const ident = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/)
const data = z.record(z.string(), z.unknown()).refine((v) => JSON.stringify(v).length <= 16_384, 'Datos demasiado grandes.')

// operation -> { capability, permission action (or function), args schema, write }
const OPERATIONS = {
  'records.list': { cap: 'records.read', perm: 'read', args: z.strictObject({ entity: ident, state: ident.optional(), limit: z.number().int().min(1).max(100).optional() }) },
  'records.get': { cap: 'records.read', perm: 'read', args: z.strictObject({ entity: ident, id: uuid }) },
  'records.create': { cap: 'records.write', perm: 'create', write: true, args: z.strictObject({ entity: ident, data }) },
  'records.update': { cap: 'records.write', perm: 'update', write: true, args: z.strictObject({ entity: ident, id: uuid, data, expectedVersion: z.union([z.number().int().positive(), z.string().max(64)]).optional() }) },
  'records.transition': { cap: 'records.write', perm: null, write: true, args: z.strictObject({ entity: ident, id: uuid, action: ident }) },
  // Soft delete only (the row stays, enabled = false / deleted_at). Restoring needs the same permission.
  'records.delete': { cap: 'records.write', perm: 'delete', write: true, args: z.strictObject({ entity: ident, id: uuid, expectedVersion: z.union([z.number().int().positive(), z.string().max(64)]).optional() }) },
  'records.restore': { cap: 'records.write', perm: 'delete', write: true, args: z.strictObject({ entity: ident, id: uuid }) },
  'relations.search': { cap: 'relations.resolve', perm: 'read', args: z.strictObject({ entity: ident, field: ident, q: z.string().trim().max(100).optional(), limit: z.number().int().min(1).max(50).optional() }) },
  'relations.resolve': { cap: 'relations.resolve', perm: 'read', args: z.strictObject({ entity: ident, field: ident, ids: z.array(uuid).min(1).max(50) }) },
  'files.describe': { cap: 'files.describe', perm: 'read', args: z.strictObject({ ids: z.array(uuid).min(1).max(20) }) },
  'files.attach': { cap: 'files.attach', perm: 'update', write: true, args: z.strictObject({ entity: ident, id: uuid, fileId: uuid }) },
  'notifications.publish': { cap: 'notifications.publish', perm: 'update', write: true, args: z.strictObject({ to: z.array(uuid).min(1).max(10), title: z.string().trim().min(1).max(140), body: z.string().max(500).optional() }) },
  'events.emit': { cap: 'events.emit', perm: 'update', write: true, args: z.strictObject({ event: z.string().regex(/^[a-z][a-z0-9_.]{2,80}$/), payload: z.record(z.string(), z.unknown()).refine((v) => JSON.stringify(v).length <= 4096).optional() }) },
}
export const GATEWAY_OPERATIONS = Object.keys(OPERATIONS)

export const allPermissionKeys = (def) => [...new Set([...Object.values(def.permissions), ...def.entities.flatMap((e) => Object.values(e.permissions ?? {}))])]

const DEFAULT_LIMITS = { callsPerMinute: 120, notificationsPerMinute: 20, timeoutMs: 3000 }

const toRecord = (row) => ({ id: row.id, data: row.data, attachments: (row.attachments ?? []).map((a) => ({ fileId: a.fileId })), version: row.version, createdAt: row.createdAt, updatedAt: row.updatedAt })

// Security audit record. Every field is set by the host from the verified token
// or from arguments already validated as identifiers/UUIDs; module-supplied text
// and values (record data, titles, tokens) are never copied in.
function auditDetails(claims, operation, args, extra) {
  return { operation, entity: args?.entity ?? null, recordId: args?.id ?? null, job: claims.job ?? null, moduleRevision: claims.pkg, at: new Date().toISOString(), ...extra }
}

// storeFor(def): record storage for a module (existing RME3 tables for converted
// Builder modules, gateway/stores.js otherwise). Everything else uses `store`.
export function createCapabilityGateway({ signer, store, storeFor = null, services = {}, limits = {}, now = () => Date.now() }) {
  const config = { ...DEFAULT_LIMITS, ...limits }
  const modules = new Map() // key -> { def, approved:Set, packageHash, grantVersion, revoked }
  const buckets = new Map() // key -> { start, count }

  // Host-side registration after the module passed code authority / trust
  // (module-trust.js). approved: capabilities the platform owner granted.
  function register(def, { approvedCapabilities, packageHash }) {
    const previous = modules.get(def.key)
    const approved = new Set(approvedCapabilities.filter((cap) => def.capabilities.includes(cap)))
    modules.set(def.key, { def, approved, packageHash, grantVersion: (previous?.grantVersion ?? 0) + 1, revoked: false })
    return modules.get(def.key).grantVersion
  }
  function revoke(moduleKey) {
    const entry = modules.get(moduleKey)
    if (entry) { entry.revoked = true; entry.grantVersion++ }
  }
  function moduleOf(key) { return modules.get(key) ?? null }

  // Host-only: called by Runly code that already authenticated the user and
  // resolved the tenant (tenantContext). Never exposed to module code.
  function issueCallToken({ moduleKey, companyId, profileId, permissionSet, capabilities, jobId = null, ttlMs }) {
    const entry = modules.get(moduleKey)
    if (!entry || entry.revoked) throw new GatewayError('MODULE_REVOKED', 'El módulo no está habilitado en el runtime.', 403)
    const held = allPermissionKeys(entry.def).filter((key) => permissionSet.has(key))
    const caps = capabilities.filter((cap) => entry.approved.has(cap))
    return signer.issue({ mod: moduleKey, pkg: entry.packageHash, gv: entry.grantVersion, cid: companyId, uid: profileId, perms: held, caps, job: jobId }, ttlMs)
  }

  function quota(claims, operation) {
    const at = now()
    const take = (key, max) => {
      const bucket = buckets.get(key)
      if (!bucket || at - bucket.start >= 60_000) { buckets.set(key, { start: at, count: 1 }); return }
      if (bucket.count >= max) throw new GatewayError('QUOTA_EXCEEDED', 'Se alcanzó el límite de llamadas del módulo.', 429)
      bucket.count++
    }
    take(`${claims.mod}:${claims.cid}`, config.callsPerMinute)
    if (operation === 'notifications.publish') take(`${claims.mod}:${claims.cid}:notify`, config.notificationsPerMinute)
  }

  async function withTimeout(promise) {
    let timer
    try {
      return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new GatewayError('CAPABILITY_TIMEOUT', 'La operación excedió su tiempo.', 504)), config.timeoutMs) })])
    } finally { clearTimeout(timer) }
  }

  // Business history (what users see in the activity feed). Text is composed
  // here from the trusted package definition; nothing the module sends is used.
  const ACTIVITY = { 'records.create': 'creó', 'records.update': 'actualizó', 'records.transition': 'cambió de estado', 'records.delete': 'eliminó', 'records.restore': 'restauró' }
  async function recordActivity(claims, entry, operation, args, result) {
    if (!services.activity?.publish || !ACTIVITY[operation]) return
    const entity = entry.def.entities.find((e) => e.key === args.entity)
    const recordId = args.id ?? result?.id ?? result?.record?.id
    try {
      await services.activity.publish({ companyId: claims.cid, actorId: claims.uid, type: `module.${entry.def.key}.${args.entity}.${operation.split('.')[1]}`.slice(0, 100), summary: `${entry.def.name}: ${ACTIVITY[operation]} ${entity?.label ?? args.entity}`.slice(0, 500), entityType: `${entry.def.key}:${args.entity}`.slice(0, 100), entityId: recordId })
    } catch { await store.audit(claims, 'runtime.activity_failed', { operation, reason: 'ACTIVITY_PUBLISH_FAILED' }).catch(() => {}) }
  }

  async function perform(operation, args, claims, entry, permissions) {
    const def = entry.def
    const ctx = { companyId: claims.cid, profileId: claims.uid, moduleKey: claims.mod }
    const records = storeFor?.(def) ?? store
    const need = (action, entityKey = args.entity) => { const key = permissionKey(def, entityKey ? def.entities.find((e) => e.key === entityKey) : null, action); if (!key || !permissions.has(key)) throw new GatewayError('PERMISSION_DENIED', 'No tienes permiso para esta operación.', 403) }
    const loadRecord = async (entity, id) => {
      const row = await records.getRecord(ctx, entity, id)
      if (!row) throw new GatewayError('NOT_FOUND', 'Registro no encontrado.', 404)
      return row
    }
    switch (operation) {
      case 'records.list': {
        const entity = entityOf(def, args.entity)
        if (args.state && !entity.states?.values.some((v) => v.value === args.state)) throw new GatewayError('INVALID_ARGS', 'Estado desconocido.', 422)
        return (await records.listRecords(ctx, entity.key, { state: args.state, stateField: entity.states?.field, limit: args.limit ?? 50 })).map(toRecord)
      }
      case 'records.get': return toRecord(await loadRecord(entityOf(def, args.entity).key, args.id))
      case 'records.create': {
        const entity = entityOf(def, args.entity)
        return toRecord(await records.createRecord(ctx, entity.key, prepareRecord(entity, args.data, { mode: 'create' })))
      }
      case 'records.update': {
        const entity = entityOf(def, args.entity)
        const row = await loadRecord(entity.key, args.id)
        if (args.expectedVersion !== undefined && String(args.expectedVersion) !== String(row.version)) throw new GatewayError('VERSION_CONFLICT', 'El registro cambió; recarga antes de guardar.', 409)
        return toRecord(await records.updateRecord(ctx, entity.key, args.id, prepareRecord(entity, args.data, { mode: 'update', current: row.data }), row.version))
      }
      case 'records.transition': {
        const entity = entityOf(def, args.entity)
        const row = await loadRecord(entity.key, args.id)
        const { data: next, effects } = applyTransition(def, entity, row.data, args.action, { grantedPermissions: permissions })
        const updated = await records.updateRecord(ctx, entity.key, args.id, next, row.version)
        for (const effect of effects) {
          if (effect.notify?.to) await deliverNotification(ctx, [effect.notify.to], effect.notify.title, effect.notify.body)
          if (effect.emit) await store.insertEvent(ctx, effect.emit, { entity: entity.key, recordId: args.id, action: args.action })
        }
        return { record: toRecord(updated), effects: effects.map((e) => (e.notify ? { notify: true } : { emit: e.emit })) }
      }
      case 'records.delete': {
        const entity = entityOf(def, args.entity)
        const row = await loadRecord(entity.key, args.id)
        if (args.expectedVersion !== undefined && String(args.expectedVersion) !== String(row.version)) throw new GatewayError('VERSION_CONFLICT', 'El registro cambió; recarga antes de eliminar.', 409)
        const deleted = await records.softDelete(ctx, entity.key, args.id, row.version)
        return { id: deleted.id, deleted: true }
      }
      case 'records.restore': {
        const entity = entityOf(def, args.entity)
        const restored = await records.restore(ctx, entity.key, args.id)
        if (!restored) throw new GatewayError('NOT_FOUND', 'Registro eliminado no encontrado.', 404)
        return toRecord(restored)
      }
      case 'relations.search': {
        const field = entityOf(def, args.entity).fields.find((f) => f.key === args.field)
        const type = field?.type === 'relation' ? externalTypeOf(field.target) : null
        if (!type) throw new GatewayError('INVALID_ARGS', 'El campo no es una relación externa declarada.', 422)
        if (!services.relations?.search) throw new GatewayError('CAPABILITY_UNAVAILABLE', 'Relaciones no disponibles.', 503)
        return services.relations.search({ ...ctx, type, q: args.q ?? '', limit: args.limit ?? 20 })
      }
      case 'relations.resolve': {
        const field = entityOf(def, args.entity).fields.find((f) => f.key === args.field)
        if (field?.type !== 'relation') throw new GatewayError('INVALID_ARGS', 'El campo no es una relación declarada.', 422)
        const externalType = externalTypeOf(field.target)
        if (externalType && services.relations?.resolve) return services.relations.resolve({ ...ctx, type: externalType, ids: args.ids })
        if (field.target.startsWith('entity:')) {
          const target = entityOf(def, field.target.slice('entity:'.length))
          need('read', target.key)
          const labelField = target.fields.find((f) => f.type === 'text')?.key
          const rows = await Promise.all(args.ids.map((id) => records.getRecord(ctx, target.key, id)))
          return rows.filter(Boolean).map((r) => ({ id: r.id, label: labelField ? String(r.data[labelField] ?? '') : r.id }))
        }
        return store.resolveRelation(ctx, field.target, args.ids)
      }
      case 'files.describe': {
        if (!services.files?.describe) throw new GatewayError('CAPABILITY_UNAVAILABLE', 'Archivos no disponibles.', 503)
        return (await services.files.describe({ ...ctx, permissionSet: permissions, ids: args.ids })).map((f) => ({ id: f.id, mimeType: f.mimeType }))
      }
      case 'files.attach': {
        need('update')
        const entity = entityOf(def, args.entity)
        const row = await loadRecord(entity.key, args.id)
        const visible = services.files?.describe ? await services.files.describe({ ...ctx, permissionSet: permissions, ids: [args.fileId] }) : []
        if (!visible.some((f) => f.id === args.fileId)) throw new GatewayError('NOT_FOUND', 'Archivo no encontrado en esta empresa.', 404)
        const attachments = (row.attachments ?? []).some((a) => a.fileId === args.fileId) ? row.attachments : [...(row.attachments ?? []), { fileId: args.fileId }]
        if (records !== store) throw new GatewayError('CAPABILITY_UNAVAILABLE', 'Los adjuntos de este módulo se gestionan con sus rutas de archivos existentes.', 409)
        return toRecord(await store.updateRecord(ctx, entity.key, args.id, row.data, row.version, attachments))
      }
      case 'notifications.publish': return deliverNotification(ctx, args.to, args.title, args.body ?? null)
      case 'events.emit': {
        if (!def.events?.emits.includes(args.event)) throw new GatewayError('INVALID_ARGS', 'Evento no declarado por el módulo.', 422)
        await store.insertEvent(ctx, args.event, args.payload ?? {})
        return { emitted: args.event }
      }
      default: throw new GatewayError('CAPABILITY_DENIED', 'Operación desconocida.', 403)
    }
  }

  async function deliverNotification(ctx, recipients, title, body) {
    const members = new Set(await store.companyMembers(ctx, recipients))
    const allowed = recipients.filter((id) => members.has(id))
    if (allowed.length !== recipients.length) throw new GatewayError('PERMISSION_DENIED', 'Solo se puede notificar a miembros de la empresa.', 403)
    await store.insertNotifications(ctx, allowed, title, body)
    return { delivered: allowed.length }
  }

  // The single entry point for module calls.
  async function call({ operation, token, nonce, idempotencyKey = null, args }) {
    let claims = null
    const correlationId = randomUUID()
    let parsedArgs = null
    try {
      claims = signer.verify(token)
      signer.consumeNonce(nonce)
      const spec = Object.hasOwn(OPERATIONS, operation) ? OPERATIONS[operation] : null
      if (!spec) throw new GatewayError('CAPABILITY_DENIED', 'Operación desconocida.', 403)
      const entry = modules.get(claims.mod)
      if (!entry || entry.revoked || entry.grantVersion !== claims.gv) throw new GatewayError('MODULE_REVOKED', 'Las capacidades del módulo fueron revocadas.', 403)
      if (entry.packageHash !== claims.pkg) throw new GatewayError('MODULE_REVOKED', 'El paquete del módulo cambió.', 403)
      if (!claims.caps.includes(spec.cap) || !entry.approved.has(spec.cap)) throw new GatewayError('CAPABILITY_DENIED', `Capacidad no concedida: ${spec.cap}`, 403)
      const parsed = spec.args.safeParse(args)
      if (!parsed.success) throw new GatewayError('INVALID_ARGS', 'Argumentos inválidos.', 422, parsed.error.issues.slice(0, 5).map((i) => ({ path: i.path.join('.'), message: i.message })))
      parsedArgs = parsed.data
      const permissions = new Set(claims.perms)
      // Before quota and idempotency: a revoked permission never gets a cached answer.
      if (spec.perm) {
        const key = permissionKey(entry.def, parsed.data.entity ? entry.def.entities.find((e) => e.key === parsed.data.entity) : null, spec.perm)
        if (!key || !permissions.has(key)) throw new GatewayError('PERMISSION_DENIED', 'No tienes permiso para esta operación.', 403)
      }
      quota(claims, operation)
      if (spec.write) {
        if (!idempotencyKey || !/^[A-Za-z0-9_-]{8,64}$/.test(idempotencyKey)) throw new GatewayError('IDEMPOTENCY_KEY_REQUIRED', 'Las escrituras necesitan una clave de idempotencia.', 400)
        // Scoped to module + company (store) + user: one user's key never returns another's response.
        const previous = await store.getIdempotent(claims, `${claims.uid}:${idempotencyKey}`)
        if (previous) return previous
      }
      const result = await withTimeout(perform(operation, parsed.data, claims, entry, permissions))
      const response = { v: PROTOCOL_VERSION, data: result }
      if (spec.write) {
        await store.putIdempotent(claims, `${claims.uid}:${idempotencyKey}`, response)
        await store.audit(claims, `runtime.${operation}`, auditDetails(claims, operation, parsedArgs, { result: 'ok', correlationId }))
        await recordActivity(claims, entry, operation, parsedArgs, result)
      }
      return { ...response, correlationId }
    } catch (raw) {
      const error = raw instanceof GatewayError ? raw
        : raw instanceof RecordError ? new GatewayError(raw.code === 'FORBIDDEN' ? 'PERMISSION_DENIED' : raw.code, raw.message, raw.status)
        : raw?.code === 'VERSION_CONFLICT' ? new GatewayError('VERSION_CONFLICT', 'El registro cambió; recarga antes de guardar.', 409)
        : new GatewayError('CAPABILITY_FAILED', 'La operación falló.', 500)
      if (claims?.mod && claims?.cid) await store.audit(claims, `runtime.denied.${operation}`, auditDetails(claims, operation, parsedArgs, { result: 'denied', reason: error.code, correlationId })).catch(() => {})
      error.correlationId = correlationId
      throw error
    }
  }

  return { register, revoke, moduleOf, issueCallToken, call }
}
