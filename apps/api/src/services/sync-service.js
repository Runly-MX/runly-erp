export class SyncServiceError extends Error {
  constructor(message, status = 500, code = 'sync_error') {
    super(message)
    this.name = 'SyncServiceError'
    this.status = status
    this.code = code
  }
}

const RECORDS_LIMIT = 500
// Folds the cursor condition into `where` without clobbering an existing OR (ledger categories).
function attachAfter(where, cursor, entityKey) {
  const cond = afterCursor(cursor, entityKey)
  if (cond.OR) where.AND = [...(where.AND ?? []), { OR: cond.OR }]
  else Object.assign(where, cond)
}
const ORDER = [{ updatedAt: 'asc' }, { id: 'asc' }]

// Cursor formats (the client treats it as an opaque string):
//   "<ISO>"                   plain: rows with updatedAt > ISO (clients and responses before the composite form)
//   "<ISO>~<entityKey>~<id>"  composite: the entity named by entityKey resumes strictly after (updatedAt, id),
//                             so any number of rows sharing one updatedAt can be paged; every other entity
//                             re-reads from updatedAt >= ISO (idempotent upserts on the client).
export function parseCursor(cursor) {
  if (!cursor) return null
  const [iso, key, ...rest] = String(cursor).split('~')
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return null
  return { at, key: key ?? null, id: key ? rest.join('~') : null }
}

// Prisma `where` fragment for one entity (entityKey = "<moduleKey>/<entityType>").
export function afterCursor(cursor, entityKey) {
  const c = parseCursor(cursor)
  if (!c) return {}
  if (!c.key) return { updatedAt: { gt: c.at } }
  if (c.key !== entityKey) return { updatedAt: { gte: c.at } }
  return { OR: [{ updatedAt: { gt: c.at } }, { updatedAt: c.at, id: { gt: c.id } }] }
}
const FETCH_CONCURRENCY = 4

function makeHandler(entityType, prismaKey) {
  return {
    entityType,
    async fetch({ prisma, companyId, cursor, limit, entityKey }) {
      const where = { companyId }
      attachAfter(where, cursor, entityKey)
      return prisma[prismaKey].findMany({
        where,
        take: limit,
        orderBy: ORDER,
      })
    },
    toRecord(row) {
      return {
        id: row.id,
        data: row,
        version: row.updatedAt.toISOString(),
        deleted: false,
      }
    },
  }
}

const SYNC_MODULE_REGISTRY = {
  'runly.contacts': {
    handlers: [makeHandler('contact', 'contact')],
  },
  'runly.hr': {
    handlers: [
      makeHandler('employee', 'hrEmployee'),
      makeHandler('department', 'hrDepartment'),
      makeHandler('job_title', 'hrJobTitle'),
    ],
  },
  'custom.fleet': {
    handlers: [
      makeHandler('vehicle', 'fleetVehicle'),
      makeHandler('driver', 'fleetDriver'),
    ],
  },
  'runly.calendar': {
    handlers: [
      {
        entityType: 'calendar',
        async fetch({ prisma, companyId, userId, cursor, limit, entityKey }) {
          const where = { companyId, ownerId: userId }
          // First pull: live rows only. Incremental pulls also carry disabled rows as tombstones.
          if (!cursor) where.enabled = true
          attachAfter(where, cursor, entityKey)
          return prisma.calendarCalendar.findMany({
            where,
            take: limit,
            orderBy: ORDER,
          })
        },
        toRecord(row) {
          return { id: row.id, data: row, version: row.updatedAt.toISOString(), deleted: row.enabled === false }
        },
      },
      {
        entityType: 'event',
        async fetch({ prisma, companyId, userId, cursor, limit, entityKey }) {
          const owned = await prisma.calendarCalendar.findMany({
            where: { companyId, ownerId: userId, enabled: true },
            select: { id: true },
          })
          const calendarIds = owned.map((c) => c.id)
          if (!calendarIds.length) return []
          const where = { calendarId: { in: calendarIds } }
          if (!cursor) where.enabled = true
          attachAfter(where, cursor, entityKey)
          return prisma.calendarEvent.findMany({
            where,
            take: limit,
            orderBy: ORDER,
          })
        },
        toRecord(row) {
          return { id: row.id, data: row, version: row.updatedAt.toISOString(), deleted: row.enabled === false }
        },
      },
    ],
  },
  'runly.catalog': {
    handlers: [
      makeHandler('product', 'catalogProduct'),
      makeHandler('category', 'catalogCategory'),
    ],
  },
  'runly.ledger': {
    // runly.ledger accounts are NOT company-wide: each account is private to its
    // owner unless explicitly shared via ledger_account_member/ledger_group_member
    // (see apps/api/src/routes/ledger/ledger-service.js canReadAccount). The generic
    // makeHandler() only filters by companyId, which would silently sync every
    // company member's private accounts and transactions to every other member's
    // offline cache — so these two entity types need a scoped fetch instead.
    handlers: [
      {
        entityType: 'account',
        async fetch({ prisma, companyId, userId, cursor, limit, entityKey }) {
          const accessible = await prisma.$queryRaw`
            SELECT a.id FROM ledger_account a
            WHERE a.company_id = ${companyId}::uuid
              AND (
                a.owner_id = ${userId}::uuid
                OR EXISTS (
                  SELECT 1 FROM ledger_account_member m
                  WHERE m.account_id = a.id AND m.user_id = ${userId}::uuid AND m.status = 'active'
                )
                OR EXISTS (
                  SELECT 1 FROM ledger_group_member gm
                  WHERE gm.group_id = a.group_id AND gm.user_id = ${userId}::uuid AND gm.status = 'active'
                )
              )
          `
          const ids = accessible.map((r) => r.id)
          if (ids.length === 0) return []
          const where = { companyId, id: { in: ids } }
          attachAfter(where, cursor, entityKey)
          return prisma.ledgerAccount.findMany({ where, take: limit, orderBy: ORDER })
        },
        toRecord(row) {
          return { id: row.id, data: row, version: row.updatedAt.toISOString(), deleted: false }
        },
      },
      {
        entityType: 'transaction',
        async fetch({ prisma, companyId, userId, cursor, limit, entityKey }) {
          const accessible = await prisma.$queryRaw`
            SELECT a.id FROM ledger_account a
            WHERE a.company_id = ${companyId}::uuid
              AND (
                a.owner_id = ${userId}::uuid
                OR EXISTS (
                  SELECT 1 FROM ledger_account_member m
                  WHERE m.account_id = a.id AND m.user_id = ${userId}::uuid AND m.status = 'active'
                )
                OR EXISTS (
                  SELECT 1 FROM ledger_group_member gm
                  WHERE gm.group_id = a.group_id AND gm.user_id = ${userId}::uuid AND gm.status = 'active'
                )
              )
          `
          const ids = accessible.map((r) => r.id)
          if (ids.length === 0) return []
          const where = { companyId, accountId: { in: ids } }
          attachAfter(where, cursor, entityKey)
          return prisma.ledgerTransaction.findMany({ where, take: limit, orderBy: ORDER })
        },
        toRecord(row) {
          return { id: row.id, data: row, version: row.updatedAt.toISOString(), deleted: false }
        },
      },
      {
        entityType: 'category',
        async fetch({ prisma, companyId, userId, cursor, limit, entityKey }) {
          // Matches categories-service.js: system categories (ownerId null) + own personal ones.
          const where = { companyId, OR: [{ ownerId: null }, { ownerId: userId }] }
          attachAfter(where, cursor, entityKey)
          return prisma.ledgerCategory.findMany({ where, take: limit, orderBy: ORDER })
        },
        toRecord(row) {
          return { id: row.id, data: row, version: row.updatedAt.toISOString(), deleted: false }
        },
      },
      makeHandler('transaction_type', 'ledgerTransactionType'),
    ],
  },
}

// Atlas-spelled keys alias the same handler config: existing installs still
// report their module key as "atlas.*", fresh installs report "runly.*".
SYNC_MODULE_REGISTRY['atlas.contacts'] = SYNC_MODULE_REGISTRY['runly.contacts']
SYNC_MODULE_REGISTRY['atlas.hr'] = SYNC_MODULE_REGISTRY['runly.hr']
SYNC_MODULE_REGISTRY['atlas.calendar'] = SYNC_MODULE_REGISTRY['runly.calendar']
SYNC_MODULE_REGISTRY['atlas.catalog'] = SYNC_MODULE_REGISTRY['runly.catalog']
SYNC_MODULE_REGISTRY['atlas.ledger'] = SYNC_MODULE_REGISTRY['runly.ledger']

export function createSyncService({ prisma }) {
  // activeCompanyId: the caller's validated active company, resolved by the
  // API's tenant middleware and threaded down from routes/sync.js — never
  // re-derived here. See
  // docs/superpowers/specs/2026-09-10-multi-tenant-architecture-design.md §5.
  async function resolveCompanyContext(authUserId, activeCompanyId) {
    const profile = await prisma.userProfile.findUnique({
      where: { authUserId },
      select: { id: true },
    })
    if (!profile) {
      throw new SyncServiceError('Perfil de usuario no encontrado.', 404, 'profile_not_found')
    }
    if (!activeCompanyId) {
      // Never guess: an unresolved active company (e.g. a system-admin
      // request with no company header) must reject, not silently fall
      // back to whichever membership was created first/last.
      throw new SyncServiceError('No tienes una empresa activa.', 403, 'no_active_company')
    }
    return { companyId: activeCompanyId, userId: profile.id }
  }

  async function pull({ authUserId, companyId: activeCompanyId, modules, cursor }) {
    if (!modules || modules.length === 0) {
      return { records: [], nextCursor: cursor ?? null, hasMore: false }
    }

    const { companyId, userId } = await resolveCompanyContext(authUserId, activeCompanyId)
    const records = []
    let hasMore = false

    // Handlers are independent reads: run them concurrently; results are indexed by job, so the
    // module/handler order of the response is identical to the sequential one.
    const jobs = modules.flatMap((moduleKey) =>
      (SYNC_MODULE_REGISTRY[moduleKey]?.handlers ?? []).map((handler) => ({ moduleKey, handler })))
    const fetched = new Array(jobs.length)
    let next = 0
    // At most FETCH_CONCURRENCY reads in flight per request, so one pull cannot hog the connection pool.
    await Promise.all(Array.from({ length: Math.min(FETCH_CONCURRENCY, jobs.length) }, async () => {
      while (next < jobs.length) {
        const i = next++
        fetched[i] = await jobs[i].handler.fetch({ prisma, companyId, userId, cursor, limit: RECORDS_LIMIT + 1, entityKey: `${jobs[i].moduleKey}/${jobs[i].handler.entityType}` })
      }
    }))
    // A truncated entity resumes from its own last row (exact composite cursor on updatedAt + id), not from the
    // newest row of another entity, so neither older rows of that entity nor rows tied at the page boundary are
    // skipped, and any number of rows sharing one updatedAt still advances. With several truncated entities the
    // earliest last row wins; the others re-read from that time (idempotent upserts on the client).
    let resume = null
    jobs.forEach(({ moduleKey, handler }, i) => {
      const rows = fetched[i]
      if (rows.length > RECORDS_LIMIT) {
        hasMore = true
        rows.splice(RECORDS_LIMIT)
        const last = rows[rows.length - 1]
        const at = handler.toRecord(last).version
        if (resume === null || at < resume.at || (at === resume.at && last.id < resume.id)) {
          resume = { at, id: last.id, key: `${moduleKey}/${handler.entityType}` }
        }
      }
      for (const row of rows) {
        records.push({ moduleKey, entityType: handler.entityType, ...handler.toRecord(row) })
      }
    })

    const nextCursor = hasMore
      ? `${resume.at}~${resume.key}~${resume.id}`
      : records.length > 0
        ? records.reduce((max, r) => (r.version > max ? r.version : max), records[0].version)
        : cursor ?? null

    return { records, nextCursor, hasMore }
  }

  async function getStatus({ authUserId, companyId: activeCompanyId }) {
    const { companyId } = await resolveCompanyContext(authUserId, activeCompanyId)
    const cursors = await prisma.syncCursor.findMany({
      where: { companyId },
      orderBy: [{ moduleKey: 'asc' }, { entityType: 'asc' }],
    })
    return cursors.map((c) => ({
      moduleKey: c.moduleKey,
      entityType: c.entityType,
      cursor: c.cursor.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    }))
  }

  return { pull, getStatus }
}
