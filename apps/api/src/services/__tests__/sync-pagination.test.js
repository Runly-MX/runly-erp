import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

const SERVICE = process.env.SYNC_SERVICE_UNDER_TEST ?? '../sync-service.js'
const { createSyncService } = await import(SERVICE)

const COMPANY_ID = '01900000-0000-7000-8000-000000000001'
const T0 = Date.parse('2026-01-01T00:00:00.000Z')

// In-memory table honouring where.updatedAt.gt / orderBy updatedAt asc / take, like Prisma.
function matches(r, where) {
  const u = where.updatedAt
  if (u && !(u.gt ? r.updatedAt > u.gt : u.gte ? r.updatedAt >= u.gte : true)) return false
  return (where.AND ?? []).every((c) => c.OR.some((o) => (o.updatedAt?.gt ? r.updatedAt > o.updatedAt.gt : r.updatedAt.getTime() === o.updatedAt.getTime() && r.id > o.id.gt)))
}
function table(rows) {
  return {
    findMany: async ({ where, take }) => rows
      .filter((r) => matches(r, where))
      .sort((a, b) => a.updatedAt - b.updatedAt || (a.id < b.id ? -1 : 1))
      .slice(0, take),
  }
}
const row = (id, ms) => ({ id, companyId: COMPANY_ID, updatedAt: new Date(T0 + ms) })

function prismaWith({ employees, departments }) {
  const none = { findMany: async () => [] }
  return {
    userProfile: { findUnique: async () => ({ id: 'u' }) },
    hrEmployee: table(employees), hrDepartment: table(departments), hrJobTitle: none,
  }
}

// Client loop: same cursor use as SyncEngine (next pull starts from the previous nextCursor).
async function drain(prisma) {
  const svc = createSyncService({ prisma })
  const seen = new Set()
  let cursor = null
  for (let i = 0; i < 20; i++) {
    const res = await svc.pull({ authUserId: 'a', companyId: COMPANY_ID, modules: ['runly.hr'], cursor })
    res.records.forEach((r) => seen.add(`${r.entityType}:${r.id}`))
    if (!res.hasMore || res.nextCursor === cursor) break
    cursor = res.nextCursor
  }
  return seen
}

describe('sync/pull pagination', () => {
  it('delivers every record when one entity exceeds the page limit and another is newer', async () => {
    const employees = Array.from({ length: 600 }, (_, i) => row(`e${i}`, i))
    const departments = Array.from({ length: 10 }, (_, i) => row(`d${i}`, 10_000 + i))
    const seen = await drain(prismaWith({ employees, departments }))
    assert.equal(seen.size, 610)
  })

  it('does not skip rows tied at the page boundary', async () => {
    const employees = Array.from({ length: 700 }, (_, i) => row(`e${i}`, i < 495 ? i : 495 + (i % 3)))
    const seen = await drain(prismaWith({ employees, departments: [] }))
    assert.equal(seen.size, 700)
  })
})

describe('sync/pull pagination limits', () => {
  it('delivers more than one page of rows sharing the exact same updatedAt', async () => {
    const employees = Array.from({ length: 1200 }, (_, i) => row(`e${String(i).padStart(4, '0')}`, 5))
    const seen = await drain(prismaWith({ employees, departments: [] }))
    assert.equal(seen.size, 1200)
  })

  it('delivers everything when two entities are truncated at once and interleaved', async () => {
    const employees = Array.from({ length: 700 }, (_, i) => row(`e${i}`, i * 2))
    const departments = Array.from({ length: 650 }, (_, i) => row(`d${i}`, i * 3))
    const seen = await drain(prismaWith({ employees, departments }))
    assert.equal(seen.size, 1350)
  })
})

describe('sync/pull tombstones', () => {
  it('incremental pulls carry a disabled calendar as deleted; the first pull skips it', async () => {
    const wheres = []
    const prisma = {
      userProfile: { findUnique: async () => ({ id: 'u' }) },
      calendarCalendar: { findMany: async ({ where }) => { wheres.push(where); return [{ id: 'k1', enabled: false, updatedAt: new Date(T0) }] } },
      calendarEvent: { findMany: async () => [] },
    }
    const svc = createSyncService({ prisma })
    const first = await svc.pull({ authUserId: 'a', companyId: COMPANY_ID, modules: ['runly.calendar'], cursor: null })
    assert.equal(wheres[0].enabled, true)
    assert.equal(first.records[0].deleted, true)
    await svc.pull({ authUserId: 'a', companyId: COMPANY_ID, modules: ['runly.calendar'], cursor: new Date(T0 - 1).toISOString() })
    assert.equal(wheres.filter((w) => w.updatedAt).at(-1).enabled, undefined)
  })
})
