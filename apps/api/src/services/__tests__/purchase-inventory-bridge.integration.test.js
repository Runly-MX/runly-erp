// Real transactions and concurrent requests; only a freshly created disposable DB.
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import pg from 'pg'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Hono } from 'hono'
import { createPurchasesRouter } from '../../routes/purchases/index.js'
import { createInventoryService } from '../inventory-service.js'
import { createInventoryLabelService } from '../inventory-label-service.js'
import { resetVersionsProbe } from '../purchases-shared.js'

const url = process.env.PURCHASES_DOCUMENTARY_TEST_DATABASE_URL
if (url) {
  const target = new URL(url)
  if (!['127.0.0.1', 'localhost'].includes(target.hostname) || target.pathname !== '/runly_documentary_test') throw Error('Disposable local runly_documentary_test required')
}
const A = '01a00000-0000-7000-8000-00000000001a'
const B = '01a00000-0000-7000-8000-00000000001b'
const ACTOR = '01a00000-0000-7000-8000-0000000001a1'
const ALL = ['purchases.access', 'purchases.read', 'purchases.order.create', 'purchases.order.read', 'purchases.order.update',
  'purchases.invoice.create', 'purchases.invoice.read', 'purchases.invoice.update', 'purchases.settings.read', 'purchases.settings.manage',
  'purchases.relation.read', 'purchases.relation.manage', 'purchases.receipt.create', 'purchases.receipt.read', 'inventory.item.create', 'inventory.item.read']

describe('purchase/inventory atomic identity on disposable PostgreSQL', { skip: !url }, () => {
  let pool, prisma, authUserId, model, type, firstOrder, firstLine, firstItems
  const published = []
  const apps = new Map()
  const call = async (method, path, payload, { db = prisma, company = A, permissions = ALL } = {}) => {
    const key = `${company}:${permissions.join(',')}`
    let app = db === prisma ? apps.get(key) : null
    if (!app) {
      const requirePermission = permission => async (c, next) => {
        c.set('companyId', company); c.set('authUserId', authUserId)
        c.set('userContext', { profile: { id: ACTOR }, permissionSet: new Set(permissions), isAdmin: false })
        if (!permissions.includes(permission)) return c.json({ code: 'FORBIDDEN' }, 403)
        await next()
      }
      app = new Hono()
      app.route('/', createPurchasesRouter({ prisma: db, requirePermission, broadcaster: { broadcastToCompany: async (...args) => published.push(args) } }))
      if (db === prisma) apps.set(key, app)
    }
    const res = await app.request(path, { method, headers: { 'Content-Type': 'application/json' }, ...(payload ? { body: JSON.stringify(payload) } : {}) })
    return { status: res.status, body: await res.json() }
  }
  const order = async (quantity = 2) => {
    const res = await call('POST', '/purchases/orders', { lines: [{ description: 'Gabinete físico', quantity, unitAmount: 125.5 }] })
    assert.equal(res.status, 201, JSON.stringify(res.body))
    const doc = res.body.data
    const line = await prisma.purchaseLine.findFirst({ where: { ownerId: doc.id } })
    return { doc, line }
  }
  const create = (line, items, key, options) => call('POST', `/purchases/lines/${line.id}/inventory`, { items, ...(key ? { idempotencyKey: key } : {}) }, options)
  const relate = (sourceType, sourceId, itemId) => call('POST', '/purchases/relations', { sourceType, sourceId, targetType: 'inventory_item', targetId: itemId })
  const inventoryRows = () => prisma.invItem.findMany({ where: { companyId: A }, orderBy: { id: 'asc' } })
  const snapshot = async () => ({
    items: await inventoryRows(),
    relations: await prisma.entityRelation.count(), allocations: await prisma.purchaseAllocation.count(),
    audits: await prisma.auditLog.count(), outbox: await prisma.domainEventOutbox.count(), activities: await prisma.activity.count(),
    folios: await prisma.invFolioCounter.findMany({ orderBy: { prefix: 'asc' } }), broadcasts: published.length,
  })
  // Fail after a real write, not before it: PostgreSQL must undo that write too.
  const failing = (modelName, method, nth = 1) => {
    let injected = false
    return new Proxy(prisma, { get(target, prop) {
      if (prop === '$faultInjected') return injected
      if (prop !== '$transaction') return target[prop]
      return fn => target.$transaction(tx => {
        let count = 0
        return fn(new Proxy(tx, { get(client, name) {
          if (name !== modelName) return client[name]
          return new Proxy(client[name], { get(delegate, operation) {
            if (operation !== method) return delegate[operation]
            return async (...args) => {
              const result = await delegate[operation](...args)
              if (++count === nth) { injected = true; throw Error('INJECTED_BATCH_FAILURE') }
              return result
            }
          } })
        } }))
      }, { timeout: 30_000 })
    } })
  }
  before(async () => {
    pool = new pg.Pool({ connectionString: url })
    await pool.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public')
    const require = createRequire(import.meta.url)
    const ddl = execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'diff', '--from-empty', '--to-schema', 'prisma/schema.prisma', '--script'], { cwd: new URL('../../../../..', import.meta.url), encoding: 'utf8', maxBuffer: 8e6 })
    await pool.query(ddl)
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) })
    resetVersionsProbe()
    for (const [id, slug] of [[A, 'bridge-a'], [B, 'bridge-b']]) await prisma.company.create({ data: { id, slug, name: slug } })
    const actor = await prisma.$queryRaw`INSERT INTO user_profile (id,auth_user_id,display_name,email,updated_at) VALUES (${ACTOR}::uuid,gen_random_uuid(),'Operadora','bridge@example.test',now()) RETURNING auth_user_id`
    authUserId = actor[0].auth_user_id
    await prisma.runlyModule.create({ data: { key: 'runly.inventory', name: 'Inventarios', version: '0.1.0', manifest: {}, enabled: true, status: 'INSTALLED' } })
    type = await prisma.invCategory.create({ data: { companyId: A, name: 'Gabinete', code: 'GAB' } })
    const brand = await prisma.invBrand.create({ data: { companyId: A, name: 'Fabricante', code: 'FAB' } })
    model = await prisma.invModel.create({ data: { companyId: A, name: 'Rack', nameKey: 'rack', code: 'RACK', typeId: type.id, brandId: brand.id } })
    assert.equal((await call('PUT', '/purchases/settings', { preset: 'INVENTORY' })).status, 200)
  })
  after(async () => { await prisma?.$disconnect(); await pool?.end() })

  it('01 one order creates two individually identifiable physical goods', async () => {
    const { doc, line } = await order()
    firstOrder = doc; firstLine = line
    const res = await create(line, [{ name: 'Rack', modelId: model.id, categoryId: type.id }, { name: 'Rack', modelId: model.id, categoryId: type.id }], 'first-pair')
    assert.equal(res.status, 201, JSON.stringify(res.body))
    firstItems = res.body.data
    assert.equal(new Set(firstItems.map(i => i.id)).size, 2)
    assert.equal(await prisma.purchaseAllocation.count({ where: { purchaseLineId: line.id } }), 2)
    for (const item of firstItems) {
      assert.equal(await prisma.entityRelation.count({ where: { sourceId: doc.id, targetId: item.id, origin: 'AUTOMATIC' } }), 1)
      assert.equal(await prisma.auditLog.count({ where: { entityId: item.id, action: 'inventory.item.created', actorId: ACTOR, companyId: A } }), 1)
      assert.equal(await prisma.domainEventOutbox.count({ where: { event: 'inventory.item.created', payload: { path: ['id'], equals: item.id } } }), 1)
    }
  })
  it('02 same model gets different Runly folios, independent of asset number and internal ID', async () => {
    const rows = await inventoryRows()
    assert.equal(new Set(rows.map(i => i.folio)).size, 2)
    for (const row of rows) {
      assert.match(row.folio, /^GAB-RACK-\d+$/)
      assert.notEqual(row.id, row.folio); assert.equal(row.assetTag, null)
      assert.equal(row.modelId, model.id); assert.equal(row.assignedToId, null)
    }
  })
  it('03 goods without manufacturer serial can be registered', async () => {
    const rows = await inventoryRows()
    assert.equal(rows.length, 2)
    for (const row of rows) assert.equal(row.serialNumber, null)
  })
  it('04 reuses an existing good, preserving one live order and invoice per item', async () => {
    const inv = createInventoryService({ prisma })
    const existing = await inv.createItem({ name: 'Mueble existente', assetTag: 'MUEBLE-01' }, A, authUserId)
    const { doc } = await order()
    const count = await prisma.invItem.count()
    assert.equal((await relate('purchase_order', doc.id, existing.id)).status, 201)
    assert.equal((await relate('purchase_order', doc.id, existing.id)).status, 201)
    const other = await order()
    assert.equal((await relate('purchase_order', other.doc.id, existing.id)).body.code, 'ITEM_LINK_EXISTS')
    const invoice = (await call('POST', '/purchases/invoices', { total: 25 })).body.data
    const invoice2 = (await call('POST', '/purchases/invoices', { total: 25 })).body.data
    assert.equal((await relate('purchase_invoice', invoice.id, existing.id)).status, 201)
    assert.equal((await relate('purchase_invoice', invoice2.id, existing.id)).body.code, 'ITEM_LINK_EXISTS')
    assert.equal(await prisma.invItem.count(), count)
  })
  it('05 failed relations undo all new items, folios, audits, events and allocations', async () => {
    const { line } = await order()
    const before = await snapshot()
    const db = failing('entityRelation', 'createMany')
    const res = await create(line, [{ name: 'Uno' }, { name: 'Dos' }], 'fail-relations', { db })
    assert.equal(res.status, 500)
    assert.equal(db.$faultInjected, true)
    assert.deepEqual(await snapshot(), before)
  })
  it('05b failure after the second item and failure after allocations both roll back the complete batch', async () => {
    for (const [delegate, method, nth] of [['invItem', 'create', 2], ['purchaseAllocation', 'createMany', 1], ['auditLog', 'create', 3]]) {
      const { line } = await order()
      const before = await snapshot()
      const db = failing(delegate, method, nth)
      assert.equal((await create(line, [{ name: 'Uno' }, { name: 'Dos' }], `fail-${delegate}`, { db })).status, 500)
      assert.equal(db.$faultInjected, true)
      assert.deepEqual(await snapshot(), before, delegate)
    }
  })
  it('06 replay after success or failure does not duplicate items or relations; changed payload is rejected', async () => {
    const before = await snapshot()
    const replay = await create(firstLine, [{ name: 'Rack', modelId: model.id, categoryId: type.id }, { name: 'Rack', modelId: model.id, categoryId: type.id }], 'first-pair')
    assert.equal(replay.status, 201); assert.deepEqual(replay.body.data, firstItems)
    assert.deepEqual(await snapshot(), before)
    const { line } = await order(4)
    assert.equal((await create(line, [{ name: 'Uno' }], 'retry-failed', { db: failing('purchaseAllocation', 'createMany') })).status, 500)
    const success = await create(line, [{ name: 'Uno' }], 'retry-failed')
    assert.equal(success.status, 201)
    assert.deepEqual((await create(line, [{ name: 'Uno' }], 'retry-failed')).body.data, success.body.data)
    assert.equal((await create(line, [{ name: 'Otro' }], 'retry-failed')).body.code, 'IDEMPOTENCY_KEY_REUSED')
    assert.equal(await prisma.purchaseAllocation.count({ where: { purchaseLineId: line.id } }), 1)
  })
  it('06b concurrent identical operation keys have one outcome, distinct operations cannot exceed line capacity', async () => {
    const { line } = await order(2)
    const payload = [{ name: 'Gabinete A' }, { name: 'Gabinete B' }]
    const same = await Promise.all([create(line, payload, 'concurrent-same'), create(line, payload, 'concurrent-same')])
    assert.deepEqual(same.map(r => r.status), [201, 201]); assert.deepEqual(same[0].body.data, same[1].body.data)
    const next = await order(1)
    const different = await Promise.all([create(next.line, [{ name: 'Uno' }], 'concurrent-one'), create(next.line, [{ name: 'Dos' }], 'concurrent-two')])
    assert.equal(different.filter(r => r.status === 201).length, 1)
    assert.equal(await prisma.purchaseAllocation.count({ where: { purchaseLineId: next.line.id } }), 1)
  })
  it('06c concurrent operations on different lines cannot duplicate a manufacturer serial', async () => {
    const a = await order(1), b = await order(1)
    const items = [{ name: 'Computadora', serialNumber: 'SERIE-CONCURRENTE' }]
    const results = await Promise.all([create(a.line, items, 'serial-concurrent-a'), create(b.line, items, 'serial-concurrent-b')])
    assert.deepEqual(results.map(r => r.status).sort(), [201, 409])
    assert.equal(await prisma.invItem.count({ where: { companyId: A, serialNumber: 'SERIE-CONCURRENTE' } }), 1)
    assert.equal(await prisma.purchaseAllocation.count({ where: { purchaseLineId: { in: [a.line.id, b.line.id] } } }), 1)
    const otherLine = await order(1)
    assert.equal((await create(otherLine.line, items, results[0].status === 201 ? 'serial-concurrent-a' : 'serial-concurrent-b')).body.code, 'IDEMPOTENCY_KEY_REUSED')
  })
  it('financial invoice lines and legacy callers without an operation key retain their contract', async () => {
    const doc = (await call('POST', '/purchases/invoices', { lines: [{ description: 'Gabinete', quantity: 1, unitAmount: 25 }] })).body.data
    const line = await prisma.purchaseLine.findFirst({ where: { ownerId: doc.id } })
    const res = await create(line, [{ name: 'Gabinete de factura' }])
    assert.equal(res.status, 201, JSON.stringify(res.body))
    assert.equal(await prisma.entityRelation.count({ where: { sourceId: doc.id, targetId: res.body.data[0].id, relationType: 'INVOICED_ITEM' } }), 1)
    assert.equal(Number((await prisma.purchaseAllocation.findFirst({ where: { purchaseLineId: line.id } })).allocatedAmount), 25)
    const stored = await prisma.purchaseInvoice.findUnique({ where: { id: doc.id } })
    assert.equal(stored.status, doc.status); assert.equal(Number(stored.paidAmount), 0)
  })
  it('07 registration leaves formal receipt quantities and document status unchanged', async () => {
    assert.equal((await prisma.purchaseOrder.findUnique({ where: { id: firstOrder.id } })).status, firstOrder.status)
    assert.equal(Number((await prisma.purchaseLine.findUnique({ where: { id: firstLine.id } })).receivedQuantity), 0)
    assert.equal(await prisma.purchaseReceipt.count({ where: { orderId: firstOrder.id } }), 0)
    for (const id of firstItems.map(i => i.id)) assert.equal((await prisma.invItem.findUnique({ where: { id } })).status, 'available')
  })
  it('08 financial allocations retain unit costs and actual receiving remains a separate operation', async () => {
    const allocations = await prisma.purchaseAllocation.findMany({ where: { purchaseLineId: firstLine.id } })
    for (const allocation of allocations) { assert.equal(Number(allocation.unitAmount), 125.5); assert.equal(Number(allocation.allocatedAmount), 125.5) }
    assert.equal((await call('GET', `/purchases/inventory/${firstItems[0].id}/summary`)).body.data.allocatedAmount, 125.5)
    assert.equal((await call('POST', `/purchases/orders/${firstOrder.id}/transition`, { action: 'issue' })).status, 200)
    const received = await call('POST', '/purchases/receipts', { orderId: firstOrder.id, lines: [{ orderLineId: firstLine.id, quantity: 1 }] })
    assert.equal(received.status, 201, JSON.stringify(received.body))
    assert.equal(Number((await prisma.purchaseLine.findUnique({ where: { id: firstLine.id } })).receivedQuantity), 1)
    assert.equal((await prisma.purchaseOrder.findUnique({ where: { id: firstOrder.id } })).status, 'PARTIALLY_RECEIVED')
  })
  it('09 documentary mode keeps existing-item links without financial allocations or invented amounts', async () => {
    assert.equal((await call('PUT', '/purchases/settings', { profile: 'DOCUMENTARY' })).status, 200)
    const inv = createInventoryService({ prisma })
    const item = await inv.createItem({ name: 'Gabinete documental', purchasePrice: 900 }, A, authUserId)
    const doc = (await call('POST', '/purchases/orders', { reference: 'OC documental', lines: [{ description: 'Gabinete' }] })).body.data
    assert.equal((await relate('purchase_order', doc.id, item.id)).status, 201)
    const detail = (await call('GET', `/purchases/orders/${doc.id}`)).body.data
    assert.equal(detail.total, null)
    const line = await prisma.purchaseLine.findFirst({ where: { ownerId: doc.id } })
    assert.equal((await create(line, [{ name: 'No crear' }], 'documentary-block')).body.code, 'DOCUMENTARY_OPERATION_BLOCKED')
    assert.equal(await prisma.purchaseAllocation.count({ where: { targetId: item.id } }), 0)
    assert.equal((await inv.getItem(item.id, A)).purchasePrice, null)
    assert.equal(Number((await prisma.invItem.findUnique({ where: { id: item.id } })).purchasePrice), 900)
    assert.equal((await call('PUT', '/purchases/settings', { preset: 'INVENTORY', economicMode: 'FINANCIAL' })).status, 200)
  })
  it('10 labels and asset numbers still resolve the same individual records', async () => {
    const inv = createInventoryService({ prisma })
    await inv.updateItem(firstItems[0].id, { assetTag: 'RACK-01' }, A, { actorAuthId: authUserId })
    await inv.updateItem(firstItems[1].id, { assetTag: 'RACK-02' }, A, { actorAuthId: authUserId })
    const labelService = createInventoryLabelService({ prisma, publicBaseUrl: 'https://example.test' })
    const rendered = await labelService.render(A, { format: 'zpl', items: firstItems.map(i => ({ itemId: i.id, quantity: 1 })) })
    assert.equal(rendered.labelCount, 2)
    const text = String(rendered.body)
    for (const item of firstItems) {
      const row = await prisma.invItem.findUnique({ where: { id: item.id } })
      assert.equal(text.includes(`/app/p/inv/f-${row.folio}`), true)
    }
    await labelService.registerPrints(A, ACTOR, { items: firstItems.map(i => ({ itemId: i.id, quantity: 1 })) })
    assert.deepEqual((await prisma.invLabelPrint.findMany({ orderBy: { itemId: 'asc' } })).map(r => r.itemId), firstItems.map(i => i.id).sort())
    assert.equal((await inv.getItem(firstItems[0].id, A)).assetTag, 'RACK-01')
    assert.equal((await inv.getItem(firstItems[1].id, A)).assetTag, 'RACK-02')
    assert.notEqual((await inv.getItem(firstItems[0].id, A)).folio, (await inv.getItem(firstItems[1].id, A)).folio)
  })
  it('preserves permission checks, tenant boundaries, duplicate identifiers and catalog validation', async () => {
    const { line } = await order(3)
    const before = await snapshot()
    assert.equal((await create(line, [{ name: 'No autorizado' }], 'no-permission', { permissions: ALL.filter(p => p !== 'inventory.item.create') })).status, 403)
    assert.equal((await create(line, [{ name: 'No autorizado' }], 'no-relation-permission', { permissions: ALL.filter(p => p !== 'purchases.relation.manage') })).status, 403)
    assert.equal((await create(line, [{ name: 'Otra empresa' }], 'other-company', { company: B })).status, 404)
    assert.equal((await create(line, [{ name: 'Catálogo ajeno', categoryId: B }], 'bad-catalog')).status, 404)
    assert.deepEqual(await snapshot(), before)
    assert.equal((await create(line, [{ name: 'Uno', serialNumber: 'SERIE-UNICA' }], 'serial-first')).status, 201)
    const after = await snapshot()
    assert.equal((await create(line, [{ name: 'Dos', serialNumber: 'SERIE-UNICA' }], 'serial-duplicate')).status, 409)
    assert.deepEqual(await snapshot(), after)
  })
})
