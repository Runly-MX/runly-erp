export class SyncPushServiceError extends Error {
  constructor(message, status = 500, code = 'sync_push_error') {
    super(message)
    this.name = 'SyncPushServiceError'
    this.status = status
    this.code = code
  }
}

const MUTATION_EXPIRY_HOURS = 72

function makePushHandler(entityType, prismaKey) {
  return {
    entityType,
    async findById({ prisma, id }) {
      return prisma[prismaKey].findUnique({ where: { id } })
    },
    async create({ prisma, companyId, recordId, payload }) {
      const data = { ...payload, companyId }
      if (recordId) data.id = recordId
      return prisma[prismaKey].create({ data })
    },
    async update({ prisma, recordId, payload }) {
      return prisma[prismaKey].update({ where: { id: recordId }, data: payload })
    },
  }
}

const PUSH_MODULE_REGISTRY = {
  'runly.contacts': {
    strategy: 'last-write-wins',
    handlers: {
      contact: makePushHandler('contact', 'contact'),
    },
  },
  'runly.hr': {
    strategy: 'last-write-wins',
    handlers: {
      employee: makePushHandler('employee', 'hrEmployee'),
      department: makePushHandler('department', 'hrDepartment'),
      job_title: makePushHandler('job_title', 'hrJobTitle'),
    },
  },
  'custom.fleet': {
    strategy: 'last-write-wins',
    handlers: {
      vehicle: makePushHandler('vehicle', 'fleetVehicle'),
      driver: makePushHandler('driver', 'fleetDriver'),
    },
  },
  'runly.catalog': {
    strategy: 'last-write-wins',
    handlers: {
      product: makePushHandler('product', 'catalogProduct'),
      category: makePushHandler('category', 'catalogCategory'),
    },
  },
}

// Atlas-spelled keys alias the same handler config: existing installs still
// report their module key as "atlas.*", fresh installs report "runly.*".
PUSH_MODULE_REGISTRY['atlas.contacts'] = PUSH_MODULE_REGISTRY['runly.contacts']
PUSH_MODULE_REGISTRY['atlas.hr'] = PUSH_MODULE_REGISTRY['runly.hr']
PUSH_MODULE_REGISTRY['atlas.catalog'] = PUSH_MODULE_REGISTRY['runly.catalog']

export function createSyncPushService({ prisma, registry }) {
  const moduleRegistry = registry ?? PUSH_MODULE_REGISTRY
  // activeCompanyId: the caller's validated active company, resolved by the
  // API's tenant middleware and threaded down from routes/sync.js — never
  // re-derived here. See
  // docs/superpowers/specs/2026-09-10-multi-tenant-architecture-design.md §5.
  async function resolveContext(authUserId, activeCompanyId) {
    const profile = await prisma.userProfile.findUnique({
      where: { authUserId },
      select: { id: true },
    })
    if (!profile) {
      throw new SyncPushServiceError('Perfil de usuario no encontrado.', 404, 'profile_not_found')
    }
    if (activeCompanyId) {
      return { companyId: activeCompanyId, userId: profile.id }
    }
    const membership = await prisma.membership.findFirst({
      where: { userId: profile.id, enabled: true },
      orderBy: { createdAt: 'desc' },
      select: { companyId: true },
    })
    if (!membership?.companyId) {
      throw new SyncPushServiceError('No tienes una empresa activa.', 403, 'no_active_company')
    }
    return { companyId: membership.companyId, userId: profile.id }
  }

  async function push({ authUserId, companyId: activeCompanyId, mutations }) {
    if (!mutations || mutations.length === 0) {
      return { results: [] }
    }

    const { companyId, userId } = await resolveContext(authUserId, activeCompanyId)
    const results = []

    for (const mutation of mutations) {
      const { idempotencyKey, moduleKey, entityType, operation, recordId, payload, clientUpdatedAt } = mutation

      // 1. Idempotency check — if already applied, return OK
      const existingLog = await prisma.syncMutationLog.findUnique({ where: { idempotencyKey } })
      if (existingLog) {
        const canonicalModule = (key) => String(key ?? '').replace(/^atlas\./, 'runly.')
        if (existingLog.companyId !== companyId || canonicalModule(existingLog.moduleKey) !== canonicalModule(moduleKey)
          || existingLog.entityType !== entityType || existingLog.operation !== operation
          || (recordId && existingLog.recordId !== recordId)) {
          results.push({ idempotencyKey, status: 'PERMISSION_DENIED', record: null })
          continue
        }
        const mod = moduleRegistry[moduleKey]
        let record = null
        if (mod) {
          const handler = mod.handlers[entityType]
          const lookupId = existingLog.recordId ?? recordId
          if (handler && lookupId) {
            record = await handler.findById({ prisma, id: lookupId }).catch(() => null)
          }
        }
        if (record && record.companyId !== companyId) results.push({ idempotencyKey, status: 'PERMISSION_DENIED', record: null })
        else results.push({ idempotencyKey, status: 'OK', record })
        continue
      }

      // 2. Resolve module + handler
      const mod = moduleRegistry[moduleKey]
      if (!mod) {
        results.push({ idempotencyKey, status: 'ERROR', record: null })
        continue
      }
      const handler = mod.handlers[entityType]
      if (!handler) {
        results.push({ idempotencyKey, status: 'ERROR', record: null })
        continue
      }

      // 3. Apply mutation
      try {
        let record = null

        if (operation === 'CREATE') {
          record = await handler.create({ prisma, companyId, recordId: recordId ?? null, payload: payload ?? {} })
        } else if (operation === 'UPDATE') {
          const existing = await handler.findById({ prisma, id: recordId })
          if (!existing) {
            results.push({ idempotencyKey, status: 'NOT_FOUND', record: null })
            continue
          }
          if (existing.companyId !== companyId) {
            results.push({ idempotencyKey, status: 'PERMISSION_DENIED', record: null })
            continue
          }

          // Conflict detection for conflict-ui modules
          if (mod.strategy === 'conflict-ui' && clientUpdatedAt != null && existing.updatedAt != null) {
            const serverTs = existing.updatedAt instanceof Date
              ? existing.updatedAt.toISOString()
              : String(existing.updatedAt)
            if (serverTs !== clientUpdatedAt) {
              results.push({ idempotencyKey, status: 'CONFLICT', record: existing })
              continue
            }
          }

          record = await handler.update({ prisma, recordId, payload: payload ?? {} })
        } else {
          results.push({ idempotencyKey, status: 'ERROR', record: null })
          continue
        }

        // 4. Write idempotency log
        const expiresAt = new Date(Date.now() + MUTATION_EXPIRY_HOURS * 60 * 60 * 1000)
        await prisma.syncMutationLog.create({
          data: {
            idempotencyKey,
            companyId,
            userId,
            moduleKey,
            entityType,
            operation,
            recordId: record?.id ?? recordId ?? null,
            expiresAt,
          },
        })

        results.push({ idempotencyKey, status: 'OK', record })
      } catch {
        results.push({ idempotencyKey, status: 'ERROR', record: null })
      }
    }

    return { results }
  }

  return { push }
}
