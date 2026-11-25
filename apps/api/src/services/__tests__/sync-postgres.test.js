// Offline sync against a real PostgreSQL (scripts/test-sync-postgres.mjs creates the disposable container).
// Real service + real Prisma client + the real client SyncEngine (fake-indexeddb), wire format through JSON.
import { before, after, test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { createSyncService } from '../sync-service.js'
import { createSyncRouter } from '../../routes/sync.js'

// fake-indexeddb is a dependency of packages/offline, not of the API: resolve it from there.
await import(pathToFileURL(createRequire(new URL('../../../../../packages/offline/package.json', import.meta.url)).resolve('fake-indexeddb/auto')).href)
// Dexie reads the global indexedDB when it is imported, so the client modules load after the polyfill.
const { RunlyOfflineDatabase } = await import('../../../../../packages/offline/src/db.js')
const { SyncEngine } = await import('../../../../../packages/offline/src/sync-engine.js')

const url = process.env.RUNLY_SYNC_TEST_DATABASE_URL
const marker = process.env.RUNLY_SYNC_TEST_DISPOSABLE
if (!url || !/^runly-sync-test-[a-f0-9-]+$/.test(marker ?? '') || new URL(url).hostname !== '127.0.0.1') throw new Error('Run through scripts/test-sync-postgres.mjs (disposable loopback database only)')
if (execFileSync('docker', ['inspect', '--format', '{{index .Config.Labels "runly.test"}}', marker], { encoding: 'utf8' }).trim() !== 'sync') throw new Error('Not the labelled disposable container')

let db, svc, seq = 0
const T = Date.parse('2026-03-01T12:00:00.000Z')
const iso = (ms) => new Date(T + ms).toISOString()
const uuid = async () => (await db.$queryRaw`SELECT uuidv7()::text id`)[0].id

before(() => { db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) }); svc = createSyncService({ prisma: db }) })
after(async () => { await db?.$disconnect() })

async function tenant() {
  const n = ++seq
  const company = await db.company.create({ data: { id: await uuid(), name: `Sync ${n}`, slug: `sync-${n}` } })
  const authUserId = await uuid()
  await db.userProfile.create({ data: { id: await uuid(), authUserId, email: `sync-${n}@example.test`, displayName: 'Sync tester' } })
  return { companyId: company.id, authUserId }
}
// Bulk insert with explicit updated_at so ties and order are controlled; stamp(i) returns milliseconds from T.
async function seedDepartments(companyId, count, stamp, prefix = 'd') {
  await db.$executeRawUnsafe(
    `INSERT INTO hr_department (id, company_id, name, enabled, created_at, updated_at)
     SELECT uuidv7(), $1::uuid, $2 || g, true, now(), ($3::timestamp + ((${stamp}) * interval '1 millisecond'))
     FROM generate_series(1, $4) g`, companyId, prefix, '2026-03-01 12:00:00', count)
}
async function seedJobTitles(companyId, count, stamp) {
  await db.$executeRawUnsafe(
    `INSERT INTO hr_job_title (id, company_id, name, enabled, created_at, updated_at)
     SELECT uuidv7(), $1::uuid, 'j' || g, true, now(), ($2::timestamp + ((${stamp}) * interval '1 millisecond'))
     FROM generate_series(1, $3) g`, companyId, '2026-03-01 12:00:00', count)
}

let dbCounter = 0
async function engineFor(t, { fetchImpl, name } = {}) {
  const local = new RunlyOfflineDatabase(name ?? `sync-pg-${++dbCounter}`)
  await local.open()
  const engine = new SyncEngine({
    companyId: t.companyId, db: local, apiBaseUrl: 'http://api.test', getToken: async () => 'tok',
    fetchImpl: fetchImpl ?? (async (u) => {
      const q = new URL(u).searchParams
      const body = await svc.pull({ authUserId: t.authUserId, companyId: t.companyId, modules: q.get('modules').split(','), cursor: q.get('cursor') })
      return { ok: true, json: async () => JSON.parse(JSON.stringify(body)) } // the wire turns Dates into strings
    }),
  })
  return { engine, local }
}
const count = (local, entityType) => local.offline_records.where('entityType').equals(entityType).count()

test('every synced table keeps millisecond timestamps, so JS Dates round-trip exactly (cursor equality is sound)', async () => {
  const rows = await db.$queryRaw`SELECT table_name, data_type, datetime_precision FROM information_schema.columns WHERE column_name='updated_at' AND table_name IN ('contact','hr_employee','hr_department','hr_job_title','fleet_vehicle','fleet_driver','calendar_calendar','calendar_event','catalog_product','catalog_category','ledger_account','ledger_transaction','ledger_category','ledger_transaction_type')`
  assert.ok(rows.length >= 12, `found ${rows.length} tables`)
  for (const r of rows) assert.equal(Number(r.datetime_precision), 3, `${r.table_name}.updated_at is ${r.data_type}(${r.datetime_precision})`)
})

test('610 rows of one entity plus newer rows of another are all delivered (real ordering)', async () => {
  const t = await tenant()
  await seedDepartments(t.companyId, 610, `g`)
  await seedJobTitles(t.companyId, 10, `100000 + g`)
  const { engine, local } = await engineFor(t)
  const result = await engine.pull({ modules: ['runly.hr'] })
  assert.equal(result.complete, true)
  assert.equal(await count(local, 'department'), 610)
  assert.equal(await count(local, 'job_title'), 10)
})

test('1200 rows with exactly the same updatedAt page through the composite cursor without loss or repetition', async () => {
  const t = await tenant()
  await seedDepartments(t.companyId, 1200, `0`)
  const pages = []
  const { engine, local } = await engineFor(t, {
    fetchImpl: async (u) => {
      const q = new URL(u).searchParams
      const body = JSON.parse(JSON.stringify(await svc.pull({ authUserId: t.authUserId, companyId: t.companyId, modules: ['runly.hr'], cursor: q.get('cursor') })))
      pages.push({ cursor: q.get('cursor'), n: body.records.length, hasMore: body.hasMore })
      return { ok: true, json: async () => body }
    },
  })
  const result = await engine.pull({ modules: ['runly.hr'] })
  assert.equal(result.complete, true)
  assert.equal(await count(local, 'department'), 1200)
  assert.equal(pages.length, 3, JSON.stringify(pages))
  assert.match(pages[1].cursor, /^[^~]+~runly\.hr\/department~[0-9a-f-]{36}$/) // composite cursor in use
})

test('two entities truncated at once, interleaved timestamps', async () => {
  const t = await tenant()
  await seedDepartments(t.companyId, 700, `g * 2`)
  await seedJobTitles(t.companyId, 650, `g * 3`)
  const { engine, local } = await engineFor(t)
  assert.equal((await engine.pull({ modules: ['runly.hr'] })).complete, true)
  assert.equal(await count(local, 'department'), 700)
  assert.equal(await count(local, 'job_title'), 650)
})

test('more rows than the page cap: the pull reports incomplete, persists the cursor and a new engine finishes', async () => {
  const t = await tenant()
  await seedDepartments(t.companyId, 10_700, `g`)
  const name = `sync-pg-resume-${++dbCounter}`
  const first = await engineFor(t, { name })
  const r1 = await first.engine.pull({ modules: ['runly.hr'] })
  assert.equal(r1.complete, false)
  assert.equal(r1.pulled, 10_000)
  const states = await first.local.sync_state.toArray()
  assert.ok(states.every((s) => s.serverCursor), 'cursor persisted')
  first.local.close()
  const second = await engineFor(t, { name }) // same IndexedDB: resumes from the persisted cursor
  const r2 = await second.engine.pull({ modules: ['runly.hr'] })
  assert.equal(r2.complete, true)
  assert.equal(await count(second.local, 'department'), 10_700)
})

test('an interrupted pull resumes from the last completed page', async () => {
  const t = await tenant()
  await seedDepartments(t.companyId, 1300, `g`)
  const name = `sync-pg-interrupt-${++dbCounter}`
  let calls = 0
  const flaky = await engineFor(t, {
    name,
    fetchImpl: async (u) => {
      if (++calls === 2) throw new Error('network dropped')
      const q = new URL(u).searchParams
      const body = await svc.pull({ authUserId: t.authUserId, companyId: t.companyId, modules: ['runly.hr'], cursor: q.get('cursor') })
      return { ok: true, json: async () => JSON.parse(JSON.stringify(body)) }
    },
  })
  await assert.rejects(flaky.engine.pull({ modules: ['runly.hr'] }), /network dropped/)
  assert.equal(await count(flaky.local, 'department'), 500) // page 1 committed atomically
  flaky.local.close()
  const resumed = await engineFor(t, { name })
  assert.equal((await resumed.engine.pull({ modules: ['runly.hr'] })).complete, true)
  assert.equal(await count(resumed.local, 'department'), 1300)
})

test('incremental pulls bring only changes; a local pending change is not overwritten; plain ISO cursors still work', async () => {
  const t = await tenant()
  await seedDepartments(t.companyId, 5, `g`)
  const { engine, local } = await engineFor(t)
  await engine.pull({ modules: ['runly.hr'] })
  const [target] = await db.$queryRaw`SELECT id::text FROM hr_department WHERE company_id=${t.companyId}::uuid ORDER BY name LIMIT 1`
  await local.offline_records.update(['runly.hr', 'department', target.id], { dirty: true, data: { id: target.id, name: 'Local edit', companyId: t.companyId } })
  await db.$executeRaw`UPDATE hr_department SET name = 'Server edit', updated_at = ${new Date(T + 50_000)} WHERE id = ${target.id}::uuid`
  await seedDepartments(t.companyId, 1, `60000`, 'new')
  const result = await engine.pull({ modules: ['runly.hr'] })
  assert.equal(result.complete, true)
  assert.ok(result.pulled <= 4, `incremental pull returned ${result.pulled} rows`)
  assert.equal((await local.offline_records.get(['runly.hr', 'department', target.id])).data.name, 'Local edit') // pending change kept
  assert.equal(await count(local, 'department'), 6)
  // Older clients send a plain ISO cursor and ignore hasMore: still correct (rows strictly after the cursor).
  const old = await svc.pull({ authUserId: t.authUserId, companyId: t.companyId, modules: ['runly.hr'], cursor: iso(55_000) })
  assert.equal(old.records.length, 1)
})

test('another company never appears, and an unauthorised request is stopped before the service', async () => {
  const a = await tenant(), b = await tenant()
  await seedDepartments(a.companyId, 3, `g`, 'a')
  await seedDepartments(b.companyId, 4, `g`, 'b')
  const { engine, local } = await engineFor(a)
  await engine.pull({ modules: ['runly.hr'] })
  assert.equal(await count(local, 'department'), 3)
  assert.ok((await local.offline_records.toArray()).every((r) => r.data.companyId === a.companyId))
  // Route level: a revoked or foreign membership makes resolveTenantContext reject and no rows are read.
  let reads = 0
  const guarded = { ...db, hrDepartment: { findMany: async () => { reads++; return [] } } }
  const router = createSyncRouter({
    prisma: guarded,
    getUserContext: async () => ({ profile: { id: 'p' } }),
    resolveTenantContext: async (c) => ({ ok: false, response: c.json({ error: 'Sin acceso a la empresa.' }, 403) }),
  })
  const res = await router.request('/sync/pull?modules=runly.hr', { headers: { Authorization: 'Bearer x' } })
  assert.equal(res.status, 403)
  assert.equal(reads, 0)
})

test('calendar tombstones: a disabled calendar is sent as deleted after the first pull', async () => {
  const t = await tenant()
  const [profile] = await db.$queryRaw`SELECT id::text FROM user_profile WHERE auth_user_id=${t.authUserId}::uuid`
  const calendarId = await uuid()
  await db.$executeRaw`INSERT INTO calendar_calendar (id, company_id, owner_id, name, enabled, updated_at) VALUES (${calendarId}::uuid, ${t.companyId}::uuid, ${profile.id}::uuid, 'Mine', true, ${new Date(T)})`
  const { engine, local } = await engineFor(t)
  await engine.pull({ modules: ['runly.calendar'] })
  assert.equal(await count(local, 'calendar'), 1)
  await db.$executeRaw`UPDATE calendar_calendar SET enabled = false, updated_at = ${new Date(T + 1000)} WHERE id = ${calendarId}::uuid`
  await engine.pull({ modules: ['runly.calendar'] })
  assert.equal(await count(local, 'calendar'), 0)
})
